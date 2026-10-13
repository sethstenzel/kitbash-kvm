import {ref, type ShallowRef} from 'vue'
import {useSettingsStore, type IResolutionFpsOption, type ICameraCapabilities} from '@/stores/settings'

interface UseCameraCapabilitiesOptions {
  onTestingStart?: () => void
  onTestingEnd?: () => void
  // Restarts the main stream (used after getUserMedia-based testing and when applying a resolution)
  restartStream?: () => Promise<void>
}

// Common resolutions and frame rates to test, highest fps first
const TEST_COMBINATIONS = [
  {width: 3840, height: 2160, name: '4K', fps: [60, 30, 25, 24]},
  {width: 2560, height: 1440, name: '1440p', fps: [60, 30, 25]},
  {width: 1920, height: 1080, name: '1080p', fps: [60, 50, 30, 25, 24]},
  {width: 1280, height: 720, name: '720p', fps: [60, 50, 30, 25, 24]},
  {width: 960, height: 540, name: '540p', fps: [60, 30, 25]},
  {width: 640, height: 480, name: '480p', fps: [60, 30, 25, 15]},
  {width: 640, height: 360, name: '360p', fps: [60, 30, 25, 15]},
  {width: 320, height: 240, name: '240p', fps: [30, 25, 15]},
]

const makeOption = (width: number, height: number, fps: number, name: string): IResolutionFpsOption => ({
  width,
  height,
  fps,
  label: `${name} (${width}x${height}) @ ${fps}fps`,
})

const matches = (actual: MediaTrackSettings, width: number, height: number, fps: number) =>
  actual.width === width && actual.height === height && Math.abs((actual.frameRate ?? 0) - fps) <= 1

/**
 * Composable for querying and managing camera capabilities
 * Tests available resolutions and frame rates, caches results
 */
export function useCameraCapabilities(options: UseCameraCapabilitiesOptions = {}) {
  const {onTestingStart, onTestingEnd, restartStream} = options
  const settingsStore = useSettingsStore()

  const loadingText = ref('')

  /**
   * Query camera capabilities including available resolutions and frame rates
   * Tests each combination to ensure it's actually supported by the camera
   * Uses cached results for known cameras to avoid re-testing
   */
  const queryCameraCapabilities = async (videoTrack: MediaStreamTrack): Promise<void> => {
    try {
      if (!videoTrack || typeof videoTrack.getCapabilities !== 'function') {
        console.warn('[queryCameraCapabilities] Track does not support getCapabilities')
        settingsStore.cameraCapabilities = null
        return
      }

      const capabilities = videoTrack.getCapabilities()
      const deviceId = videoTrack.getSettings().deviceId || settingsStore.currentVideoDeviceId

      if (!capabilities.width || !capabilities.height || !capabilities.frameRate) {
        console.warn('[queryCameraCapabilities] Incomplete capabilities:', capabilities)
        settingsStore.cameraCapabilities = null
        return
      }

      if (deviceId && settingsStore.cameraCapabilitiesCache[deviceId]) {
        settingsStore.cameraCapabilities = {
          deviceId,
          options: settingsStore.cameraCapabilitiesCache[deviceId],
        }
        return
      }

      loadingText.value = 'Testing input resolution settings...'
      onTestingStart?.()

      // Skip modes beyond what the device reports, so 1080p cards don't spend time on 4K/1440p
      const maxWidth = capabilities.width.max ?? Infinity
      const maxHeight = capabilities.height.max ?? Infinity
      const maxFps = (capabilities.frameRate.max ?? Infinity) + 1
      const candidates = TEST_COMBINATIONS.filter(
        (c) => c.width <= maxWidth && c.height <= maxHeight
      ).map((c) => ({...c, fps: c.fps.filter((fps) => fps <= maxFps)}))

      // Restore to exactly what the stream was opened with (incl. resizeMode), minus deviceId
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const {deviceId: _ignored, ...originalConstraints} = videoTrack.getConstraints()

      const found: IResolutionFpsOption[] = []
      // Combinations where applyConstraints threw "Source failed to restart" (driver can't
      // hot-switch resolution) — retested in phase 2 via fresh getUserMedia calls
      const sourceRestartFailures: Array<{width: number; height: number; fps: number; name: string}> = []

      // Phase 1: applyConstraints on the live track
      for (const res of candidates) {
        for (const [i, fps] of res.fps.entries()) {
          try {
            await videoTrack.applyConstraints({
              width: {exact: res.width},
              height: {exact: res.height},
              frameRate: {exact: fps},
            })
            const actual = videoTrack.getSettings()
            if (matches(actual, res.width, res.height, fps)) {
              // Chrome decimates frames to any lower rate, so the remaining (lower) rates work too
              res.fps.slice(i).forEach((f) => found.push(makeOption(res.width, res.height, f, res.name)))
              break
            }
            console.warn(
              `[queryCameraCapabilities] ${res.width}x${res.height}@${fps} delivered ${actual.width}x${actual.height}@${actual.frameRate?.toFixed(1)}`
            )
          } catch (error: any) {
            if (error.message?.includes('Source failed to restart')) {
              sourceRestartFailures.push({...res, fps})
            }
          }
        }
      }

      if (videoTrack.readyState === 'live') {
        try {
          await videoTrack.applyConstraints(originalConstraints)
        } catch (error) {
          console.warn('[queryCameraCapabilities] Failed to restore original constraints:', error)
        }
      }

      // Phase 2: getUserMedia fallback for "Source failed to restart" combinations
      let trackWasStopped = false
      if (sourceRestartFailures.length > 0) {
        // Stop the live track so the camera is free for fresh getUserMedia calls
        videoTrack.stop()
        trackWasStopped = true

        for (const {width, height, fps, name} of sourceRestartFailures) {
          let testStream: MediaStream | null = null
          try {
            testStream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: {exact: deviceId},
                width: {exact: width},
                height: {exact: height},
                frameRate: {exact: fps},
              },
            })
            if (matches(testStream.getVideoTracks()[0].getSettings(), width, height, fps)) {
              found.push(makeOption(width, height, fps, name))
            }
          } catch (e: any) {
            // Unsupported combination
          } finally {
            testStream?.getTracks().forEach((t) => t.stop())
          }
        }
      }

      // Sort by resolution descending, then fps descending
      found.sort((a, b) => b.width * b.height - a.width * a.height || b.fps - a.fps)
      console.log(`[queryCameraCapabilities] Found ${found.length} supported combinations`)

      loadingText.value = ''
      onTestingEnd?.()

      const caps: ICameraCapabilities = {deviceId, options: found}
      settingsStore.cameraCapabilities = caps

      // Always cache, even when empty. Without this, cameras that don't support
      // applyConstraints would trigger a full re-test on every stream start.
      if (deviceId) {
        settingsStore.cameraCapabilitiesCache[deviceId] = found
      }

      // If phase 2 stopped the live track, restart the main stream now that testing is done
      if (trackWasStopped && restartStream) {
        await restartStream()
      }
    } catch (error) {
      console.error('[queryCameraCapabilities] Failed to query capabilities:', error)
      settingsStore.cameraCapabilities = null
      loadingText.value = ''
      onTestingEnd?.()
    }
  }

  /**
   * Apply a user-selected resolution/fps (or null for the automatic default) and restart the stream
   */
  const applyResolutionSettings = async (mode: {width: number; height: number; fps: number} | null) => {
    const deviceId = settingsStore.currentVideoDeviceId
    if (!deviceId) {
      console.warn('[applyResolutionSettings] No video device selected')
      return
    }

    settingsStore.videoConfig = mode
      ? {deviceId, width: mode.width, height: mode.height, frameRate: mode.fps, userSelected: true}
      : null

    await restartStream?.()
  }

  /**
   * Force recheck of camera resolution settings (clears cache and re-tests)
   */
  const recheckResolutionSettings = async (mediaStreamRef: ShallowRef<MediaStream | undefined>) => {
    const deviceId = settingsStore.currentVideoDeviceId
    if (!deviceId) {
      window.$notification({
        type: 'warning',
        message: 'No video device selected',
        timeout: 3000,
      })
      return
    }

    try {
      delete settingsStore.cameraCapabilitiesCache[deviceId]
      settingsStore.cameraCapabilities = null

      const videoTrack = mediaStreamRef.value?.getVideoTracks()[0]
      if (!videoTrack) {
        window.$notification({
          type: 'warning',
          message: 'No active video stream. Please start the camera first.',
          timeout: 3000,
        })
        return
      }

      // Re-query capabilities (this will test all combinations again)
      await queryCameraCapabilities(videoTrack)

      // Re-read through a cast: TS narrowed this to null from the assignment above
      const caps = settingsStore.cameraCapabilities as ICameraCapabilities | null
      const found = caps?.options.length ?? 0
      if (!caps) {
        window.$notification({
          type: 'error',
          message: 'Failed to query camera capabilities',
          timeout: 4000,
        })
      } else if (found === 0) {
        window.$notification({
          type: 'warning',
          message: 'Camera does not report any supported resolutions',
          timeout: 4000,
        })
      } else {
        window.$notification({
          type: 'success',
          message: `Found ${found} supported resolution/FPS combinations`,
          timeout: 3000,
        })
      }
    } catch (error: any) {
      console.error('[recheckResolutionSettings] Failed to recheck:', error)
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
