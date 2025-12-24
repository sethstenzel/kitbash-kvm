import {ref, onMounted, type Ref} from 'vue'
import {VideoRecorder} from '../utils/video-recorder'

/**
 * Composable for video recording functionality
 * Manages VideoRecorder lifecycle
 */
export function useVideoRecording(videoRef: Ref<HTMLVideoElement | undefined>) {
  const videoRecorder = ref<VideoRecorder | null>(null)

  onMounted(() => {
    if (videoRef.value) {
      videoRecorder.value = new VideoRecorder(videoRef.value)
    }
  })

  return {
    videoRecorder,
  }
}
