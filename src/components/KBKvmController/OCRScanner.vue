<script lang="ts" setup>
import {copy} from '@/components/KBKvmController/utils'
import {onBeforeUnmount, onMounted, ref} from 'vue'
import {eventBus} from '@/utils/event-bus'
import {useSettingsStore} from '@/stores/settings'
import {createWorker} from 'tesseract.js'

const settingsStore = useSettingsStore()
const isSelectingArea = ref(false)

const extractUrlsFromText = (text: string): string[] => {
  // Match http(s) URLs
  const urlRegex = /https?:\/\/[^\s]+/gi
  const matches = text.match(urlRegex)
  return matches || []
}

const startScan = () => {
  const video = document.querySelector('#streamVideo') as HTMLVideoElement
  if (!video) {
    window.$notification({
      type: 'error',
      message: 'Video element not available',
      timeout: 3000,
    })
    return
  }

  if (isSelectingArea.value) return

  startAreaSelection(video)
}

const startAreaSelection = (video: HTMLVideoElement) => {
  isSelectingArea.value = true
  const videoRect = video.getBoundingClientRect()

  // Create overlay
  const overlay = document.createElement('div')
  overlay.className = 'ocr-selection-overlay'
  overlay.style.cssText = `
    position: fixed;
    top: ${videoRect.top}px;
    left: ${videoRect.left}px;
    width: ${videoRect.width}px;
    height: ${videoRect.height}px;
    background: rgba(0, 0, 0, 0.5);
    cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="%23ff9800" stroke-width="2" d="M12 2v20M2 12h20"/></svg>') 12 12, crosshair;
    z-index: 9999;
  `

  const selectionBox = document.createElement('div')
  selectionBox.className = 'ocr-selection-box'
  selectionBox.style.cssText = `
    position: absolute;
    border: 2px solid #ff9800;
    background: rgba(255, 152, 0, 0.1);
    display: none;
    box-shadow: 0 0 10px rgba(255, 152, 0, 0.5);
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
  hint.textContent = 'Select area to extract text (ESC to cancel)'

  overlay.appendChild(selectionBox)
  overlay.appendChild(hint)
  document.body.appendChild(overlay)

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

    // Only scan if selection is large enough
    if (width > 10 && height > 10) {
      extractTextFromArea(video, x, y, width, height, videoRect)
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
  }

  overlay.addEventListener('mousedown', handleMouseDown)
  overlay.addEventListener('mousemove', handleMouseMove)
  overlay.addEventListener('mouseup', handleMouseUp)
  document.addEventListener('keydown', handleKeyDown)
}

const extractTextFromArea = async (
  video: HTMLVideoElement,
  x: number,
  y: number,
  width: number,
  height: number,
  videoRect: DOMRect
) => {
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
  ctx.drawImage(video, videoX, videoY, videoWidth, videoHeight, 0, 0, videoWidth, videoHeight)

  // Show processing notification
  window.$notification({
    type: 'info',
    message: 'Extracting text from image...',
    timeout: 3000,
  })

  try {
    // Create Tesseract worker
    const worker = await createWorker('eng')
    const imageData = canvas.toDataURL('image/png')

    // Perform OCR
    const {
      data: {text},
    } = await worker.recognize(imageData)
    await worker.terminate()

    console.log('Extracted text:', text)

    // Copy text to clipboard
    if (text.trim()) {
      await copy(text)
      window.$notification({
        type: 'success',
        message: 'Text extracted and copied to clipboard',
        timeout: 3000,
      })

      // Check if auto-open URLs is enabled
      if (settingsStore.ocrAutoOpenLinks) {
        const urls = extractUrlsFromText(text)
        if (urls.length > 0) {
          urls.forEach((url) => {
            window.open(url, '_blank')
          })
          window.$notification({
            type: 'success',
            message: `Opened ${urls.length} URL(s) from extracted text`,
            timeout: 3000,
          })
        }
      }
    } else {
      window.$notification({
        type: 'warning',
        message: 'No text found in selected area',
        timeout: 3000,
      })
    }
  } catch (error: any) {
    console.error('OCR error:', error)
    window.$notification({
      type: 'error',
      message: `Failed to extract text: ${error.message}`,
      timeout: 5000,
    })
  }
}

onMounted(() => {
  eventBus.on('scan_ocr', startScan)
})
onBeforeUnmount(() => {
  eventBus.off('scan_ocr', startScan)
})
</script>

<template>
  <button
    class="btn-ocr-scanner btn-no-style"
    title="Text Extraction (OCR)"
    :class="{active: isSelectingArea}"
    @click="startScan"
  >
    <span class="mdi mdi-text-recognition"></span>
  </button>
</template>

<style lang="scss" scoped>
.btn-ocr-scanner {
  &.active {
    color: #ff9800;
  }
}
</style>
