export interface IClientRectCorners {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface ISelectAreaOptions {
  // Accent color of the selection box and cursor
  color: string
  hint: string
  // Dim everything outside the selection while dragging (otherwise the whole target stays dimmed)
  spotlight?: boolean
  // Fade the hint out after this many ms (0 = keep it until the drag starts)
  hintTimeout?: number
}

// Selections smaller than this (in CSS px, either side) are treated as a cancel
const MIN_SIZE = 10

let active = false

/**
 * Let the user drag a rectangle over `target`.
 * Resolves with the selection's client-space corners, or null if cancelled (Esc / too small).
 */
export const selectArea = (
  target: HTMLElement,
  options: ISelectAreaOptions
): Promise<IClientRectCorners | null> => {
  if (active) {
    return Promise.resolve(null)
  }
  active = true

  return new Promise((resolve) => {
    const {color, hint: hintText, spotlight = false, hintTimeout = 0} = options

    // The target may be rotated or larger than the viewport; cover its visible bounding box
    const targetRect = target.getBoundingClientRect()
    const left = Math.max(0, targetRect.left)
    const top = Math.max(0, targetRect.top)
    const right = Math.min(window.innerWidth, targetRect.right)
    const bottom = Math.min(window.innerHeight, targetRect.bottom)

    const cursorColor = encodeURIComponent(color)
    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: fixed;
      top: ${top}px;
      left: ${left}px;
      width: ${Math.max(0, right - left)}px;
      height: ${Math.max(0, bottom - top)}px;
      background: rgba(0, 0, 0, 0.5);
      cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="white" stroke-width="4" d="M12 2v20M2 12h20"/><path fill="none" stroke="${cursorColor}" stroke-width="2" d="M12 2v20M2 12h20"/></svg>') 12 12, crosshair;
      z-index: 9999;
      user-select: none;
    `

    const selectionBox = document.createElement('div')
    selectionBox.style.cssText = `
      position: absolute;
      border: 2px solid ${color};
      display: none;
      pointer-events: none;
      box-sizing: border-box;
    `
    // White hairline keeps dark accent colors (e.g. the logo navy) visible on dark video
    const hairline = '0 0 0 1px rgba(255, 255, 255, 0.75)'
    if (spotlight) {
      selectionBox.style.background = 'transparent'
      selectionBox.style.boxShadow = `${hairline}, 0 0 0 9999px rgba(0, 0, 0, 0.5), 0 0 10px ${color}`
    } else {
      selectionBox.style.background = `color-mix(in srgb, ${color} 18%, transparent)`
      selectionBox.style.boxShadow = `${hairline}, 0 0 10px ${color}`
    }

    const hint = document.createElement('div')
    hint.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      background: rgba(0, 0, 0, 0.7);
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      pointer-events: none;
      white-space: nowrap;
      transition: opacity 0.5s ease;
    `
    hint.textContent = hintText
    const hintTimer = hintTimeout ? setTimeout(() => (hint.style.opacity = '0'), hintTimeout) : 0

    overlay.appendChild(selectionBox)
    overlay.appendChild(hint)
    document.body.appendChild(overlay)

    let startX = 0
    let startY = 0
    let isDragging = false

    // Client point clamped to the overlay
    const clampPoint = (e: MouseEvent) => ({
      x: Math.min(right, Math.max(left, e.clientX)),
      y: Math.min(bottom, Math.max(top, e.clientY)),
    })

    const drawBox = (x: number, y: number) => {
      selectionBox.style.left = Math.min(startX, x) - left + 'px'
      selectionBox.style.top = Math.min(startY, y) - top + 'px'
      selectionBox.style.width = Math.abs(x - startX) + 'px'
      selectionBox.style.height = Math.abs(y - startY) + 'px'
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      hint.style.display = 'none'
      if (spotlight) {
        overlay.style.background = 'transparent'
      }
      isDragging = true
      const p = clampPoint(e)
      startX = p.x
      startY = p.y
      drawBox(p.x, p.y)
      selectionBox.style.display = 'block'
    }

    // Tracked on the window so a drag released outside the overlay still completes
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return
      const p = clampPoint(e)
      drawBox(p.x, p.y)
    }

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDragging) return
      isDragging = false
      const p = clampPoint(e)
      const big = Math.abs(p.x - startX) > MIN_SIZE && Math.abs(p.y - startY) > MIN_SIZE
      finish(big ? {x1: startX, y1: startY, x2: p.x, y2: p.y} : null)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Keep Esc from also reaching the KVM input / video-only mode handlers
        e.preventDefault()
        e.stopImmediatePropagation()
        finish(null)
      }
    }

    const finish = (result: IClientRectCorners | null) => {
      overlay.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('keydown', handleKeyDown, true)
      clearTimeout(hintTimer)
      overlay.remove()
      active = false
      resolve(result)
    }

    overlay.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('keydown', handleKeyDown, true)
  })
}
