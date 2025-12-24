import {defineStore} from 'pinia'

export interface IVideoConfig {
  deviceId: string
  frameRate?: number
  height?: number
  width?: number
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

interface ISettings {
  isShowControls: boolean
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
  selectedFilters: string[]
  inputFilter: string
  currentVideoDeviceId: string
  currentAudioDeviceId: string
  // save config for next time reload
  videoConfig: IVideoConfig | null
  // Available camera capabilities (not persisted, refreshed on device selection)
  cameraCapabilities: ICameraCapabilities | null
  // User's preferred resolution and FPS combination (persisted per device)
  preferredResolutionFps: {width: number; height: number; fps: number} | null
  // Cache of tested camera capabilities per device ID (persisted to avoid re-testing)
  cameraCapabilitiesCache: Record<string, IResolutionFpsOption[]>
  // QR code auto-open links setting
  qrAutoOpenLinks: boolean
  // OCR auto-open extracted URLs setting
  ocrAutoOpenLinks: boolean
  // Auto capture mouse on click
  autoCaptureMouse: boolean
}

export const useSettingsStore = defineStore('settingsStore', {
  state: (): ISettings => {
    return {
      isShowControls: false,
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
      selectedFilters: [],
      inputFilter: '',
      currentVideoDeviceId: '',
      currentAudioDeviceId: '',
      videoConfig: null,
      cameraCapabilities: null,
      preferredResolutionFps: null,
      cameraCapabilitiesCache: {},
      qrAutoOpenLinks: false,
      ocrAutoOpenLinks: false,
      autoCaptureMouse: true,
    }
  },
  persist: {
    key: 'ls_key_wmdp_settings',
    // Don't persist cameraCapabilities as they need to be queried fresh each time
    paths: [
      'isShowControls',
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
      'selectedFilters',
      'inputFilter',
      'currentVideoDeviceId',
      'currentAudioDeviceId',
      'videoConfig',
      'preferredResolutionFps',
      'cameraCapabilitiesCache',
      'qrAutoOpenLinks',
      'ocrAutoOpenLinks',
      'autoCaptureMouse',
    ],
  },
})
