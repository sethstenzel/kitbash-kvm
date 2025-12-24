<script lang="ts" setup>
import QrcodeDecoder from '@/components/KBKvmController/utils/qrcode-decoder'
import {copy} from '@/components/KBKvmController/utils'
import {onBeforeUnmount, onMounted, ref} from 'vue'
import {eventBus} from '@/utils/event-bus'
import {useSettingsStore} from '@/stores/settings'

const settingsStore = useSettingsStore()
const isSelectingArea = ref(false)

const isValidUrl = (string: string): boolean => {
  try {
    const url = new URL(string)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch (_) {
    return false
  }
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
  overlay.className = 'qr-selection-overlay'
  overlay.style.cssText = `
    position: fixed;
    top: ${videoRect.top}px;
    left: ${videoRect.left}px;
    width: ${videoRect.width}px;
    height: ${videoRect.height}px;
    background: rgba(0, 0, 0, 0.5);
    cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="%2300ffff" stroke-width="2" d="M12 2v20M2 12h20"/></svg>') 12 12, crosshair;
    z-index: 9999;
  `

  const selectionBox = document.createElement('div')
  selectionBox.className = 'qr-selection-box'
  selectionBox.style.cssText = `
    position: absolute;
    border: 2px solid #00ffff;
    background: rgba(0, 255, 255, 0.1);
    display: none;
    box-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
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
  hint.textContent = 'Select area to scan for QR code (ESC to cancel)'

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
      scanAreaForQRCode(video, x, y, width, height, videoRect)
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

const scanAreaForQRCode = async (
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

  // Show scanning notification
  window.$notification({
    type: 'info',
    message: 'Scanning for QR code...',
    timeout: 2000,
  })

  try {
    // Create a temporary image element from canvas
    const imageData = canvas.toDataURL('image/png')
    const img = new Image()
    img.src = imageData

    await new Promise((resolve) => {
      img.onload = resolve
    })

    const qr = new QrcodeDecoder()
    const res = await qr.decodeFromImage(img)
    console.log('QR scan result:', res)

    if (res && res.data) {
      await copy(res.data)
      window.$notification({
        type: 'success',
        message: 'QR code scanned and copied to clipboard',
        timeout: 3000,
      })

      // Check if auto-open links is enabled and the data is a valid URL
      if (settingsStore.qrAutoOpenLinks && isValidUrl(res.data)) {
        window.open(res.data, '_blank')
        window.$notification({
          type: 'success',
          message: 'QR code link opened in new tab',
          timeout: 3000,
        })
      }
    } else {
      window.$notification({
        type: 'warning',
        message: 'No QR code found in selected area',
        timeout: 3000,
      })
    }
  } catch (error: any) {
    console.error('QR scan error:', error)
    window.$notification({
      type: 'warning',
      message: 'No QR code found or scanning failed',
      timeout: 3000,
    })
  }
}

onMounted(() => {
  eventBus.on('scan_qr', startScan)
})
onBeforeUnmount(() => {
  eventBus.off('scan_qr', startScan)
})
</script>

<template>
  <button
    class="btn-qr-scanner btn-no-style"
    title="QR Code Scanner"
    :class="{active: isSelectingArea}"
    @click="startScan"
  >
    <span class="mdi mdi-qrcode-scan"></span>
  </button>
</template>

<style lang="scss" scoped>
.btn-qr-scanner {
  &.active {
    color: #00ffff;
  }
}
</style>
