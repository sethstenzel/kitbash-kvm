<script lang="ts" setup>
import KbIcon from '@/components/KBKvmController/UI/KbIcon.vue'
import {copy} from '@/components/KBKvmController/utils'
import {onBeforeUnmount, onMounted, ref} from 'vue'
import {eventBus} from '@/utils/event-bus'
import {useSettingsStore} from '@/stores/settings'
import {createWorker, type Worker} from 'tesseract.js'
import {selectArea} from '@/components/KBKvmController/utils/area-selection'
import {
  clientRectToVideoRegion,
  drawVideoRegion,
  getVideoOrientation,
} from '@/components/KBKvmController/utils/video-geometry'
import {isHttpUrl, openScannedUrls} from '@/components/KBKvmController/utils/scan-links'

const settingsStore = useSettingsStore()
const isSelectingArea = ref(false)

const extractUrlsFromText = (text: string): string[] => {
  const matches = text.match(/https?:\/\/[^\s]+/gi) || []
  // OCR'd URLs often end in sentence punctuation
  return matches.map((url) => url.replace(/[.,;:!?)\]}'"]+$/, '')).filter(isHttpUrl)
}

// One Tesseract worker, created on first use and reused across scans
let workerPromise: Promise<Worker> | null = null
const getWorker = () => (workerPromise ??= createWorker('eng'))
const terminateWorker = async () => {
  const pending = workerPromise
  workerPromise = null
  if (pending) {
    try {
      await (await pending).terminate()
    } catch (e) {
      console.warn('Failed to terminate OCR worker:', e)
    }
  }
}

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
      color: '#ff9800',
      hint: 'Select area to extract text (ESC to cancel)',
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
    // Upright and at native resolution, as Tesseract needs
    const canvas = drawVideoRegion(video, getVideoOrientation(settingsStore), region)
    await extractText(canvas)
  } finally {
    isSelectingArea.value = false
    eventBus.emit('scan_end')
  }
}

const extractText = async (canvas: HTMLCanvasElement) => {
  window.$notification({
    type: 'info',
    message: 'Extracting text from image...',
    timeout: 3000,
  })

  try {
    const worker = await getWorker()
    const {
      data: {text},
    } = await worker.recognize(canvas)

    if (text.trim()) {
      await copy(text)
      window.$notification({
        type: 'success',
        message: 'Text extracted and copied to clipboard',
        timeout: 3000,
      })

      if (settingsStore.ocrAutoOpenLinks) {
        openScannedUrls(extractUrlsFromText(text))
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
    // The worker may be unusable after a failure; start fresh next time
    await terminateWorker()
    window.$notification({
      type: 'error',
      message: `Failed to extract text: ${error?.message || error}`,
      timeout: 5000,
    })
  } finally {
    // Dismiss any focus/caret left behind by clipboard or Tesseract operations
    ;(document.activeElement as HTMLElement)?.blur()
  }
}

onMounted(() => {
  eventBus.on('scan_ocr', startScan)
})
onBeforeUnmount(() => {
  eventBus.off('scan_ocr', startScan)
  terminateWorker()
})
</script>

<template>
  <button
    class="btn-ocr-scanner btn-no-style"
    title="Text Extraction (OCR)"
    :class="{active: isSelectingArea}"
    @click="startScan"
  >
    <KbIcon name="ocr" />
  </button>
</template>

<style lang="scss" scoped>
.btn-ocr-scanner {
  &.active {
    color: #ff9800;
  }
}
</style>
