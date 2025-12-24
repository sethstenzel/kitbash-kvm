import {ref, shallowRef, computed, type Ref} from 'vue'
import {useSettingsStore, type IVideoConfig} from '@/stores/settings'

interface UseMediaStreamOptions {
  videoRef: Ref<HTMLVideoElement | undefined>
  videoDeviceList: Ref<Array<{label: string; deviceId: string}>>
  audioDeviceList: Ref<Array<{label: string; deviceId: string}>>
  onStreamStarted?: (info: {width: number; height: number; aspectRatio: number}) => void
  onCapabilitiesQuery?: (videoTrack: MediaStreamTrack) => void
  showDeviceInfoTemporarily?: () => void
}

/**
 * Composable for managing media streams
 * Handles stream lifecycle, configuration, and device switching
 */
export function useMediaStream(options: UseMediaStreamOptions) {
  const {
    videoRef,
    videoDeviceList,
    audioDeviceList,
    onStreamStarted,
    onCapabilitiesQuery,
    showDeviceInfoTemporarily,
  } = options

  const settingsStore = useSettingsStore()

  // State
  const mediaStreamRef = shallowRef<MediaStream>()
  const loadingText = ref('')

  // Computed
  const isStreaming = computed(() => {
    return Boolean(mediaStreamRef.value)
  })

  /**
   * Start media stream with current device configuration
   */
  const startMediaStream = async () => {
    try {
      loadingText.value = 'Starting MediaStream...'

      const videoId = settingsStore.currentVideoDeviceId
      const audioId = settingsStore.currentAudioDeviceId

      console.log('')
      console.log('═══════════════════════════════════════════════════════════')
      console.log('📹 [startMediaStream] STREAM START')
      console.log('═══════════════════════════════════════════════════════════')
      console.log('📥 Input parameters:')
      console.log('   - videoId:', videoId)
      console.log('   - audioId:', audioId)
      console.log('   - videoConfig from store:', settingsStore.videoConfig)

      if (!videoId) {
        console.log('⚠️  [startMediaStream] No videoId provided, exiting')
        return
      }

      // Validate that the stored device IDs still exist
      const videoExists = videoDeviceList.value.some((device) => device.deviceId === videoId)
      if (!videoExists) {
        console.error('❌ [startMediaStream] Selected video device does NOT exist in device list!')
        console.error('   - Requested deviceId:', videoId)
        console.error('   - ACTION: Clearing selection')
        settingsStore.currentVideoDeviceId = ''
        settingsStore.videoConfig = null
        return
      }
      console.log('✓  [startMediaStream] Selected video device exists in list')

      if (audioId) {
        const audioExists = audioDeviceList.value.some((device) => device.deviceId === audioId)
        if (!audioExists) {
          console.warn('⚠️  [startMediaStream] Selected audio device no longer exists, clearing')
          settingsStore.currentAudioDeviceId = ''
        } else {
          console.log('✓  [startMediaStream] Selected audio device exists in list')
        }
      }

      let vConfig: IVideoConfig | undefined = undefined

      if (videoId) {
        // Use saved config if available, otherwise use deviceId only
        if (settingsStore.videoConfig && settingsStore.videoConfig.deviceId === videoId) {
          console.log('📦 [startMediaStream] Using STORED config:')
          console.log('   - deviceId:', settingsStore.videoConfig.deviceId)
          console.log('   - width:', settingsStore.videoConfig.width)
          console.log('   - height:', settingsStore.videoConfig.height)
          console.log('   - frameRate:', settingsStore.videoConfig.frameRate)
          // Use 'exact' constraint to force the browser to use this specific device
          vConfig = {
            deviceId: {exact: settingsStore.videoConfig.deviceId},
            width: settingsStore.videoConfig.width,
            height: settingsStore.videoConfig.height,
            frameRate: settingsStore.videoConfig.frameRate,
          }
        } else {
          // No saved config or different device - use basic constraint with 'exact' deviceId
          console.log('🆕 [startMediaStream] Using BASIC constraint (deviceId only)')
          if (settingsStore.videoConfig) {
            console.log('   - Reason: Config deviceId mismatch')
            console.log('     • Config has:', settingsStore.videoConfig.deviceId)
            console.log('     • Selected:', videoId)
          } else {
            console.log('   - Reason: No stored config')
          }
          // CRITICAL: Use 'exact' constraint to force browser to use the specified device
          vConfig = {deviceId: {exact: videoId}}
        }
      }

      console.log('🎯 [startMediaStream] Final vConfig:', JSON.stringify(vConfig, null, 2))

      const constraints = {
        audio: audioId
          ? {
              deviceId: audioId,
              autoGainControl: false,
              echoCancellation: false,
              noiseSuppression: false,
            }
          : false,
        video: vConfig,
      }

      console.log('🎬 [startMediaStream] Calling getUserMedia with constraints:')
      console.log('   ', JSON.stringify(constraints, null, 2))

      let stream: MediaStream
      try {
        console.log('⏳ [startMediaStream] Requesting media stream from browser...')
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        console.log('✅ [startMediaStream] getUserMedia SUCCESS')
        console.log('   - Video tracks:', stream.getVideoTracks().length)
        console.log('   - Audio tracks:', stream.getAudioTracks().length)
        if (stream.getVideoTracks().length > 0) {
          const track = stream.getVideoTracks()[0]
          const trackSettings = track.getSettings()
          console.log('   - Video track label:', track.label)
          console.log('   - Video track settings:', trackSettings)

          // CRITICAL VALIDATION: Verify we got the correct camera
          if (trackSettings.deviceId && trackSettings.deviceId !== videoId) {
            console.error('⚠️⚠️⚠️  [startMediaStream] BROWSER RETURNED WRONG CAMERA!')
            console.error('   - Requested deviceId:', videoId)
            console.error('   - Actual deviceId:', trackSettings.deviceId)
            console.error('   - This is a browser bug - it ignored the "exact" constraint!')

            // Stop the wrong stream
            stream.getTracks().forEach((t) => t.stop())

            throw new Error(`Browser returned wrong camera. Requested device not available.`)
          } else {
            console.log('✅ [startMediaStream] Device ID verification: CORRECT camera returned')
          }
        }
      } catch (error: any) {
        // Handle OverconstrainedError - saved config may no longer be supported
        if (error.name === 'OverconstrainedError' || error.name === 'NotReadableError') {
          console.warn('⚠️  [startMediaStream] getUserMedia FAILED with constraint error')
          console.warn('   - Error name:', error.name)
          console.warn('   - Error message:', error.message)
          console.warn('   - Error constraint:', error.constraint)
          console.warn('   - ACTION: Clearing stored config and retrying with basic constraints')

          // Clear the invalid config and retry with just deviceId
          settingsStore.videoConfig = null
          const fallbackConstraints = {
            audio: constraints.audio,
            video: {deviceId: {exact: videoId}},
          }
          console.log('   - Fallback constraints:', JSON.stringify(fallbackConstraints, null, 2))
          console.log('⏳ [startMediaStream] Retrying getUserMedia with fallback...')
          stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints)
          console.log('✅ [startMediaStream] Fallback getUserMedia SUCCESS')
        } else {
          console.error('❌ [startMediaStream] getUserMedia FAILED')
          console.error('   - Error name:', error.name)
          console.error('   - Error message:', error.message)
          throw error
        }
      }

      mediaStreamRef.value = stream
      console.log('📌 [startMediaStream] Stream assigned to mediaStreamRef')

      // Get and save video capabilities from the track
      console.log('💾 [startMediaStream] Checking if we should save capabilities...')
      console.log('   - Current videoConfig:', settingsStore.videoConfig)
      console.log('   - Target videoId:', videoId)
      console.log(
        '   - Should save?',
        !settingsStore.videoConfig || settingsStore.videoConfig.deviceId !== videoId
      )

      if (!settingsStore.videoConfig || settingsStore.videoConfig.deviceId !== videoId) {
        const videoTrack = stream.getVideoTracks()[0]
        console.log('   - Video track found:', !!videoTrack)
        console.log(
          '   - Track has getCapabilities?',
          videoTrack && typeof videoTrack.getCapabilities === 'function'
        )

        if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
          try {
            const capabilities = videoTrack.getCapabilities()
            console.log('   - Raw capabilities:', capabilities)
            console.log('   - Track settings:', videoTrack.getSettings())

            if (capabilities.width && capabilities.height && capabilities.frameRate) {
              // Determine best resolution
              let bestWidth = 1920
              let bestHeight = 1080
              let bestFrameRate = 30

              // Width
              if (capabilities.width.max) {
                bestWidth = capabilities.width.max
              } else if (Array.isArray(capabilities.width)) {
                bestWidth = Math.max(...capabilities.width)
              }

              // Height
              if (capabilities.height.max) {
                bestHeight = capabilities.height.max
              } else if (Array.isArray(capabilities.height)) {
                bestHeight = Math.max(...capabilities.height)
              }

              // Frame rate
              if (capabilities.frameRate.max) {
                bestFrameRate = capabilities.frameRate.max
              } else if (Array.isArray(capabilities.frameRate)) {
                bestFrameRate = Math.max(...capabilities.frameRate)
              }

              const newConfig = {
                deviceId: videoId,
                width: bestWidth,
                height: bestHeight,
                frameRate: bestFrameRate,
              }
              console.log('✅ [startMediaStream] SAVING best quality config to store:')
              console.log('   ', JSON.stringify(newConfig, null, 2))
              console.log('   - Best width:', bestWidth, 'from capabilities:', capabilities.width)
              console.log('   - Best height:', bestHeight, 'from capabilities:', capabilities.height)
              console.log(
                '   - Best frameRate:',
                bestFrameRate,
                'from capabilities:',
                capabilities.frameRate
              )

              // IMPORTANT: Stop current stream and restart with optimal settings
              console.log('🔄 [startMediaStream] Restarting stream with optimal resolution...')

              // Store the config first
              settingsStore.videoConfig = newConfig

              // Stop current stream
              stream.getTracks().forEach((t) => t.stop())

              // Restart with optimal constraints
              const optimalConstraints = {
                audio: audioId
                  ? {
                      deviceId: audioId,
                      autoGainControl: false,
                      echoCancellation: false,
                      noiseSuppression: false,
                    }
                  : false,
                video: {
                  deviceId: {exact: videoId},
                  width: {ideal: bestWidth},
                  height: {ideal: bestHeight},
                  frameRate: {ideal: bestFrameRate},
                },
              }

              console.log('   - Optimal constraints:', JSON.stringify(optimalConstraints, null, 2))

              try {
                stream = await navigator.mediaDevices.getUserMedia(optimalConstraints)
                mediaStreamRef.value = stream
                console.log('✅ [startMediaStream] Restarted with optimal resolution')
                console.log('   - New track settings:', stream.getVideoTracks()[0].getSettings())
              } catch (optError: any) {
                console.warn(
                  '⚠️  [startMediaStream] Failed to apply optimal settings, using current stream'
                )
                console.warn('   - Error:', optError.message)
                // Keep the original stream that's already working
              }
            } else {
              console.warn('⚠️  [startMediaStream] Capabilities incomplete, not saving')
              console.warn('   - Has width?', !!capabilities.width)
              console.warn('   - Has height?', !!capabilities.height)
              console.warn('   - Has frameRate?', !!capabilities.frameRate)
            }
          } catch (e) {
            console.error('❌ [startMediaStream] Failed to get capabilities:', e)
          }
        } else {
          console.warn('⚠️  [startMediaStream] Cannot get capabilities from track')
        }
      } else {
        console.log('⏭️  [startMediaStream] Skipping capability save (already have config for this device)')
      }

      const video = videoRef.value
      if (!video) {
        console.error('❌ [startMediaStream] Video element not found')
        return
      }

      console.log('📺 [startMediaStream] Attaching stream to video element...')
      video.srcObject = stream

      video.onloadedmetadata = () => {
        console.log('🎞️  [startMediaStream] Video metadata loaded')
        video.play()

        console.log('📐 [startMediaStream] Actual video dimensions:')
        console.log('   - Width:', video.videoWidth)
        console.log('   - Height:', video.videoHeight)
        console.log('   - Aspect ratio:', (video.videoWidth / video.videoHeight).toFixed(4))

        const graphInfo = {
          width: video.videoWidth,
          height: video.videoHeight,
          aspectRatio: parseFloat((video.videoWidth / video.videoHeight).toFixed(4)),
        }

        // Notify parent component
        if (onStreamStarted) {
          onStreamStarted(graphInfo)
        }

        // Show success notification with device info
        const videoTrack = stream.getVideoTracks()[0]
        const videoDeviceName =
          videoDeviceList.value.find((d) => d.deviceId === videoId)?.label || 'Camera'
        const trackSettings = videoTrack.getSettings()
        const fps = trackSettings.frameRate ? Math.round(trackSettings.frameRate) : 30
        const resolution = `${video.videoWidth}x${video.videoHeight}`

        console.log('📢 [startMediaStream] Showing notification')
        console.log('   - Device:', videoDeviceName)
        console.log('   - Resolution:', resolution)
        console.log('   - FPS:', fps)

        window.$notification({
          type: 'success',
          message: `${videoDeviceName} connected\n${resolution} @${fps} fps`,
          timeout: 8000,
        })

        // Query camera capabilities for settings UI
        if (videoTrack && onCapabilitiesQuery) {
          onCapabilitiesQuery(videoTrack)
        }

        console.log('═══════════════════════════════════════════════════════════')
        console.log('✅ [startMediaStream] STREAM START COMPLETE')
        console.log('═══════════════════════════════════════════════════════════')
        console.log('')
      }
    } catch (error: any) {
      console.error(error)
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
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔄 [handleStartStreaming] CAMERA SWITCH INITIATED')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📌 Current state BEFORE switch:')
    console.log('   - settingsStore.currentVideoDeviceId:', settingsStore.currentVideoDeviceId)
    console.log('   - settingsStore.currentAudioDeviceId:', settingsStore.currentAudioDeviceId)
    console.log('   - settingsStore.videoConfig:', JSON.stringify(settingsStore.videoConfig, null, 2))
    console.log('   - isStreaming:', isStreaming.value)
    console.log('   - mediaStreamRef exists:', !!mediaStreamRef.value)

    try {
      loadingText.value = 'Switching camera...'

      // Clear old video config when manually switching cameras
      if (
        settingsStore.videoConfig &&
        settingsStore.videoConfig.deviceId !== settingsStore.currentVideoDeviceId
      ) {
        console.log('⚠️  [handleStartStreaming] Config deviceId mismatch detected!')
        console.log('   - Config has deviceId:', settingsStore.videoConfig.deviceId)
        console.log('   - Selected deviceId:', settingsStore.currentVideoDeviceId)
        console.log('   - ACTION: Clearing old video config')
        settingsStore.videoConfig = null
        console.log('   - videoConfig after clear:', settingsStore.videoConfig)
      } else {
        console.log('✓  [handleStartStreaming] Config matches selected device (or no config)')
      }

      // Stop current stream first and wait for cleanup
      console.log('🛑 [handleStartStreaming] Stopping current stream...')
      stopMediaStreaming()
      console.log('✓  [handleStartStreaming] Stream stopped')

      // Small delay to ensure cleanup completes and device is released
      console.log('⏳ [handleStartStreaming] Waiting 100ms for device release...')
      await new Promise((resolve) => setTimeout(resolve, 100))
      console.log('✓  [handleStartStreaming] Wait complete')

      // Start new stream
      console.log('▶️  [handleStartStreaming] Starting new stream with selected device...')
      await startMediaStream()
      console.log('✅ [handleStartStreaming] CAMERA SWITCH COMPLETED SUCCESSFULLY')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    } catch (error: any) {
      console.error('❌ [handleStartStreaming] CAMERA SWITCH FAILED')
      console.error('   Error:', error)
      console.error('   Error name:', error.name)
      console.error('   Error message:', error.message)
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
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
    console.log('🛑 [stopMediaStreaming] Stopping media stream...')
    const stream = mediaStreamRef.value

    // Stop all tracks first
    if (stream) {
      const tracks = stream.getTracks()
      console.log(`   - Stopping ${tracks.length} track(s)`)
      tracks.forEach((track) => {
        console.log(`     • ${track.kind} track: ${track.label} (state: ${track.readyState})`)
        track.stop()
      })
    } else {
      console.log('   - No active stream to stop')
    }

    // Then clear the video element
    const video = videoRef.value
    if (video) {
      console.log('   - Clearing video element')
      // Clear srcObject first to release the stream
      video.srcObject = null
      // Then pause playback
      video.pause()
      // Remove event listeners to prevent memory leaks
      video.onloadedmetadata = null
    }

    // Finally clear the stream reference
    mediaStreamRef.value = undefined
    console.log('✓  [stopMediaStreaming] Media stream stopped and cleared')
  }

  /**
   * Start screen capture
   */
  const handleStartStreamingCaptureScreen = async () => {
    try {
      loadingText.value = 'Starting Capture Screen...'
      stopMediaStreaming()
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'window',
        },
        audio: true,
      })
      mediaStreamRef.value = stream
      const video = videoRef.value
      if (video) {
        video.srcObject = stream
        video.onloadedmetadata = () => {
          video.play()
        }
      }
    } catch (error: any) {
      console.error(error)
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

    // Methods
    startMediaStream,
    handleStartStreaming,
    stopMediaStreaming,
    handleStartStreamingCaptureScreen,
    clearSelect,
  }
}
