import {defineStore} from 'pinia'

export interface IVideoConfig {
  deviceId: string
  frameRate?: number
  height?: number
  width?: number
  // Only modes the user explicitly chose are reused; older auto-saved configs lack this flag
  // (they captured Chrome's 640x480 fallback) and are ignored in favor of the default mode.
  userSelected?: boolean
}

export interface IResolutionFpsOption {
  width: number
  height: number
  fps: number
  label: string
}

export interface ICameraCapabilities {
  deviceId: string
  options: IResolutionFpsOption[]
}

// Bump when persisted settings need a migration step (see migrate())
const CURRENT_SETTINGS_VERSION = 1

interface ISettings {
  // Version of the persisted settings shape; 0 = saved before versioning existed
  settingsVersion: number
  fitMode: string
  floatUI: boolean
  enableKvmInput: boolean
  baudRate: string
  // Mouse positioning mode, recommended to enable relative mode under Linux guest
  cursorMode: 'relative' | 'absolute'
  absMouseAreaHeight: number
  absMouseAreaWidth: number
  // Keyboard compatibility mode, recommended to enable under Linux guest
  keyboardCompatibleMode: boolean

  filterMirrorX: boolean
  filterMirrorY: boolean
  filterRotation: number // Rotation in degrees: 0, 90, -90, 180
  filterShowFg: boolean
  currentVideoDeviceId: string
  currentAudioDeviceId: string
  // User-chosen video mode for currentVideoDeviceId (null = auto/default mode)
  videoConfig: IVideoConfig | null
  // Available camera capabilities (not persisted, refreshed on device selection)
  cameraCapabilities: ICameraCapabilities | null
  // Cache of tested camera capabilities per device ID (persisted to avoid re-testing)
  cameraCapabilitiesCache: Record<string, IResolutionFpsOption[]>
  // QR code auto-open links setting
  qrAutoOpenLinks: boolean
  // OCR auto-open extracted URLs setting
  ocrAutoOpenLinks: boolean
  // Auto capture mouse on click
  autoCaptureMouse: boolean
  // Escape sequence style for Send Advanced Text
  advancedTextEscapeStyle: 'square' | 'curly' | 'pipe'
  // While controlling the target, Ctrl+V (Cmd+V on Mac) types the local clipboard text
  pasteInterceptCtrlV: boolean
}

export const useSettingsStore = defineStore('settingsStore', {
  state: (): ISettings => {
    return {
      settingsVersion: 0,
      fitMode: 'contain',
      floatUI: true,
      enableKvmInput: true,
      baudRate: '',
      cursorMode: 'absolute',
      absMouseAreaHeight: 100,
      absMouseAreaWidth: 100,
      keyboardCompatibleMode: false,

      filterMirrorX: false,
      filterMirrorY: false,
      filterRotation: 0,
      filterShowFg: false,
      currentVideoDeviceId: '',
      currentAudioDeviceId: '',
      videoConfig: null,
      cameraCapabilities: null,
      cameraCapabilitiesCache: {},
      qrAutoOpenLinks: false,
      ocrAutoOpenLinks: false,
      autoCaptureMouse: true,
      advancedTextEscapeStyle: 'square',
      pasteInterceptCtrlV: true,
    }
  },
  actions: {
    /** Upgrade settings persisted by older versions. Called once on startup. */
    migrate() {
      if (this.settingsVersion >= CURRENT_SETTINGS_VERSION) {
        return
      }
      if (this.settingsVersion < 1) {
        // The float bar visibility used to be persisted separately
        localStorage.removeItem('wmd__is_show_float_bar')
      }
      this.settingsVersion = CURRENT_SETTINGS_VERSION
    },
    /**
     * Every preference back to its default. Keeps the selected devices and their tested
     * capabilities (see "Reset Video & Audio Devices" for those); macros live in their own store.
     */
    resetAllSettings() {
      const {currentVideoDeviceId, currentAudioDeviceId, cameraCapabilities, cameraCapabilitiesCache, settingsVersion} =
        this.$state
      this.$reset()
      this.$patch({
        currentVideoDeviceId,
        currentAudioDeviceId,
        cameraCapabilities,
        cameraCapabilitiesCache,
        settingsVersion,
      })
    },
    /** Rotation, flips and fit mode back to defaults */
    resetDisplaySettings() {
      this.filterRotation = 0
      this.filterMirrorX = false
      this.filterMirrorY = false
      this.fitMode = 'contain'
    },
  },
  persist: {
    key: 'ls_key_wmdp_settings',
    // Don't persist cameraCapabilities as they need to be queried fresh each time
    paths: [
      'settingsVersion',
      'fitMode',
      'floatUI',
      'enableKvmInput',
      'baudRate',
      'cursorMode',
      'absMouseAreaHeight',
      'absMouseAreaWidth',
      'keyboardCompatibleMode',
      'filterMirrorX',
      'filterMirrorY',
      'filterRotation',
      'filterShowFg',
      'currentVideoDeviceId',
      'currentAudioDeviceId',
      'videoConfig',
      'cameraCapabilitiesCache',
      'qrAutoOpenLinks',
      'ocrAutoOpenLinks',
      'autoCaptureMouse',
      'advancedTextEscapeStyle',
      'pasteInterceptCtrlV',
    ],
  },
})
