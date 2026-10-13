/**
 * Mapping between what the user sees on screen and pixels of the source video frame.
 *
 * Display chain (see useVideoFilters / index.vue):
 *   .video-wrapper  -> CSS rotate(r) [scale(s)] about its center
 *     <video>       -> mirror via rotateX/rotateY(180deg) about its center, then object-fit
 * Inverting the computed CSS transforms keeps this correct mid-transition and in every fit mode.
 */

export interface IVideoOrientation {
  rotation: number // degrees, CSS rotate() direction (clockwise)
  flipH: boolean
  flipV: boolean
}

export interface IVideoRegion {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Orientation from the persisted settings.
 * Note the naming: filterMirrorX applies rotateX(180deg), which flips vertically;
 * filterMirrorY applies rotateY(180deg), which flips horizontally.
 */
export const getVideoOrientation = (settings: {
  filterRotation?: number
  filterMirrorX?: boolean
  filterMirrorY?: boolean
}): IVideoOrientation => ({
  rotation: settings.filterRotation || 0,
  flipH: !!settings.filterMirrorY,
  flipV: !!settings.filterMirrorX,
})

const computedMatrix = (el: Element) => {
  const transform = getComputedStyle(el).transform
  return !transform || transform === 'none' ? new DOMMatrix() : new DOMMatrix(transform)
}

/** Undo `el`'s own CSS transform (origin: center) for a point given relative to its visual center */
const untransformFromCenter = (el: Element, dx: number, dy: number) =>
  computedMatrix(el).inverse().transformPoint(new DOMPoint(dx, dy))

/** Rectangle the video content occupies inside its element box, per object-fit (position 50% 50%) */
export const getContentRect = (
  boxW: number,
  boxH: number,
  videoW: number,
  videoH: number,
  fit: string
): IVideoRegion => {
  let sx: number
  let sy: number
  switch (fit) {
    case 'fill':
      sx = boxW / videoW
      sy = boxH / videoH
      break
    case 'cover':
      sx = sy = Math.max(boxW / videoW, boxH / videoH)
      break
    case 'none':
      sx = sy = 1
      break
    case 'scale-down':
      sx = sy = Math.min(1, boxW / videoW, boxH / videoH)
      break
    default: // contain
      sx = sy = Math.min(boxW / videoW, boxH / videoH)
  }
  const w = videoW * sx
  const h = videoH * sy
  return {x: (boxW - w) / 2, y: (boxH - h) / 2, w, h}
}

/**
 * Map a client (viewport) point to normalized coordinates of the source video frame.
 * (0,0) is the frame's top-left, (1,1) its bottom-right; values outside [0,1] are off-frame.
 * The video's parent element must be the rotated wrapper.
 */
export const clientToVideoNormalized = (
  video: HTMLVideoElement,
  clientX: number,
  clientY: number
): {x: number; y: number} | null => {
  const wrapper = video.parentElement
  if (!wrapper || !video.videoWidth || !video.videoHeight) {
    return null
  }

  // Into the wrapper's untransformed box
  const wrapperRect = wrapper.getBoundingClientRect()
  const pw = untransformFromCenter(
    wrapper,
    clientX - (wrapperRect.left + wrapperRect.width / 2),
    clientY - (wrapperRect.top + wrapperRect.height / 2)
  )
  const wx = pw.x + wrapper.offsetWidth / 2
  const wy = pw.y + wrapper.offsetHeight / 2

  // Into the video's untransformed box (undoes mirroring)
  const vw = video.offsetWidth
  const vh = video.offsetHeight
  // Hidden (v-show) or not laid out yet
  if (!vw || !vh) {
    return null
  }
  const pv = untransformFromCenter(
    video,
    wx - (video.offsetLeft + vw / 2),
    wy - (video.offsetTop + vh / 2)
  )
  const lx = pv.x + vw / 2
  const ly = pv.y + vh / 2

  // Into the frame, accounting for object-fit letterboxing/cropping
  const content = getContentRect(
    vw,
    vh,
    video.videoWidth,
    video.videoHeight,
    getComputedStyle(video).objectFit
  )
  if (!content.w || !content.h) {
    return null
  }
  return {x: (lx - content.x) / content.w, y: (ly - content.y) / content.h}
}

/** Map a screen-space movement (e.g. pointer-lock movementX/Y) into source-frame direction */
export const screenDeltaToVideo = (dx: number, dy: number, orientation: IVideoOrientation) => {
  const rad = (-orientation.rotation * Math.PI) / 180
  const cos = Math.round(Math.cos(rad) * 1e6) / 1e6
  const sin = Math.round(Math.sin(rad) * 1e6) / 1e6
  let x = dx * cos - dy * sin
  let y = dx * sin + dy * cos
  if (orientation.flipH) x = -x
  if (orientation.flipV) y = -y
  return {x, y}
}

/** Source-frame pixel region covered by a screen rectangle given by two client corners */
export const clientRectToVideoRegion = (
  video: HTMLVideoElement,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): IVideoRegion | null => {
  const a = clientToVideoNormalized(video, x1, y1)
  const b = clientToVideoNormalized(video, x2, y2)
  if (!a || !b) {
    return null
  }
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  const left = Math.round(clamp(Math.min(a.x, b.x)) * video.videoWidth)
  const right = Math.round(clamp(Math.max(a.x, b.x)) * video.videoWidth)
  const top = Math.round(clamp(Math.min(a.y, b.y)) * video.videoHeight)
  const bottom = Math.round(clamp(Math.max(a.y, b.y)) * video.videoHeight)
  if (right - left < 1 || bottom - top < 1) {
    return null
  }
  return {x: left, y: top, w: right - left, h: bottom - top}
}

/**
 * Draw a region of the source frame (default: whole frame) at native resolution,
 * rotated/flipped so it looks the way it is displayed.
 */
export const drawVideoRegion = (
  video: HTMLVideoElement,
  orientation: IVideoOrientation,
  region?: IVideoRegion | null
): HTMLCanvasElement => {
  const r = region ?? {x: 0, y: 0, w: video.videoWidth, h: video.videoHeight}
  const quarterTurn = Math.abs(orientation.rotation) % 180 === 90
  const canvas = document.createElement('canvas')
  canvas.width = quarterTurn ? r.h : r.w
  canvas.height = quarterTurn ? r.w : r.h
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((orientation.rotation * Math.PI) / 180)
  ctx.scale(orientation.flipH ? -1 : 1, orientation.flipV ? -1 : 1)
  ctx.drawImage(video, r.x, r.y, r.w, r.h, -r.w / 2, -r.h / 2, r.w, r.h)
  return canvas
}
