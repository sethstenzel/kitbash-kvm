import {ref} from 'vue'
import {useSettingsStore, type IResolutionFpsOption, type ICameraCapabilities} from '@/stores/settings'

interface UseCameraCapabilitiesOptions {
  onTestingStart?: () => void
  onTestingEnd?: () => void
}

/**
 * Composable for querying and managing camera capabilities
 * Tests available resolutions and frame rates, caches results
 */
export function useCameraCapabilities(options: UseCameraCapabilitiesOptions = {}) {
  const {onTestingStart, onTestingEnd} = options
  const settingsStore = useSettingsStore()

  const loadingText = ref('')

  /**
   * Query camera capabilities including available resolutions and frame rates
   * Tests each combination to ensure it's actually supported by the camera
   * Uses cached results for known cameras to avoid re-testing
   */
  const queryCameraCapabilities = async (videoTrack: MediaStreamTrack): Promise<void> => {
    try {
      console.log('🔍 [queryCameraCapabilities] Querying camera capabilities...')

      if (!videoTrack || typeof videoTrack.getCapabilities !== 'function') {
        console.warn('⚠️  [queryCameraCapabilities] Track does not support getCapabilities')
        settingsStore.cameraCapabilities = null
        return
      }

      const capabilities = videoTrack.getCapabilities()
      const settings = videoTrack.getSettings()
      const deviceId = settings.deviceId || settingsStore.currentVideoDeviceId

      console.log('   - Raw capabilities:', capabilities)
      console.log('   - Current settings:', settings)
      console.log('   - Device ID:', deviceId)

      if (!capabilities.width || !capabilities.height || !capabilities.frameRate) {
        console.warn('⚠️  [queryCameraCapabilities] Incomplete capabilities')
        console.warn('   - Has width?', !!capabilities.width)
        console.warn('   - Has height?', !!capabilities.height)
        console.warn('   - Has frameRate?', !!capabilities.frameRate)
        settingsStore.cameraCapabilities = null
        return
      }

      // Check if we have cached results for this camera
      if (deviceId && settingsStore.cameraCapabilitiesCache[deviceId]) {
        console.log('✅ [queryCameraCapabilities] Using cached capabilities')
        settingsStore.cameraCapabilities = {
          deviceId,
          options: settingsStore.cameraCapabilitiesCache[deviceId],
        }
        console.log(
          `   - Found ${settingsStore.cameraCapabilitiesCache[deviceId].length} cached combinations`
        )
        return
      }

      // Show loading message
      loadingText.value = 'Testing input resolution settings...'
      if (onTestingStart) {
        onTestingStart()
      }

      // Common resolutions and frame rates to test
      const testCombinations = [
        // 4K
        {width: 3840, height: 2160, name: '4K', fps: [60, 30, 25, 24]},
        // 1440p
        {width: 2560, height: 1440, name: '1440p', fps: [60, 30, 25]},
        // 1080p
        {width: 1920, height: 1080, name: '1080p', fps: [60, 50, 30, 25, 24]},
        // 720p
        {width: 1280, height: 720, name: '720p', fps: [60, 50, 30, 25, 24]},
        // 540p
        {width: 960, height: 540, name: '540p', fps: [60, 30, 25]},
        // 480p
        {width: 640, height: 480, name: '480p', fps: [60, 30, 25, 15]},
        // 360p
        {width: 640, height: 360, name: '360p', fps: [60, 30, 25, 15]},
        // 240p
        {width: 320, height: 240, name: '240p', fps: [30, 25, 15]},
      ]

      const options: IResolutionFpsOption[] = []

      console.log('   - Testing resolution/FPS combinations...')

      // Test each resolution/FPS combination
      for (const resConfig of testCombinations) {
        for (const fps of resConfig.fps) {
          try {
            // Try to apply this specific combination of constraints
            await videoTrack.applyConstraints({
              width: {exact: resConfig.width},
              height: {exact: resConfig.height},
              frameRate: {exact: fps},
            })

            // If we got here, this combination is supported!
            options.push({
              width: resConfig.width,
              height: resConfig.height,
              fps,
              label: `${resConfig.name} (${resConfig.width}x${resConfig.height}) @ ${fps}fps`,
            })

            console.log(`   ✓ Supported: ${resConfig.name} @ ${fps}fps`)
          } catch (error) {
            // This combination is not supported, silently continue
          }
        }
      }

      // Restore original settings
      try {
        await videoTrack.applyConstraints({
          width: {ideal: settings.width},
          height: {ideal: settings.height},
          frameRate: {ideal: settings.frameRate},
        })
      } catch (error) {
        console.warn('⚠️  Failed to restore original track settings:', error)
      }

      // Clear loading message
      loadingText.value = ''
      if (onTestingEnd) {
        onTestingEnd()
      }

      const caps: ICameraCapabilities = {
        deviceId,
        options,
      }

      console.log('✅ [queryCameraCapabilities] Capabilities extracted:')
      console.log(`   - Found ${options.length} resolution/FPS combinations`)
      if (options.length > 0) {
        console.log('   - Sample options:', options.slice(0, 3).map((o) => o.label).join(', '))
      } else {
        console.warn('⚠️  No supported resolution/FPS combinations found')
      }

      settingsStore.cameraCapabilities = caps

      // Cache the results for this camera
      if (deviceId && options.length > 0) {
        settingsStore.cameraCapabilitiesCache[deviceId] = options
        console.log(`   - Cached capabilities for device: ${deviceId}`)
      }
    } catch (error) {
      console.error('❌ [queryCameraCapabilities] Failed to query capabilities:', error)
      settingsStore.cameraCapabilities = null
      loadingText.value = ''
      if (onTestingEnd) {
        onTestingEnd()
      }
    }
  }

  /**
   * Apply user-selected resolution and frame rate combination
   */
  const applyResolutionSettings = async (
    videoId: string,
    audioId: string,
    mediaStreamRef: any,
    videoRef: any,
    onApplied?: (info: {width: number; height: number; aspectRatio: number}) => void
  ) => {
    if (!settingsStore.currentVideoDeviceId) {
      console.warn('⚠️  [applyResolutionSettings] No video device selected')
      return
    }

    if (!settingsStore.preferredResolutionFps) {
      console.warn('⚠️  [applyResolutionSettings] No preferred resolution/FPS selected')
      return
    }

    const {width, height, fps} = settingsStore.preferredResolutionFps

    console.log('')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('🎯 [applyResolutionSettings] APPLYING CUSTOM RESOLUTION')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`   - Target: ${width}x${height} @ ${fps}fps`)

    try {
      loadingText.value = 'Applying resolution settings...'

      // Stop current stream
      if (mediaStreamRef.value) {
        const tracks = mediaStreamRef.value.getTracks()
        tracks.forEach((track: MediaStreamTrack) => track.stop())
        mediaStreamRef.value = undefined
      }

      // Small delay for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Build constraints with user preferences
      const videoConstraints: any = {
        deviceId: {exact: videoId},
        width: {ideal: width},
        height: {ideal: height},
        frameRate: {ideal: fps},
      }

      const constraints = {
        audio: audioId
          ? {
              deviceId: audioId,
              autoGainControl: false,
              echoCancellation: false,
              noiseSuppression: false,
            }
          : false,
        video: videoConstraints,
      }

      console.log('   - Constraints:', JSON.stringify(constraints, null, 2))

      // Get new stream with preferred settings
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      mediaStreamRef.value = stream

      // Get actual settings achieved
      const videoTrack = stream.getVideoTracks()[0]
      const actualSettings = videoTrack.getSettings()
      console.log('   - Actual settings achieved:', actualSettings)

      // Update videoConfig with achieved settings
      settingsStore.videoConfig = {
        deviceId: videoId,
        width: actualSettings.width,
        height: actualSettings.height,
        frameRate: actualSettings.frameRate,
      }

      // Attach to video element
      const video = videoRef.value
      if (video) {
        video.srcObject = stream

        video.onloadedmetadata = () => {
          video.play()

          const graphInfo = {
            width: video.videoWidth,
            height: video.videoHeight,
            aspectRatio: parseFloat((video.videoWidth / video.videoHeight).toFixed(4)),
          }

          if (onApplied) {
            onApplied(graphInfo)
          }

          window.$notification({
            type: 'success',
            message: 'Resolution applied',
            timeout: 3000,
          })

          // Re-query capabilities
          queryCameraCapabilities(videoTrack)

          console.log('✅ [applyResolutionSettings] Resolution applied successfully')
          console.log('═══════════════════════════════════════════════════════════')
          console.log('')
        }
      }
    } catch (error: any) {
      console.error('❌ [applyResolutionSettings] Failed to apply resolution:', error)
      window.$notification({
        type: 'error',
        message: `Failed to apply resolution: ${error.message}`,
        timeout: 5000,
      })
    } finally {
      loadingText.value = ''
    }
  }

  /**
   * Force recheck of camera resolution settings (clears cache and re-tests)
   */
  const recheckResolutionSettings = async (mediaStreamRef: any) => {
    if (!settingsStore.currentVideoDeviceId) {
      console.warn('⚠️  [recheckResolutionSettings] No video device selected')
      window.$notification({
        type: 'warning',
        message: 'No video device selected',
        timeout: 3000,
      })
      return
    }

    const deviceId = settingsStore.currentVideoDeviceId

    console.log('')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('🔄 [recheckResolutionSettings] RECHECKING RESOLUTIONS')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`   - Device: ${deviceId}`)

    try {
      // Clear cached capabilities for this camera
      if (settingsStore.cameraCapabilitiesCache[deviceId]) {
        delete settingsStore.cameraCapabilitiesCache[deviceId]
        console.log('   - Cleared cache for this device')
      }

      // Clear current capabilities to force re-query
      settingsStore.cameraCapabilities = null

      // Get current video track
      const stream = mediaStreamRef.value
      if (!stream) {
        console.warn('⚠️  [recheckResolutionSettings] No active stream')
        window.$notification({
          type: 'warning',
          message: 'No active video stream. Please start the camera first.',
          timeout: 3000,
        })
        return
      }

      const videoTrack = stream.getVideoTracks()[0]
      if (!videoTrack) {
        console.warn('⚠️  [recheckResolutionSettings] No video track found')
        window.$notification({
          type: 'warning',
          message: 'No video track found',
          timeout: 3000,
        })
        return
      }

      // Re-query capabilities (this will test all combinations again)
      await queryCameraCapabilities(videoTrack)

      window.$notification({
        type: 'success',
        message: 'Resolution settings rechecked successfully',
        timeout: 3000,
      })

      console.log('✅ [recheckResolutionSettings] Recheck completed')
      console.log('═══════════════════════════════════════════════════════════')
      console.log('')
    } catch (error: any) {
      console.error('❌ [recheckResolutionSettings] Failed to recheck:', error)
      window.$notification({
        type: 'error',
        message: `Failed to recheck resolutions: ${error.message}`,
        timeout: 5000,
      })
    }
  }

  return {
    // State
    loadingText,

    // Methods
    queryCameraCapabilities,
    applyResolutionSettings,
    recheckResolutionSettings,
  }
}
