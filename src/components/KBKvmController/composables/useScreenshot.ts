import {type Ref, ref} from 'vue'
import {downloadUrl, snapVideoImage} from '../utils/index'
import moment from 'moment/moment'

/**
 * Composable for screenshot functionality
 * Captures video frames and downloads them
 */
export function useScreenshot(videoRef: Ref<HTMLVideoElement | undefined>) {
  const isSelectingArea = ref(false)
  const selectionOverlay = ref<HTMLDivElement | null>(null)

  const handleScreenshot = (event?: MouseEvent) => {
    if (!videoRef.value) {
      console.warn('Video element not available for screenshot')
      return
    }

    // Check if Shift key is held for area selection
    if (event?.shiftKey) {
      startAreaSelection()
    } else {
      // No modifier key - full screenshot
      takeFullScreenshot()
    }
  }

  const takeFullScreenshot = () => {
    if (!videoRef.value) return
    const url = snapVideoImage(videoRef.value)
    downloadUrl(url, `screenshot_kbkvm_${moment().format('YYYY-MM-DD_HH-mm-ss')}.png`)
  }

  const startAreaSelection = () => {
    if (!videoRef.value || isSelectingArea.value) return

    isSelectingArea.value = true
    const video = videoRef.value
    const videoRect = video.getBoundingClientRect()

    // Create overlay
    const overlay = document.createElement('div')
    overlay.className = 'screenshot-selection-overlay'
    overlay.style.cssText = `
      position: fixed;
      top: ${videoRect.top}px;
      left: ${videoRect.left}px;
      width: ${videoRect.width}px;
      height: ${videoRect.height}px;
      background: rgba(0, 0, 0, 0.5);
      cursor: crosshair;
      z-index: 9999;
    `

    const selectionBox = document.createElement('div')
    selectionBox.className = 'screenshot-selection-box'
    selectionBox.style.cssText = `
      position: absolute;
      border: 2px solid #00ff00;
      background: rgba(0, 255, 0, 0.1);
      display: none;
      box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
    `

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
    `
    hint.textContent = 'Click and drag to select area (ESC to cancel)'

    overlay.appendChild(selectionBox)
    overlay.appendChild(hint)
    document.body.appendChild(overlay)
    selectionOverlay.value = overlay

    let startX = 0
    let startY = 0
    let isDragging = false

    const handleMouseDown = (e: MouseEvent) => {
      hint.style.display = 'none'
      isDragging = true
      const rect = overlay.getBoundingClientRect()
      startX = e.clientX - rect.left
      startY = e.clientY - rect.top
      selectionBox.style.left = startX + 'px'
      selectionBox.style.top = startY + 'px'
      selectionBox.style.width = '0px'
      selectionBox.style.height = '0px'
      selectionBox.style.display = 'block'
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return
      const rect = overlay.getBoundingClientRect()
      const currentX = e.clientX - rect.left
      const currentY = e.clientY - rect.top

      const width = currentX - startX
      const height = currentY - startY

      if (width < 0) {
        selectionBox.style.left = currentX + 'px'
        selectionBox.style.width = Math.abs(width) + 'px'
      } else {
        selectionBox.style.width = width + 'px'
      }

      if (height < 0) {
        selectionBox.style.top = currentY + 'px'
        selectionBox.style.height = Math.abs(height) + 'px'
      } else {
        selectionBox.style.height = height + 'px'
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDragging) return
      isDragging = false

      const rect = overlay.getBoundingClientRect()
      const endX = e.clientX - rect.left
      const endY = e.clientY - rect.top

      const x = Math.min(startX, endX)
      const y = Math.min(startY, endY)
      const width = Math.abs(endX - startX)
      const height = Math.abs(endY - startY)

      // Only capture if selection is large enough
      if (width > 10 && height > 10) {
        captureArea(x, y, width, height, videoRect)
      }

      cleanup()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup()
      }
    }

    const cleanup = () => {
      overlay.removeEventListener('mousedown', handleMouseDown)
      overlay.removeEventListener('mousemove', handleMouseMove)
      overlay.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.removeChild(overlay)
      isSelectingArea.value = false
      selectionOverlay.value = null
    }

    overlay.addEventListener('mousedown', handleMouseDown)
    overlay.addEventListener('mousemove', handleMouseMove)
    overlay.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('keydown', handleKeyDown)
  }

  const captureArea = (x: number, y: number, width: number, height: number, videoRect: DOMRect) => {
    if (!videoRef.value) return

    const video = videoRef.value
    const canvas = document.createElement('canvas')

    // Calculate the scale between video element display size and actual video size
    const scaleX = video.videoWidth / videoRect.width
    const scaleY = video.videoHeight / videoRect.height

    // Scale the selection coordinates to video dimensions
    const videoX = x * scaleX
    const videoY = y * scaleY
    const videoWidth = width * scaleX
    const videoHeight = height * scaleY

    canvas.width = videoWidth
    canvas.height = videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Draw the selected area from the video
    ctx.drawImage(
      video,
      videoX,
      videoY,
      videoWidth,
      videoHeight,
      0,
      0,
      videoWidth,
      videoHeight
    )

    const url = canvas.toDataURL('image/png')
    downloadUrl(url, `screenshot_area_kbkvm_${moment().format('YYYY-MM-DD_HH-mm-ss')}.png`)
  }

  return {
    handleScreenshot,
    isSelectingArea,
  }
}
