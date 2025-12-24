import {ref, computed} from 'vue'
import {usePermission} from '@vueuse/core'
import {useSettingsStore} from '@/stores/settings'

/**
 * Composable for managing media devices (cameras and microphones)
 * Handles device enumeration, permissions, and device change events
 */
export function useMediaDevices() {
  const settingsStore = useSettingsStore()

  // State
  const deviceList = ref<MediaDeviceInfo[]>([])
  const loadingText = ref('')

  // Device info overlay visibility - auto-hide after 8 seconds
  const isDeviceInfoVisible = ref(false)
  let deviceInfoTimeout: ReturnType<typeof setTimeout> | null = null

  // Permissions
  const permissionCamera = usePermission('camera')
  const permissionMicrophone = usePermission('microphone')

  /**
   * Get all available media devices
   */
  const getEnumerateDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      throw new Error('enumerateDevices() not supported.')
    }
    const devices: MediaDeviceInfo[] = await navigator.mediaDevices.enumerateDevices()
    return devices
  }

  /**
   * Filter devices by kind and remove duplicates
   */
  const filterDeviceList = (list: MediaDeviceInfo[], kind: string) => {
    const filtered = list.filter((item) => item.kind === kind && !!item.deviceId)

    // Remove duplicates by deviceId (some systems report duplicate devices)
    const seen = new Set<string>()
    return filtered.filter((item) => {
      if (seen.has(item.deviceId)) {
        console.warn(`Duplicate device ID found: ${item.deviceId} (${item.label})`)
        return false
      }
      seen.add(item.deviceId)
      return true
    })
  }

  /**
   * Computed lists of video and audio devices
   */
  const videoDeviceList = computed(() => {
    return [{label: '---', deviceId: ''}, ...filterDeviceList(deviceList.value, 'videoinput')]
  })

  const audioDeviceList = computed(() => {
    return [{label: '---', deviceId: ''}, ...filterDeviceList(deviceList.value, 'audioinput')]
  })

  /**
   * Update the device list
   */
  const updateDeviceList = async () => {
    try {
      loadingText.value = 'Updating Device List...'
      deviceList.value = await getEnumerateDevices()
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
   * Show device info overlay temporarily (8 seconds)
   */
  const showDeviceInfoTemporarily = () => {
    // Clear any existing timeout
    if (deviceInfoTimeout) {
      clearTimeout(deviceInfoTimeout)
    }

    // Show the overlay
    isDeviceInfoVisible.value = true

    // Hide after 8 seconds
    deviceInfoTimeout = setTimeout(() => {
      isDeviceInfoVisible.value = false
    }, 8000)
  }

  /**
   * Computed property for current device info display
   */
  const currentDeviceInfo = computed(() => {
    if (!settingsStore.currentVideoDeviceId) {
      return null
    }

    const videoDevice = videoDeviceList.value.find(
      (d) => d.deviceId === settingsStore.currentVideoDeviceId
    )
    const audioDevice = audioDeviceList.value.find(
      (d) => d.deviceId === settingsStore.currentAudioDeviceId
    )

    // Determine audio name
    let audioName = null
    if (settingsStore.currentAudioDeviceId) {
      audioName = audioDevice?.label || 'Unknown Microphone'
    }

    return {
      videoName: videoDevice?.label || 'Unknown Camera',
      audioName,
    }
  })

  /**
   * Clean up device info timeout
   */
  const cleanupDeviceInfo = () => {
    if (deviceInfoTimeout) {
      clearTimeout(deviceInfoTimeout)
      deviceInfoTimeout = null
    }
  }

  return {
    // State
    deviceList,
    loadingText,
    isDeviceInfoVisible,

    // Permissions
    permissionCamera,
    permissionMicrophone,

    // Computed
    videoDeviceList,
    audioDeviceList,
    currentDeviceInfo,

    // Methods
    getEnumerateDevices,
    updateDeviceList,
    showDeviceInfoTemporarily,
    cleanupDeviceInfo,
  }
}
