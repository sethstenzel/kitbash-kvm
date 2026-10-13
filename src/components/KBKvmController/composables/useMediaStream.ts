import {ref, shallowRef, computed, type Ref} from 'vue'
import {useSettingsStore} from '@/stores/settings'

export interface IStreamInfo {
  width: number
  height: number
  aspectRatio: number
  frameRate?: number
}

/**
 * Mode requested when the user hasn't picked one for this device.
 * Constraints are `ideal`, so the browser snaps to the closest mode the capture card
 * actually supports (e.g. 1080p30 on MS2109 cards, 1080p60 on MS2130, 720p on older cards).
 * Without explicit width/height Chrome falls back to its 640x480 default.
 */
export const DEFAULT_VIDEO_MODE = {width: 1920, height: 1080, frameRate: 60}

interface UseMediaStreamOptions {
  videoRef: Ref<HTMLVideoElement | undefined>
  videoDeviceList: Ref<Array<{label: string; deviceId: string}>>
  audioDeviceList: Ref<Array<{label: string; deviceId: string}>>
  onStreamStarted?: (info: IStreamInfo) => void
  onCapabilitiesQuery?: (videoTrack: MediaStreamTrack) => void
}

/**
 * Composable for managing media streams
 * Handles stream lifecycle, configuration, and device switching
 */
export function useMediaStream(options: UseMediaStreamOptions) {
  const {videoRef, videoDeviceList, audioDeviceList, onStreamStarted, onCapabilitiesQuery} =
    options

  const settingsStore = useSettingsStore()

  // State
  const mediaStreamRef = shallowRef<MediaStream>()
  const loadingText = ref('')
  // Selected capture device is unplugged; resume when it reappears. Any stop clears it, so a
  // stream the user stopped (or switched away from) isn't restarted by an unrelated device change.
  const waitingForVideoDevice = ref(false)

  // Computed
  const isStreaming = computed(() => {
    return Boolean(mediaStreamRef.value)
  })

  /**
   * Build video constraints: the user's chosen mode for this device, otherwise DEFAULT_VIDEO_MODE.
   */
  const buildVideoConstraints = (deviceId: string): MediaTrackConstraints => {
    const saved = settingsStore.videoConfig
    if (saved?.userSelected && saved.deviceId === deviceId && saved.width && saved.height) {
      return {
        deviceId: {exact: deviceId},
        width: {ideal: saved.width},
        height: {ideal: saved.height},
        frameRate: {ideal: saved.frameRate ?? DEFAULT_VIDEO_MODE.frameRate},
      }
    }
    return {
      deviceId: {exact: deviceId},
      width: {ideal: DEFAULT_VIDEO_MODE.width},
      height: {ideal: DEFAULT_VIDEO_MODE.height},
      frameRate: {ideal: DEFAULT_VIDEO_MODE.frameRate},
      // Prefer the card's native modes over Chrome's crop-and-scale so text stays sharp.
      // Not in TS's lib.dom yet; ignored by browsers that don't support it.
      resizeMode: 'none',
    } as MediaTrackConstraints
  }

  /**
   * Start media stream with current device configuration
   */
  const startMediaStream = async () => {
    const videoId = settingsStore.currentVideoDeviceId
    const audioId = settingsStore.currentAudioDeviceId
    if (!videoId) {
      return
    }

    try {
      loadingText.value = 'Starting MediaStream...'

      // Keep the selection when the device is missing so it resumes when plugged back in
      if (!videoDeviceList.value.some((device) => device.deviceId === videoId)) {
        throw new Error('Selected video device is not connected')
      }

      // A missing audio device keeps its selection (it often unplugs with the capture card) and
      // is added back by the device-change handler when it reappears
      const audioAvailable =
        !!audioId && audioDeviceList.value.some((device) => device.deviceId === audioId)
      if (audioId && !audioAvailable) {
        console.warn('[startMediaStream] Selected audio device not connected, starting video only')
      }

      const audio: MediaTrackConstraints | false = audioAvailable
        ? {
            deviceId: audioId,
            autoGainControl: false,
            echoCancellation: false,
            noiseSuppression: false,
          }
        : false
      const video = buildVideoConstraints(videoId)
      console.log('[startMediaStream] getUserMedia constraints:', {audio, video})

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({audio, video})
      } catch (error: any) {
        if (!audio) {
          throw error
        }
        // A busy/broken audio device shouldn't prevent video from starting
        console.warn('[startMediaStream] getUserMedia with audio failed, retrying video only:', error)
        stream = await navigator.mediaDevices.getUserMedia({audio: false, video})
        window.$notification({
          type: 'warning',
          message: `Audio device unavailable (${error.name}), started video only`,
          timeout: 5000,
        })
      }

      const videoTrack = stream.getVideoTracks()[0]
      const trackSettings = videoTrack?.getSettings() ?? {}
      console.log('[startMediaStream] Track settings:', trackSettings)

      // Some browsers have ignored the exact deviceId constraint and returned another camera
      if (trackSettings.deviceId && trackSettings.deviceId !== videoId) {
        stream.getTracks().forEach((t) => t.stop())
        throw new Error('Browser returned wrong camera. Requested device not available.')
      }

      mediaStreamRef.value = stream

      const videoEl = videoRef.value
      if (!videoEl) {
        console.error('[startMediaStream] Video element not found')
        return
      }

      videoEl.srcObject = stream
      videoEl.onloadedmetadata = () => {
        videoEl.play()

        const settings = videoTrack.getSettings()
        const info: IStreamInfo = {
          width: videoEl.videoWidth,
          height: videoEl.videoHeight,
          aspectRatio: parseFloat((videoEl.videoWidth / videoEl.videoHeight).toFixed(4)),
          frameRate: settings.frameRate,
        }
        onStreamStarted?.(info)

        const videoDeviceName =
          videoDeviceList.value.find((d) => d.deviceId === videoId)?.label || 'Camera'
        const fps = settings.frameRate ? Math.round(settings.frameRate) : '?'
        window.$notification({
          type: 'success',
          message: `${videoDeviceName} connected\n${info.width}x${info.height} @${fps} fps`,
          timeout: 8000,
        })

        // Query camera capabilities for settings UI
        if (onCapabilitiesQuery) {
          onCapabilitiesQuery(videoTrack)
        }
      }
    } catch (error: any) {
      console.error('[startMediaStream] Failed:', error)
      window.$notification({
        type: 'error',
        message: error.message,
        timeout: 5000,
      })
    } finally {
      loadingText.value = ''
    }
  }

  /**
   * Handle camera/audio device switching
   */
  const handleStartStreaming = async () => {
    try {
      loadingText.value = 'Switching camera...'

      // A saved mode only applies to the device it was chosen for
      if (
        settingsStore.videoConfig &&
        settingsStore.videoConfig.deviceId !== settingsStore.currentVideoDeviceId
      ) {
        settingsStore.videoConfig = null
      }

      stopMediaStreaming()

      // Small delay to ensure the device is released before reopening it
      await new Promise((resolve) => setTimeout(resolve, 100))

      await startMediaStream()
    } catch (error: any) {
      console.error('[handleStartStreaming] Failed:', error)
      window.$notification({
        type: 'error',
        message: `Failed to switch camera: ${error.message}`,
        timeout: 5000,
      })
    } finally {
      loadingText.value = ''
    }
  }

  /**
   * Stop video/audio streaming
   */
  const stopMediaStreaming = () => {
    waitingForVideoDevice.value = false
    mediaStreamRef.value?.getTracks().forEach((track) => track.stop())

    const video = videoRef.value
    if (video) {
      video.srcObject = null
      video.pause()
      video.onloadedmetadata = null
    }

    mediaStreamRef.value = undefined
  }

  /**
   * Clear selected devices
   */
  const clearSelect = () => {
    stopMediaStreaming()
    settingsStore.currentVideoDeviceId = ''
    settingsStore.currentAudioDeviceId = ''
    settingsStore.videoConfig = null

    window.$notification({
      type: 'info',
      message: 'All media devices cleared',
      description: 'Camera and microphone selections have been reset',
      timeout: 3000,
    })
  }

  return {
    // State
    mediaStreamRef,
    loadingText,
    isStreaming,
    waitingForVideoDevice,

    // Methods
    startMediaStream,
    handleStartStreaming,
    stopMediaStreaming,
    clearSelect,
  }
}
