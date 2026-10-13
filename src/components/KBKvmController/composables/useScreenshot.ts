import {type Ref, ref} from 'vue'
import {downloadCanvas, snapVideoImage} from '../utils/index'
import {selectArea} from '../utils/area-selection'
import {
  clientRectToVideoRegion,
  drawVideoRegion,
  getVideoOrientation,
} from '../utils/video-geometry'
import {useSettingsStore} from '@/stores/settings'
import {fileTimestamp} from '@/utils/format-date'

/**
 * Composable for screenshot functionality
 * Captures video frames at native resolution, oriented as displayed, and downloads them
 */
export function useScreenshot(videoRef: Ref<HTMLVideoElement | undefined>) {
  const settingsStore = useSettingsStore()
  const isSelectingArea = ref(false)

  const handleScreenshot = (event?: MouseEvent) => {
    const video = videoRef.value
    if (!video || !video.videoWidth) {
      console.warn('Video element not available for screenshot')
      return
    }

    // Shift+Click selects an area, plain click captures the full frame
    if (event?.shiftKey) {
      captureArea(video)
    } else {
      const canvas = snapVideoImage(video, getVideoOrientation(settingsStore))
      downloadCanvas(canvas, `screenshot_kbkvm_${fileTimestamp()}.png`)
    }
  }

  const captureArea = async (video: HTMLVideoElement) => {
    if (isSelectingArea.value) return
    isSelectingArea.value = true
    try {
      const rect = await selectArea(video, {
        color: '#00ff00',
        hint: 'Click and drag to select area (ESC to cancel)',
      })
      if (!rect) return
      const region = clientRectToVideoRegion(video, rect.x1, rect.y1, rect.x2, rect.y2)
      if (!region) {
        window.$notification({type: 'warning', message: 'Selection is outside the video', timeout: 3000})
        return
      }
      const canvas = drawVideoRegion(video, getVideoOrientation(settingsStore), region)
      downloadCanvas(canvas, `screenshot_area_kbkvm_${fileTimestamp()}.png`)
    } finally {
      isSelectingArea.value = false
    }
  }

  return {
    handleScreenshot,
    isSelectingArea,
  }
}
