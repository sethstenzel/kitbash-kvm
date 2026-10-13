<script setup lang="ts">
import {ref, watch, computed, nextTick, onMounted, onBeforeUnmount} from 'vue'
import {useVModel} from '@vueuse/core'
import {useSettingsStore, FILTER_OPTIONS, isValidCssFilter} from '@/stores/settings'
import {DEFAULT_VIDEO_MODE, type IStreamInfo} from '@/components/KBKvmController/composables/useMediaStream'
import {useMacrosStore, type IMacro} from '@/stores/macros'
import MacroDialog from '@/components/MacroDialog/MacroDialog.vue'
import {downloadUrl} from '@/components/KBKvmController/utils'
import {fileTimestamp} from '@/utils/format-date'

const settingsStore = useSettingsStore()
const macrosStore = useMacrosStore()
const macroSearchQuery = ref('')

interface Props {
  visible: boolean
  graphInfo?: IStreamInfo | null
  isTestingCapabilities?: boolean
}

const emit = defineEmits(['update:visible', 'apply-resolution', 'recheck-resolutions', 'update:macroDialogVisible', 'reset-devices'])
const props = withDefaults(defineProps<Props>(), {
  visible: false,
})
const mVisible = useVModel(props, 'visible', emit)

// Resolution/FPS dropdown selection ('' = auto), initialized from the saved mode
const savedModeKey = () => {
  const config = settingsStore.videoConfig
  return config?.userSelected ? `${config.width}x${config.height}@${config.frameRate}` : ''
}
const selectedResolutionFps = ref(savedModeKey())
watch(() => settingsStore.videoConfig, () => (selectedResolutionFps.value = savedModeKey()))
const autoModeLabel = `Auto (best available, up to ${DEFAULT_VIDEO_MODE.height}p @ ${DEFAULT_VIDEO_MODE.frameRate}fps)`

const hasCapabilities = computed(() => {
  return settingsStore.cameraCapabilities && settingsStore.cameraCapabilities.options.length > 0
})

const filteredMacros = computed(() => {
  if (!macroSearchQuery.value.trim()) {
    return macrosStore.macros
  }
  const query = macroSearchQuery.value.toLowerCase()
  return macrosStore.macros.filter((macro) => {
    return (
      macro.name.toLowerCase().includes(query) ||
      macro.message.toLowerCase().includes(query)
    )
  })
})

const handleApplyResolution = () => {
  const value = selectedResolutionFps.value
  if (!value) {
    emit('apply-resolution', null)
    return
  }
  const [resolution, fpsStr] = value.split('@')
  const [width, height] = resolution.split('x').map(Number)
  emit('apply-resolution', {width, height, fps: Number(fpsStr)})
}

const handleRecheckResolutions = () => {
  emit('recheck-resolutions')
}

const filterOptions = FILTER_OPTIONS
const isInputFilterValid = computed(() => isValidCssFilter(settingsStore.inputFilter))

const resetDisplaySettings = () => {
  settingsStore.resetDisplaySettings()
  window.$notification({
    type: 'success',
    message: 'Display settings reset',
    timeout: 3000,
  })
}

// Absolute mouse area below 10% (or empty) breaks mouse mapping
const ABS_AREA_MIN = 10
const ABS_AREA_MAX = 100
const clampAbsArea = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(ABS_AREA_MAX, Math.max(ABS_AREA_MIN, value))
    : ABS_AREA_MAX
watch(
  () => [settingsStore.absMouseAreaWidth, settingsStore.absMouseAreaHeight],
  ([width, height]) => {
    const w = clampAbsArea(width)
    const h = clampAbsArea(height)
    if (w !== width) settingsStore.absMouseAreaWidth = w
    if (h !== height) settingsStore.absMouseAreaHeight = h
  },
  {immediate: true}
)

const panelRef = ref<HTMLElement>()
const activeTab = ref<'video' | 'settings' | 'macros' | 'advanced'>('video')

const resetDeviceData = () => {
  emit('reset-devices')
}

const showCursorModeTip = () => {
  window.$notification({
    type: 'info',
    html: 'Linux and Android do not support absolute mouse. Please use relative mouse mode on these systems.',
    timeout: 10000,
  })
}

const showKeyboardCompatibleModeTip = () => {
  window.$notification({
    type: 'info',
    html: 'It is recommended to enable this mode on Linux clients or when keystroke issues occur. This will break the ctrl+scroll wheel zoom functionality.',
    timeout: 10000,
  })
}

// Macro management
// Matches the name limit enforced by MacroDialog
const MACRO_NAME_MAX_LENGTH = 30
const showMacroDialog = ref(false)
const editingMacro = ref<IMacro | null>(null)

// Watch macro dialog visibility and emit changes
watch(showMacroDialog, (visible) => {
  emit('update:macroDialogVisible', visible)
})

// Move focus into the dialog so keyboard input doesn't go to the page behind it
watch(mVisible, async (visible) => {
  if (visible) {
    await nextTick()
    panelRef.value?.focus()
  }
})

// Clicking outside the panel closes it, unless the press started inside (e.g. selecting text)
const pressedOutside = ref(false)
const handleOutsideClick = () => {
  if (pressedOutside.value) {
    mVisible.value = false
  }
  pressedOutside.value = false
}

// Esc closes the dialog; captured so it isn't also handled by the KVM input or video-only mode
const handleEscape = (e: KeyboardEvent) => {
  if (e.key !== 'Escape' || !mVisible.value || showMacroDialog.value) return
  e.preventDefault()
  e.stopImmediatePropagation()
  mVisible.value = false
}
onMounted(() => window.addEventListener('keydown', handleEscape, true))
onBeforeUnmount(() => window.removeEventListener('keydown', handleEscape, true))

const handleAddMacro = () => {
  editingMacro.value = null
  showMacroDialog.value = true
}

const handleEditMacro = (macro: IMacro) => {
  editingMacro.value = macro
  showMacroDialog.value = true
}

const handleSaveMacro = (data: {name: string; message: string}) => {
  if (editingMacro.value) {
    // Update existing macro
    macrosStore.updateMacro(editingMacro.value.id, data)
    window.$notification({
      type: 'success',
      message: 'Macro updated successfully',
      timeout: 3000,
    })
  } else {
    // Add new macro
    const newMacro: IMacro = {
      id: Date.now().toString(),
      name: data.name,
      message: data.message,
    }
    macrosStore.addMacro(newMacro)
    window.$notification({
      type: 'success',
      message: 'Macro added successfully',
      timeout: 3000,
    })
  }
}

const handleDeleteMacro = (id: string) => {
  macrosStore.deleteMacro(id)
  window.$notification({
    type: 'success',
    message: 'Macro deleted',
    timeout: 3000,
  })
}

const handleClearAllMacros = () => {
  if (macrosStore.macros.length === 0) {
    window.$notification({
      type: 'warning',
      message: 'No macros to clear',
      timeout: 3000,
    })
    return
  }

  if (confirm(`Are you sure you want to delete all ${macrosStore.macros.length} macro(s)?`)) {
    macrosStore.clearAllMacros()
    window.$notification({
      type: 'success',
      message: 'All macros cleared',
      timeout: 3000,
    })
  }
}

const handleExportMacros = () => {
  if (macrosStore.macros.length === 0) {
    window.$notification({
      type: 'warning',
      message: 'No macros to export',
      timeout: 3000,
    })
    return
  }

  const data = JSON.stringify(macrosStore.exportMacros(), null, 2)
  const blob = new Blob([data], {type: 'application/json'})
  const url = URL.createObjectURL(blob)
  downloadUrl(url, `kbkvm_macros_${fileTimestamp()}.json`)
  setTimeout(() => URL.revokeObjectURL(url), 10000)

  window.$notification({
    type: 'success',
    message: 'Macros exported successfully',
    timeout: 3000,
  })
}

const handleImportMacros = () => {
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'application/json,.json'

  fileInput.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const data: unknown = JSON.parse(text)

      if (!Array.isArray(data)) {
        throw new Error('Invalid file format: expected an array')
      }

      // Same rules as MacroDialog; invalid entries are skipped, duplicate ids regenerated
      const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
      const seenIds = new Set<string>()
      const macros: IMacro[] = []
      let skipped = 0
      for (const item of data) {
        if (
          !item ||
          typeof item !== 'object' ||
          !isNonEmptyString(item.id) ||
          !isNonEmptyString(item.name) ||
          !isNonEmptyString(item.message) ||
          item.name.trim().length > MACRO_NAME_MAX_LENGTH
        ) {
          skipped++
          continue
        }
        let id = item.id
        while (seenIds.has(id)) {
          id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        }
        seenIds.add(id)
        macros.push({id, name: item.name.trim(), message: item.message})
      }

      if (!macros.length) {
        throw new Error(skipped ? `none of the ${skipped} entries are valid macros` : 'the file contains no macros')
      }

      macrosStore.importMacros(macros)
      window.$notification({
        type: skipped ? 'warning' : 'success',
        message: `Imported ${macros.length} macro(s)` + (skipped ? `, skipped ${skipped} invalid entr${skipped === 1 ? 'y' : 'ies'}` : ''),
        timeout: skipped ? 5000 : 3000,
      })
    } catch (error: any) {
      window.$notification({
        type: 'error',
        message: `Failed to import macros: ${error.message}`,
        timeout: 5000,
      })
    }
  })

  fileInput.click()
}
</script>

<template>
  <!-- Single root: clicks and keys inside the dialogs never reach the player behind them -->
  <div class="settings-prompt-root" @click.stop @keydown.stop @keyup.stop>
  <transition name="fade">
    <div v-if="mVisible" class="settings-backdrop" @click="mVisible = false"></div>
  </transition>
  <transition name="fade-scale">
    <div
      v-if="mVisible"
      class="settings-prompt"
      @mousedown.self="pressedOutside = true"
      @click.self="handleOutsideClick"
    >
      <div
        ref="panelRef"
        class="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-prompt-title"
        tabindex="-1"
      >
        <div class="settings-header">
          <h2 id="settings-prompt-title">
            <span class="mdi mdi-cog"></span>
            Settings
          </h2>
          <div class="settings-header-actions">
            <button class="btn-close" title="Close (Esc)" aria-label="Close settings" @click="mVisible = false">
              <span class="mdi mdi-close"></span>
            </button>
          </div>
        </div>

        <div class="settings-tabs">
          <button class="tab-btn" :class="{active: activeTab === 'video'}" @click="activeTab = 'video'">
            <span class="mdi mdi-video"></span>
            Video
          </button>
          <button class="tab-btn" :class="{active: activeTab === 'settings'}" @click="activeTab = 'settings'">
            <span class="mdi mdi-tune"></span>
            Settings
          </button>
          <button class="tab-btn" :class="{active: activeTab === 'macros'}" @click="activeTab = 'macros'">
            <span class="mdi mdi-script-text-play"></span>
            Macros
          </button>
          <button class="tab-btn" :class="{active: activeTab === 'advanced'}" @click="activeTab = 'advanced'">
            <span class="mdi mdi-wrench"></span>
            Advanced
          </button>
        </div>

        <div class="settings-content" @contextmenu.prevent>

          <!-- Video Tab -->
          <div v-if="activeTab === 'video'" class="tab-cols">
            <div class="tab-col">
              <div class="settings-section">
                <div class="section-header">
                  <span class="mdi mdi-video"></span>
                  <h3>Video</h3>
                </div>

                <div class="info-card" v-if="graphInfo">
                  <span class="mdi mdi-information-outline"></span>
                  <div class="info-content">
                    <span class="info-label">Current Resolution</span>
                    <code class="info-value">{{
                      `${graphInfo.width}x${graphInfo.height} @ ${parseFloat((graphInfo.frameRate || 0).toFixed(2))}fps`
                    }}</code>
                  </div>
                </div>

                <button
                  v-if="settingsStore.currentVideoDeviceId"
                  class="btn-recheck"
                  @click="handleRecheckResolutions"
                >
                  <span class="mdi mdi-refresh"></span>
                  Recheck Video Settings
                </button>

                <div v-if="hasCapabilities" class="resolution-settings">
                  <div class="form-group">
                    <label class="form-label">
                      <span class="mdi mdi-video-settings"></span>
                      Resolution & Frame Rate
                    </label>
                    <select v-model="selectedResolutionFps" class="form-select">
                      <option value="">{{ autoModeLabel }}</option>
                      <option
                        v-for="option in settingsStore.cameraCapabilities?.options"
                        :key="`${option.width}x${option.height}@${option.fps}`"
                        :value="`${option.width}x${option.height}@${option.fps}`"
                      >
                        {{ option.label }}
                      </option>
                    </select>
                  </div>
                  <button class="btn-apply" @click="handleApplyResolution">
                    <span class="mdi mdi-check-circle"></span>
                    Apply Resolution & Frame Rate Settings
                  </button>
                </div>

                <div v-else-if="isTestingCapabilities" class="info-card info-card-loading">
                  <span class="mdi mdi-loading mdi-spin"></span>
                  <div class="info-content">
                    <span class="info-label">Testing resolution settings</span>
                    <span class="info-text">Please wait while available resolutions are detected...</span>
                  </div>
                </div>

                <div v-else-if="settingsStore.currentVideoDeviceId" class="resolution-settings">
                  <div class="info-card info-card-warning">
                    <span class="mdi mdi-alert-circle-outline"></span>
                    <div class="info-content">
                      <span class="info-label">Camera capabilities unavailable</span>
                      <span class="info-text">This camera does not support querying resolutions, or the stream has not started yet.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="tab-col">
              <div class="settings-section">
                <div class="form-group">
                  <label class="form-label">
                    <span class="mdi mdi-fit-to-screen"></span>
                    Video Fit Mode
                  </label>
                  <div class="radio-group">
                    <label class="radio-label" v-for="mode in ['contain', 'fill', 'cover', 'none']" :key="mode">
                      <input type="radio" :value="mode" v-model="settingsStore.fitMode" class="radio-input" />
                      <span class="radio-text">{{ mode }}</span>
                    </label>
                  </div>
                </div>
              </div>

              <div class="settings-section">
                <div class="section-header">
                  <span class="mdi mdi-flip-horizontal"></span>
                  <h3>Flip & Rotate Video</h3>
                </div>
                <div class="flip-rotate-container">
                  <div class="flip-rotate-left">
                    <div class="form-group">
                      <label class="form-label-small">
                        <span class="mdi mdi-rotate-right"></span>
                        Rotate
                      </label>
                      <div class="radio-group-vertical">
                        <label class="radio-label-compact" v-for="angle in [0, 90, -90, 180]" :key="angle">
                          <input type="radio" :value="angle" v-model="settingsStore.filterRotation" class="radio-input" />
                          <span class="radio-text">{{ angle === 0 ? 'None' : angle + '°' }}</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div class="flip-rotate-right">
                    <!-- filterMirrorY applies rotateY(180deg): a left-right mirror -->
                    <div class="form-group-checkbox">
                      <label class="checkbox-label">
                        <input type="checkbox" v-model="settingsStore.filterMirrorY" class="checkbox-input" />
                        <span class="checkbox-text">
                          <span class="mdi mdi-flip-horizontal"></span>
                          Mirror (left-right)
                        </span>
                      </label>
                    </div>
                    <!-- filterMirrorX applies rotateX(180deg): an upside-down flip -->
                    <div class="form-group-checkbox">
                      <label class="checkbox-label">
                        <input type="checkbox" v-model="settingsStore.filterMirrorX" class="checkbox-input" />
                        <span class="checkbox-text">
                          <span class="mdi mdi-flip-vertical"></span>
                          Flip upside down
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div class="settings-section">
                <div class="section-header">
                  <span class="mdi mdi-palette"></span>
                  <h3>Color Filters</h3>
                </div>
                <div class="radio-group-vertical filter-grid">
                  <label class="radio-label-compact" v-for="option in filterOptions" :key="option.value">
                    <input
                      type="checkbox"
                      :value="option.value"
                      v-model="settingsStore.selectedFilters"
                      :disabled="!!settingsStore.inputFilter && isInputFilterValid"
                      class="radio-input"
                    />
                    <span class="radio-text">{{ option.label }}</span>
                  </label>
                </div>
                <div class="form-group">
                  <label class="form-label-small" for="settings-input-filter">
                    <span class="mdi mdi-code-parentheses"></span>
                    Custom CSS filter (overrides the presets above)
                  </label>
                  <input
                    id="settings-input-filter"
                    v-model.trim="settingsStore.inputFilter"
                    type="text"
                    class="form-input"
                    :class="{invalid: !isInputFilterValid}"
                    placeholder="e.g. brightness(1.2) contrast(1.1)"
                    spellcheck="false"
                  />
                  <span v-if="!isInputFilterValid" class="input-error">Not a valid CSS filter; the presets above are used instead</span>
                </div>
              </div>

              <div class="settings-section">
                <div class="section-header">
                  <span class="mdi mdi-monitor-eye"></span>
                  <h3>Display</h3>
                </div>
                <div class="form-group-checkbox">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="settingsStore.floatUI" class="checkbox-input" />
                    <span class="checkbox-text">
                      <span class="mdi mdi-dock-top"></span>
                      Floating toolbar (overlays the video)
                    </span>
                  </label>
                </div>
                <div class="form-group-checkbox">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="settingsStore.isShowControls" class="checkbox-input" />
                    <span class="checkbox-text">
                      <span class="mdi mdi-play-box-outline"></span>
                      Show native video controls
                    </span>
                  </label>
                </div>
                <div class="advanced-row">
                  <div class="advanced-row-info">
                    <span class="advanced-row-label">Reset display settings</span>
                    <span class="advanced-row-desc">Rotation, flips, color filters and fit mode back to defaults.</span>
                  </div>
                  <button class="btn-advanced-secondary" @click="resetDisplaySettings">
                    <span class="mdi mdi-restore"></span>
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Settings Tab -->
          <div v-else-if="activeTab === 'settings'" class="tab-cols">
            <div class="tab-col">
              <div class="settings-section">
                <div class="section-header">
                  <span class="mdi mdi-serial-port"></span>
                  <h3>Other Settings</h3>
                </div>
                <div class="form-group-checkbox">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="settingsStore.enableKvmInput" class="checkbox-input" />
                    <span class="checkbox-text">
                      <span class="mdi mdi-keyboard-settings"></span>
                      Enable KVM keyboard &amp; mouse control
                    </span>
                  </label>
                  <span class="checkbox-desc">Turn off to use the app as a plain capture-card viewer.</span>
                </div>
                <template v-if="settingsStore.enableKvmInput">
                <div class="form-group">
                  <label class="form-label">
                    <span class="mdi mdi-speedometer"></span>
                    Baud Rate
                  </label>
                  <div class="radio-group">
                    <label class="radio-label" title="General CH9329 Default">
                      <input type="radio" value="9600" v-model="settingsStore.baudRate" class="radio-input" />
                      <span class="radio-text">9600</span>
                    </label>
                    <label class="radio-label" title="Sipeed NanoKVM USB Default">
                      <input type="radio" value="57600" v-model="settingsStore.baudRate" class="radio-input" />
                      <span class="radio-text">57600</span>
                    </label>
                    <label class="radio-label" title="General CH9329 Modified">
                      <input type="radio" value="115200" v-model="settingsStore.baudRate" class="radio-input" />
                      <span class="radio-text">115200</span>
                    </label>
                  </div>
                </div>
                </template>
              </div>
            </div>

            <div class="tab-col">
              <div class="settings-section" v-if="settingsStore.enableKvmInput">
                <div class="form-group-checkbox">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="settingsStore.keyboardCompatibleMode" class="checkbox-input" />
                    <span class="checkbox-text">
                      <span class="mdi mdi-keyboard"></span>
                      Keyboard Compatible Mode
                    </span>
                    <button class="info-btn" @click="showKeyboardCompatibleModeTip">
                      <span class="mdi mdi-help-circle-outline"></span>
                    </button>
                  </label>
                </div>

                <div class="form-group-checkbox">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="settingsStore.pasteInterceptCtrlV" class="checkbox-input" />
                    <span class="checkbox-text">
                      <span class="mdi mdi-content-paste"></span>
                      Type clipboard on Ctrl+V
                    </span>
                  </label>
                  <span class="checkbox-desc">While controlling the target, Ctrl+V (Cmd+V on Mac) types the local clipboard text on the target. Ctrl+Shift+V is always sent as a normal keystroke.</span>
                </div>

                <div class="form-group-checkbox">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="settingsStore.qrAutoOpenLinks" class="checkbox-input" />
                    <span class="checkbox-text">
                      <span class="mdi mdi-qrcode-scan"></span>
                      Auto-Open QR Code Links
                    </span>
                  </label>
                </div>

                <div class="form-group-checkbox">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="settingsStore.ocrAutoOpenLinks" class="checkbox-input" />
                    <span class="checkbox-text">
                      <span class="mdi mdi-text-recognition"></span>
                      Auto-Open OCR Extracted URLs
                    </span>
                  </label>
                </div>

                <div class="form-group-checkbox">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="settingsStore.autoCaptureMouse" class="checkbox-input" />
                    <span class="checkbox-text">
                      <span class="mdi mdi-cursor-default-click"></span>
                      Auto Capture Mouse
                    </span>
                  </label>
                </div>

                <div class="form-group">
                  <label class="form-label">
                    <span class="mdi mdi-code-brackets"></span>
                    Adv. Text Escape Sequence
                  </label>
                  <div class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="square" v-model="settingsStore.advancedTextEscapeStyle" class="radio-input" />
                      <span class="radio-text">[[ ]]</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="curly" v-model="settingsStore.advancedTextEscapeStyle" class="radio-input" />
                      <span class="radio-text" v-text="'{{ }}'"></span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="pipe" v-model="settingsStore.advancedTextEscapeStyle" class="radio-input" />
                      <span class="radio-text">|| ||</span>
                    </label>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">
                    <span class="mdi mdi-cursor-default"></span>
                    Cursor Mode
                    <button class="info-btn" @click="showCursorModeTip">
                      <span class="mdi mdi-help-circle-outline"></span>
                    </button>
                  </label>
                  <div class="radio-group">
                    <label class="radio-label" v-for="mode in ['relative', 'absolute']" :key="mode">
                      <input type="radio" :value="mode" v-model="settingsStore.cursorMode" class="radio-input" />
                      <span class="radio-text">{{ mode }}</span>
                    </label>
                  </div>
                </div>

                <div class="form-group-row" v-if="settingsStore.cursorMode === 'absolute'">
                  <div class="form-group-inline">
                    <label class="form-label-small">
                      <span class="mdi mdi-arrow-expand-horizontal"></span>
                      Width
                    </label>
                    <div class="input-with-unit">
                      <input class="form-input-small" type="number" step="0.4" v-model.lazy.number="settingsStore.absMouseAreaWidth" :min="ABS_AREA_MIN" :max="ABS_AREA_MAX" />
                      <span class="unit">%</span>
                    </div>
                  </div>
                  <div class="form-group-inline">
                    <label class="form-label-small">
                      <span class="mdi mdi-arrow-expand-vertical"></span>
                      Height
                    </label>
                    <div class="input-with-unit">
                      <input class="form-input-small" type="number" step="0.4" v-model.lazy.number="settingsStore.absMouseAreaHeight" :min="ABS_AREA_MIN" :max="ABS_AREA_MAX" />
                      <span class="unit">%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Macros Tab -->
          <div v-else-if="activeTab === 'macros'" class="tab-cols">
            <div class="tab-col">
              <div class="settings-section">
                <div class="section-header">
                  <span class="mdi mdi-script-text-play"></span>
                  <h3>Macro Management</h3>
                </div>
                <div class="macro-actions">
                  <button class="btn-macro btn-macro-primary" @click="handleAddMacro">
                    <span class="mdi mdi-plus-circle"></span>
                    Add Macro
                  </button>
                  <button class="btn-macro btn-macro-secondary" @click="handleImportMacros">
                    <span class="mdi mdi-import"></span>
                    Import
                  </button>
                  <button class="btn-macro btn-macro-secondary" @click="handleExportMacros">
                    <span class="mdi mdi-export"></span>
                    Export
                  </button>
                  <button class="btn-macro btn-macro-danger" @click="handleClearAllMacros">
                    <span class="mdi mdi-delete-sweep"></span>
                    Clear All
                  </button>
                </div>
              </div>
            </div>

            <div class="tab-col">
              <div v-if="macrosStore.macros.length > 0" class="macro-search">
                <span class="mdi mdi-magnify search-icon"></span>
                <input v-model="macroSearchQuery" type="text" class="search-input" placeholder="Search macros by name or message..." />
                <button v-if="macroSearchQuery" class="clear-search-btn" @click="macroSearchQuery = ''" title="Clear search">
                  <span class="mdi mdi-close"></span>
                </button>
              </div>

              <div v-if="macrosStore.macros.length === 0" class="info-card info-card-warning">
                <span class="mdi mdi-information-outline"></span>
                <div class="info-content">
                  <span class="info-label">No macros saved</span>
                  <span class="info-text">Create a macro to quickly send text with command key support.</span>
                </div>
              </div>

              <div v-else class="macros-list">
                <div v-if="filteredMacros.length === 0" class="info-card info-card-warning">
                  <span class="mdi mdi-information-outline"></span>
                  <div class="info-content">
                    <span class="info-label">No macros found</span>
                    <span class="info-text">No macros match your search query.</span>
                  </div>
                </div>
                <div v-for="macro in filteredMacros" :key="macro.id" class="macro-item">
                  <div class="macro-item-header">
                    <span class="macro-name">{{ macro.name }}</span>
                    <div class="macro-actions-inline">
                      <button class="btn-icon" title="Edit macro" @click="handleEditMacro(macro)">
                        <span class="mdi mdi-pencil"></span>
                      </button>
                      <button class="btn-icon btn-icon-danger" title="Delete macro" @click="handleDeleteMacro(macro.id)">
                        <span class="mdi mdi-delete"></span>
                      </button>
                    </div>
                  </div>
                  <div class="macro-message">{{ macro.message }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Advanced Tab -->
          <div v-else-if="activeTab === 'advanced'" class="tab-cols">
            <div class="tab-col">
              <div class="settings-section">
                <div class="section-header">
                  <span class="mdi mdi-devices"></span>
                  <h3>Device Data</h3>
                </div>
                <div class="advanced-row">
                  <div class="advanced-row-info">
                    <span class="advanced-row-label">Reset Video &amp; Audio Devices</span>
                    <span class="advanced-row-desc">Clears all saved camera and audio device selections, resolution preferences, and capability cache. The app will treat all devices as new on next launch.</span>
                  </div>
                  <button class="btn-advanced-danger" @click="resetDeviceData">
                    <span class="mdi mdi-delete-sweep"></span>
                    Reset Device Data
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  </transition>

  <!-- Macro Dialog -->
  <MacroDialog
    v-model:visible="showMacroDialog"
    :macro="editingMacro"
    @save="handleSaveMacro"
  />
  </div>
</template>

<style scoped lang="scss">
.settings-prompt-root {
  display: contents;
}

.settings-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
}

.settings-prompt {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;

  .settings-panel {
    position: relative;
    background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    width: 100%;
    max-width: 1000px;
    height: 72vh;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(255, 255, 255, 0.1);
    outline: none;
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);

    h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;

      .mdi {
        font-size: 24px;
        color: #ffa01e;
      }
    }

    .settings-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-close {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.7);
      cursor: pointer;
      font-size: 24px;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      transition: all 0.2s;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }
    }
  }

  .settings-tabs {
    display: flex;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding: 0 24px;
    gap: 4px;
    flex-shrink: 0;

    .tab-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 18px;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: rgba(255, 255, 255, 0.5);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: -1px;

      .mdi {
        font-size: 18px;
      }

      &:hover {
        color: rgba(255, 255, 255, 0.8);
      }

      &.active {
        color: #ffa01e;
        border-bottom-color: #ffa01e;
      }
    }
  }

  .settings-content {
    padding: 24px;
    overflow: hidden;
    flex: 1;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    display: flex;
    flex-direction: column;
    gap: 24px;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;

      &:hover {
        background: rgba(255, 255, 255, 0.3);
      }
    }
  }

  .tab-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    align-items: start;
    height: 100%;
  }

  .tab-col {
    display: flex;
    flex-direction: column;
    gap: 24px;
    height: 100%;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  }

  .settings-section {
    margin-bottom: 0;

    &:last-child {
      margin-bottom: 0;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);

      .mdi {
        font-size: 20px;
        color: #ffa01e;
      }

      h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #fff;
      }
    }
  }

  .info-card {
    display: flex;
    gap: 12px;
    padding: 12px 16px;
    background: rgba(255, 160, 30, 0.1);
    border: 1px solid rgba(255, 160, 30, 0.3);
    border-radius: 8px;
    margin-bottom: 16px;

    .mdi {
      font-size: 20px;
      color: #ffa01e;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .info-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;

      .info-label {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .info-value {
        font-size: 14px;
        color: #ffa01e;
        font-family: 'Courier New', monospace;
        font-weight: 500;
      }

      .info-text {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.8);
      }
    }

    &.info-card-warning {
      background: rgba(255, 152, 0, 0.1);
      border-color: rgba(255, 152, 0, 0.3);

      .mdi {
        color: #ff9800;
      }

      .info-label {
        color: rgba(255, 152, 0, 0.9);
      }
    }

    &.info-card-loading {
      background: rgba(33, 150, 243, 0.1);
      border-color: rgba(33, 150, 243, 0.3);

      .mdi {
        color: #2196f3;
      }

      .info-label {
        color: rgba(33, 150, 243, 0.9);
      }
    }
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .mdi-spin {
    animation: spin 1s linear infinite;
  }

  .resolution-settings {
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding-top: 16px;
    margin-top: 8px;
  }

  .btn-apply {
    width: 100%;
    padding: 12px 16px;
    background: linear-gradient(135deg, #ffa01e 0%, #ff8c00 100%);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.2s;
    margin-top: 16px;

    .mdi {
      font-size: 18px;
    }

    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #ffb84d 0%, #ffa01e 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(255, 160, 30, 0.4);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
    }

    &:disabled {
      background: rgba(255, 160, 30, 0.3);
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  .btn-recheck {
    width: 100%;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 160, 30, 0.3);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.9);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.2s;
    margin-top: 8px;

    .mdi {
      font-size: 18px;
    }

    &:hover {
      background: rgba(255, 160, 30, 0.1);
      border-color: rgba(255, 160, 30, 0.5);
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
    }
  }

  .form-group {
    margin-bottom: 16px;

    .form-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.9);
      margin-bottom: 8px;
      font-weight: 500;

      .mdi {
        font-size: 18px;
        color: rgba(255, 255, 255, 0.6);
      }

      .info-btn {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        font-size: 16px;
        padding: 0;
        display: flex;
        align-items: center;
        transition: color 0.2s;
        margin-left: auto;

        &:hover {
          color: #ffa01e;
        }
      }
    }

    .form-select {
      width: 100%;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.25);
      }

      &:focus {
        outline: none;
        background: rgba(255, 255, 255, 0.1);
        border-color: #ffa01e;
      }

      option {
        background: #2d2d2d;
        color: #fff;
      }
    }
  }

  .form-group-checkbox {
    margin-bottom: 12px;

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      padding: 10px 12px;
      border-radius: 8px;
      transition: background 0.2s;

      &:hover {
        background: rgba(255, 255, 255, 0.05);
      }

      .checkbox-input {
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: #ffa01e;
      }

      .checkbox-text {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        color: rgba(255, 255, 255, 0.9);

        .mdi {
          font-size: 18px;
          color: rgba(255, 255, 255, 0.6);
        }
      }

      .info-btn {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        font-size: 16px;
        padding: 4px;
        display: flex;
        align-items: center;
        border-radius: 4px;
        transition: all 0.2s;

        &:hover {
          color: #ffa01e;
          background: rgba(255, 160, 30, 0.1);
        }
      }
    }
  }

  .radio-group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    .radio-label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      padding: 10px 14px;
      border-radius: 8px;
      transition: background 0.2s;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      flex: 1;
      min-width: fit-content;

      &:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
      }

      .radio-input {
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: #ffa01e;
        flex-shrink: 0;
      }

      .radio-text {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.9);
        text-transform: capitalize;
        white-space: nowrap;
      }
    }
  }

  .flip-rotate-container {
    display: flex;
    gap: 24px;
    align-items: flex-start;
  }

  .flip-rotate-left {
    flex: 0 0 140px;

    .form-label-small {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.8);
      margin-bottom: 8px;
      font-weight: 500;

      .mdi {
        font-size: 16px;
        color: rgba(255, 255, 255, 0.6);
      }
    }
  }

  .flip-rotate-right {
    flex: 1;
  }

  .radio-group-vertical.filter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 6px;
    margin-bottom: 16px;
  }

  .form-group .form-label-small {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 8px;
    font-weight: 500;

    .mdi {
      font-size: 16px;
      color: rgba(255, 255, 255, 0.6);
    }
  }

  .form-input {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    color: #fff;
    font-size: 14px;
    font-family: 'Courier New', monospace;
    transition: all 0.2s;

    &:focus {
      outline: none;
      background: rgba(255, 255, 255, 0.1);
      border-color: #ffa01e;
    }

    &.invalid {
      border-color: rgba(244, 67, 54, 0.7);
    }
  }

  .input-error {
    display: block;
    margin-top: 6px;
    font-size: 12px;
    color: #f44336;
  }

  .form-group-checkbox .checkbox-desc {
    display: block;
    padding: 0 12px 0 40px;
    font-size: 12px;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.45);
  }

  .radio-group-vertical {
    display: flex;
    flex-direction: column;
    gap: 6px;

    .radio-label-compact {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      padding: 8px 12px;
      border-radius: 6px;
      transition: background 0.2s;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);

      &:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
      }

      .radio-input {
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: #ffa01e;
        flex-shrink: 0;
      }

      .radio-text {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.9);
        white-space: nowrap;
      }
    }
  }

  .form-group-row {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;

    .form-group-inline {
      flex: 1;

      .form-label-small {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.8);
        margin-bottom: 6px;
        font-weight: 500;

        .mdi {
          font-size: 16px;
          color: rgba(255, 255, 255, 0.6);
        }
      }

      .input-with-unit {
        display: flex;
        align-items: center;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        overflow: hidden;
        transition: all 0.2s;

        &:focus-within {
          border-color: #ffa01e;
          background: rgba(255, 255, 255, 0.08);
        }

        .form-input-small {
          flex: 1;
          padding: 8px 10px;
          background: transparent;
          border: none;
          color: #fff;
          font-size: 14px;

          &:focus {
            outline: none;
          }

          /* Remove number input arrows */
          &::-webkit-outer-spin-button,
          &::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          -moz-appearance: textfield;
        }

        .unit {
          padding: 0 10px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 13px;
          font-weight: 500;
        }
      }
    }
  }
}

// Fade animation for backdrop
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

// Fade scale animation for modal panel
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.3s ease;

  .settings-panel {
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @media (max-width: 600px) {
    .settings-panel {
      max-width: 100%;
    }

    .settings-tabs .tab-btn {
      padding: 10px 12px;
      font-size: 13px;
    }

    .tab-cols {
      grid-template-columns: 1fr;
    }
  }
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  .settings-panel {
    opacity: 0;
    transform: scale(0.9) translateY(-20px);
  }
}

// Macro Management Styles
.macro-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 16px;

  .btn-macro {
    padding: 10px 12px;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: all 0.2s;

    .mdi {
      font-size: 16px;
    }

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    &:active {
      transform: translateY(0);
    }

    &.btn-macro-primary {
      background: linear-gradient(135deg, #ffa01e 0%, #ff8c00 100%);
      color: white;

      &:hover {
        background: linear-gradient(135deg, #ffb84d 0%, #ffa01e 100%);
      }
    }

    &.btn-macro-secondary {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: rgba(255, 255, 255, 0.9);

      &:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.25);
      }
    }

    &.btn-macro-danger {
      background: rgba(244, 67, 54, 0.15);
      border: 1px solid rgba(244, 67, 54, 0.3);
      color: #f44336;

      &:hover {
        background: rgba(244, 67, 54, 0.25);
        border-color: rgba(244, 67, 54, 0.5);
      }
    }
  }
}

.macro-search {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 12px;

  .search-icon {
    position: absolute;
    left: 12px;
    font-size: 18px;
    color: rgba(255, 255, 255, 0.5);
    pointer-events: none;
  }

  .search-input {
    flex: 1;
    padding: 10px 40px 10px 40px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.9);
    font-size: 14px;
    transition: all 0.2s;

    &::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }

    &:focus {
      outline: none;
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 160, 30, 0.5);
      box-shadow: 0 0 0 2px rgba(255, 160, 30, 0.1);
    }
  }

  .clear-search-btn {
    position: absolute;
    right: 8px;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    font-size: 20px;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.8);
    }
  }
}

.macros-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;

    &:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  }

  .macro-item {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 12px;
    transition: all 0.2s;

    &:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .macro-item-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;

      .macro-name {
        font-size: 14px;
        font-weight: 600;
        color: #ffa01e;
      }

      .macro-actions-inline {
        display: flex;
        gap: 4px;

        .btn-icon {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          font-size: 18px;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: all 0.2s;

          &:hover {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.9);
          }

          &.btn-icon-danger {
            &:hover {
              background: rgba(244, 67, 54, 0.2);
              color: #f44336;
            }
          }
        }
      }
    }

    .macro-message {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
      font-family: 'Courier New', monospace;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.4;
      max-height: 60px;
      overflow-y: auto;
      padding: 6px 8px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 4px;

      &::-webkit-scrollbar {
        width: 3px;
      }

      &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
      }
    }
  }
}

// Advanced Tab Styles
.advanced-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  &:last-child {
    border-bottom: none;
  }
}

.advanced-row-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.advanced-row-label {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.88);
}

.advanced-row-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.5;
}

.btn-advanced-secondary {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.25);
  }

  .mdi {
    font-size: 16px;
  }
}

.btn-advanced-danger {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid rgba(244, 67, 54, 0.4);
  border-radius: 8px;
  background: rgba(244, 67, 54, 0.1);
  color: #f44336;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover {
    background: rgba(244, 67, 54, 0.22);
    border-color: rgba(244, 67, 54, 0.7);
  }

  &:active {
    background: rgba(244, 67, 54, 0.32);
  }

  .mdi {
    font-size: 16px;
  }
}
</style>
