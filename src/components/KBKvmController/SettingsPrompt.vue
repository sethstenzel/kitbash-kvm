<script setup lang="ts">
import {ref, watch, computed} from 'vue'
import {useVModel} from '@vueuse/core'
import {useSettingsStore} from '@/stores/settings'
import {useMacrosStore, type IMacro} from '@/stores/macros'
import {getVersion, uniOpenUrl} from '@/utils'
import MacroDialog from '@/components/MacroDialog/MacroDialog.vue'
import {downloadUrl} from '@/components/KBKvmController/utils'
import moment from 'moment/moment'

const settingsStore = useSettingsStore()
const macrosStore = useMacrosStore()
const macroSearchQuery = ref('')

interface Props {
  visible: boolean
  graphInfo?: any
  isTestingCapabilities?: boolean
}

const emit = defineEmits(['update:visible', 'apply-resolution', 'recheck-resolutions', 'update:macroDialogVisible'])
const props = withDefaults(defineProps<Props>(), {
  visible: false,
})
const mVisible = useVModel(props, 'visible', emit)

// Computed property for resolution/FPS combination selection
const selectedResolutionFps = computed({
  get: () => {
    if (!settingsStore.preferredResolutionFps) return ''
    const {width, height, fps} = settingsStore.preferredResolutionFps
    return `${width}x${height}@${fps}`
  },
  set: (value: string) => {
    if (!value) {
      settingsStore.preferredResolutionFps = null
    } else {
      const [resolution, fpsStr] = value.split('@')
      const [width, height] = resolution.split('x').map(Number)
      const fps = Number(fpsStr)
      settingsStore.preferredResolutionFps = {width, height, fps}
    }
  },
})

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
  emit('apply-resolution')
}

const handleRecheckResolutions = () => {
  emit('recheck-resolutions')
}

const filterOptions = [
  {value: 'grayscale(1)', label: 'Grayscale'},
  {value: 'sepia(1)', label: 'Sepia'},
  {value: 'contrast(3)', label: 'Contrast'},
  {value: 'hue-rotate(90deg)', label: 'Hue rotate'},
  {value: 'blur(10px)', label: 'Blur'},
  {value: 'invert(1)', label: 'Invert'},
  {value: 'brightness(2)', label: 'Brightness'},
]

const rootRef = ref(null)

const kvmInputHelp = () => {
  uniOpenUrl('https://github.com/kkocdko/kblog/blob/master/source/toys/webusbkvm/README.md')
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
const showMacroDialog = ref(false)
const editingMacro = ref<IMacro | null>(null)

// Watch macro dialog visibility and emit changes
watch(showMacroDialog, (visible) => {
  emit('update:macroDialogVisible', visible)
})

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
  downloadUrl(url, `kbkvm_macros_${moment().format('YYYY-MM-DD_HH-mm-ss')}.json`)
  URL.revokeObjectURL(url)

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
      const data = JSON.parse(text) as IMacro[]

      // Validate the data
      if (!Array.isArray(data)) {
        throw new Error('Invalid file format: expected an array')
      }

      for (const item of data) {
        if (!item.id || !item.name || !item.message) {
          throw new Error('Invalid macro format: missing required fields')
        }
      }

      macrosStore.importMacros(data)
      window.$notification({
        type: 'success',
        message: `Imported ${data.length} macro(s) successfully`,
        timeout: 3000,
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
  <transition name="fade-scale">
    <div
      ref="rootRef"
      v-if="mVisible"
      class="settings-prompt"
      @keydown.stop
      @keyup.stop
    >
      <div class="settings-backdrop" @click="mVisible = false"></div>

      <div class="settings-panel">
        <div class="settings-header">
          <h2>
            <span class="mdi mdi-cog"></span>
            Settings
          </h2>
          <button class="btn-close" @click="mVisible = false">
            <span class="mdi mdi-close"></span>
          </button>
        </div>

        <div class="settings-content" @contextmenu.prevent>
          <!-- Left Column: Video/Camera Settings -->
          <div class="settings-column">
            <!-- Video Section -->
            <div class="settings-section">
            <div class="section-header">
              <span class="mdi mdi-video"></span>
              <h3>Video</h3>
            </div>

            <div class="info-card" v-if="settingsStore.videoConfig">
              <span class="mdi mdi-information-outline"></span>
              <div class="info-content">
                <span class="info-label">Current Resolution</span>
                <code class="info-value">{{
                  `${graphInfo.width}x${graphInfo.height} @ ${parseFloat((settingsStore.videoConfig.frameRate || 0).toFixed(2))}fps`
                }}</code>
              </div>
            </div>

            <!-- Resolution & FPS Settings -->
            <div v-if="hasCapabilities" class="resolution-settings">
              <div class="form-group">
                <label class="form-label">
                  <span class="mdi mdi-video-settings"></span>
                  Resolution & Frame Rate
                </label>
                <select v-model="selectedResolutionFps" class="form-select">
                  <option value="">Choose a resolution...</option>
                  <option
                    v-for="option in settingsStore.cameraCapabilities?.options"
                    :key="`${option.width}x${option.height}@${option.fps}`"
                    :value="`${option.width}x${option.height}@${option.fps}`"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </div>

              <button
                class="btn-apply"
                @click="handleApplyResolution"
                :disabled="!selectedResolutionFps"
              >
                <span class="mdi mdi-check-circle"></span>
                Apply Settings
              </button>

              <button class="btn-recheck" @click="handleRecheckResolutions">
                <span class="mdi mdi-refresh"></span>
                Recheck Resolution Settings
              </button>
            </div>

            <div v-else-if="isTestingCapabilities" class="info-card info-card-loading">
              <span class="mdi mdi-loading mdi-spin"></span>
              <div class="info-content">
                <span class="info-label">Testing resolution settings</span>
                <span class="info-text">Please wait while available resolutions are detected...</span>
              </div>
            </div>

            <div v-else-if="settingsStore.currentVideoDeviceId" class="info-card info-card-warning">
              <span class="mdi mdi-alert-circle-outline"></span>
              <div class="info-content">
                <span class="info-label">Camera capabilities unavailable</span>
                <span class="info-text">This camera does not support querying resolutions.</span>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">
                <span class="mdi mdi-fit-to-screen"></span>
                Video Fit Mode
              </label>
              <div class="radio-group">
                <label class="radio-label" v-for="mode in ['contain', 'fill', 'cover', 'none']" :key="mode">
                  <input
                    type="radio"
                    :value="mode"
                    v-model="settingsStore.fitMode"
                    class="radio-input"
                  />
                  <span class="radio-text">{{ mode }}</span>
                </label>
              </div>
            </div>

            <!-- Flip & Rotate Video Section -->
            <div class="settings-section">
              <div class="section-header">
                <span class="mdi mdi-flip-horizontal"></span>
                <h3>Flip & Rotate Video</h3>
              </div>

              <div class="flip-rotate-container">
                <!-- Left side: Rotation controls -->
                <div class="flip-rotate-left">
                  <div class="form-group">
                    <label class="form-label-small">
                      <span class="mdi mdi-rotate-right"></span>
                      Rotate
                    </label>
                    <div class="radio-group-vertical">
                      <label class="radio-label-compact" v-for="angle in [0, 90, -90, 180]" :key="angle">
                        <input
                          type="radio"
                          :value="angle"
                          v-model="settingsStore.filterRotation"
                          class="radio-input"
                        />
                        <span class="radio-text">{{ angle === 0 ? 'None' : angle + '°' }}</span>
                      </label>
                    </div>
                  </div>
                </div>

                <!-- Right side: Flip controls -->
                <div class="flip-rotate-right">
                  <div class="form-group-checkbox">
                    <label class="checkbox-label">
                      <input type="checkbox" v-model="settingsStore.filterMirrorY" class="checkbox-input" />
                      <span class="checkbox-text">
                        <span class="mdi mdi-flip-horizontal"></span>
                        Flip Horizontally
                      </span>
                    </label>
                  </div>

                  <div class="form-group-checkbox">
                    <label class="checkbox-label">
                      <input type="checkbox" v-model="settingsStore.filterMirrorX" class="checkbox-input" />
                      <span class="checkbox-text">
                        <span class="mdi mdi-flip-vertical"></span>
                        Flip Vertically
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>

          <!-- Right Column: Serial, Mouse, Keyboard Settings -->
          <div class="settings-column">
            <!-- Serial Settings Section -->
            <div class="settings-section" v-if="settingsStore.enableKvmInput">
            <div class="section-header">
              <span class="mdi mdi-serial-port"></span>
              <h3>Other Settings</h3>
            </div>

            <div class="form-group">
              <label class="form-label">
                <span class="mdi mdi-speedometer"></span>
                Baud Rate
              </label>
              <div class="radio-group">
                <label class="radio-label" v-for="rate in [9600, 115200]" :key="rate">
                  <input
                    type="radio"
                    :value="rate + ''"
                    v-model="settingsStore.baudRate"
                    class="radio-input"
                  />
                  <span class="radio-text">{{ rate }}</span>
                </label>
              </div>
            </div>

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
                <span class="mdi mdi-cursor-default"></span>
                Cursor Mode
                <button class="info-btn" @click="showCursorModeTip">
                  <span class="mdi mdi-help-circle-outline"></span>
                </button>
              </label>
              <div class="radio-group">
                <label class="radio-label" v-for="mode in ['relative', 'absolute']" :key="mode">
                  <input
                    type="radio"
                    :value="mode"
                    v-model="settingsStore.cursorMode"
                    class="radio-input"
                  />
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
                  <input
                    class="form-input-small"
                    type="number"
                    step="0.4"
                    v-model="settingsStore.absMouseAreaWidth"
                    :min="0"
                    :max="100"
                  />
                  <span class="unit">%</span>
                </div>
              </div>

              <div class="form-group-inline">
                <label class="form-label-small">
                  <span class="mdi mdi-arrow-expand-vertical"></span>
                  Height
                </label>
                <div class="input-with-unit">
                  <input
                    class="form-input-small"
                    type="number"
                    step="0.4"
                    v-model="settingsStore.absMouseAreaHeight"
                    :min="0"
                    :max="100"
                  />
                  <span class="unit">%</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Macro Management Section -->
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

            <div v-if="macrosStore.macros.length > 0" class="macro-search">
              <span class="mdi mdi-magnify search-icon"></span>
              <input
                v-model="macroSearchQuery"
                type="text"
                class="search-input"
                placeholder="Search macros by name or message..."
              />
              <button
                v-if="macroSearchQuery"
                class="clear-search-btn"
                @click="macroSearchQuery = ''"
                title="Clear search"
              >
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
              <div
                v-for="macro in filteredMacros"
                :key="macro.id"
                class="macro-item"
              >
                <div class="macro-item-header">
                  <span class="macro-name">{{ macro.name }}</span>
                  <div class="macro-actions-inline">
                    <button
                      class="btn-icon"
                      title="Edit macro"
                      @click="handleEditMacro(macro)"
                    >
                      <span class="mdi mdi-pencil"></span>
                    </button>
                    <button
                      class="btn-icon btn-icon-danger"
                      title="Delete macro"
                      @click="handleDeleteMacro(macro.id)"
                    >
                      <span class="mdi mdi-delete"></span>
                    </button>
                  </div>
                </div>
                <div class="macro-message">{{ macro.message }}</div>
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
</template>

<style scoped lang="scss">
.settings-prompt {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;

  .settings-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
  }

  .settings-panel {
    position: relative;
    background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    width: 100%;
    max-width: 1000px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(255, 255, 255, 0.1);
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

  .settings-content {
    padding: 24px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    align-items: start;

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

  .settings-column {
    display: flex;
    flex-direction: column;
    gap: 24px;
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

// Fade scale animation
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.3s ease;

  .settings-backdrop {
    transition: opacity 0.3s ease;
  }

  .settings-panel {
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  // Responsive: Stack columns on smaller screens
  @media (max-width: 768px) {
    .settings-panel {
      max-width: 500px;
    }

    .settings-content {
      grid-template-columns: 1fr;
      gap: 16px;
    }
  }
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  .settings-backdrop {
    opacity: 0;
  }

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
  max-height: 300px;
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
</style>
