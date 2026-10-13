<script lang="ts" setup>
import KbIcon from '@/components/KBKvmController/UI/KbIcon.vue'
import jsQR from 'jsqr'
import {copy} from '@/components/KBKvmController/utils'
import {onBeforeUnmount, onMounted, ref} from 'vue'
import {eventBus} from '@/utils/event-bus'
import {useSettingsStore} from '@/stores/settings'
import {selectArea} from '@/components/KBKvmController/utils/area-selection'
import {
  clientRectToVideoRegion,
  drawVideoRegion,
  getVideoOrientation,
} from '@/components/KBKvmController/utils/video-geometry'
import {isHttpUrl, openScannedUrls} from '@/components/KBKvmController/utils/scan-links'

const settingsStore = useSettingsStore()
const isSelectingArea = ref(false)

const startScan = async () => {
  const video = document.querySelector('#streamVideo') as HTMLVideoElement | null
  if (!video || !video.videoWidth) {
    window.$notification({
      type: 'error',
      message: 'Video element not available',
      timeout: 3000,
    })
    return
  }
  if (isSelectingArea.value) return

  isSelectingArea.value = true
  eventBus.emit('scan_start')
  try {
    const rect = await selectArea(video, {
      color: '#00ffff',
      hint: 'Select area to scan for QR code (ESC to cancel)',
      spotlight: true,
      hintTimeout: 2000,
    })
    isSelectingArea.value = false
    if (!rect) return
    const region = clientRectToVideoRegion(video, rect.x1, rect.y1, rect.x2, rect.y2)
    if (!region) {
      window.$notification({type: 'warning', message: 'Selection is outside the video', timeout: 3000})
      return
    }
    await scanCanvas(drawVideoRegion(video, getVideoOrientation(settingsStore), region))
  } finally {
    isSelectingArea.value = false
    eventBus.emit('scan_end')
  }
}

const scanCanvas = async (canvas: HTMLCanvasElement) => {
  try {
    const ctx = canvas.getContext('2d')!
    const {data, width, height} = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const res = jsQR(data, width, height, {inversionAttempts: 'attemptBoth'})

    if (res?.data) {
      await copy(res.data)
      window.$notification({
        type: 'success',
        message: 'QR code scanned and copied to clipboard',
        timeout: 3000,
      })

      if (settingsStore.qrAutoOpenLinks && isHttpUrl(res.data)) {
        openScannedUrls([res.data])
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
      type: 'error',
      message: `QR scan failed: ${error?.message || error}`,
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
    <KbIcon name="qr-scan" />
  </button>
</template>

<style lang="scss" scoped>
.btn-qr-scanner {
  &.active {
    color: #00ffff;
  }
}
</style>
