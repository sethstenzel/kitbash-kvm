<script lang="ts">
export default {
  name: 'KBKvmController',
}
</script>

<script setup lang="ts">
import {onMounted, ref, computed, shallowRef, onBeforeUnmount} from 'vue'
import TauriActions from '@/components/KBKvmController/TauriActions.vue'
import {useSettingsStore} from '@/stores/settings'
import SettingsPrompt from '@/components/KBKvmController/SettingsPrompt.vue'
import KBKvmInput from '@/components/KBKvmController/KBKvmInput.vue'
import QRScanner from '@/components/KBKvmController/QRScanner.vue'
import OCRScanner from '@/components/KBKvmController/OCRScanner.vue'
import MacrosMenu from '@/components/KBKvmController/MacrosMenu.vue'
import {useActionBar} from '@/components/KBKvmController/hooks/use-action-bar'
import DragButton from '@/components/KBKvmController/UI/DragButton.vue'

// Import composables
import {useMediaDevices} from './composables/useMediaDevices'
import {useMediaStream} from './composables/useMediaStream'
import {useCameraCapabilities} from './composables/useCameraCapabilities'
import {useVideoRecording} from './composables/useVideoRecording'
import {useScreenshot} from './composables/useScreenshot'
import {useVideoFilters} from './composables/useVideoFilters'
import {usePlayerUI} from './composables/usePlayerUI'
import {isPromptVisible} from '@/components/PromptInput/prompt-input'

const settingsStore = useSettingsStore()

// Refs
const isTauri = ref(!!window.__TAURI__)
const videoRef = ref<HTMLVideoElement>()
const rootRef = shallowRef<HTMLElement>()
const kvmInputRef = ref()
const absMouseRef = ref()

// Graph info state
const graphInfo = ref({
  width: 100,
  height: 100,
  aspectRatio: 1,
})

// Action bar hook
const {actionBarRef, isShowFloatBar, isShowFloatBarInNonKvmMode} = useActionBar()

// Action bar dragging
const actionBarOffset = ref(0) // Horizontal offset in pixels
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartOffset = ref(0)

const handleActionBarMouseDown = (event: MouseEvent) => {
  // Only allow dragging on the action bar background, not on buttons/controls
  const target = event.target as HTMLElement
  if (
    target.tagName === 'BUTTON' ||
    target.tagName === 'SELECT' ||
    target.tagName === 'LABEL' ||
    target.tagName === 'INPUT' ||
    target.closest('button') ||
    target.closest('select') ||
    target.closest('label')
  ) {
    return
  }

  isDragging.value = true
  dragStartX.value = event.clientX
  dragStartOffset.value = actionBarOffset.value
  event.preventDefault()
}

const handleMouseMove = (event: MouseEvent) => {
  if (!isDragging.value) return

  const deltaX = event.clientX - dragStartX.value
  const newOffset = dragStartOffset.value + deltaX

  // Limit to 25% of window width on either side
  const maxOffset = window.innerWidth * 0.25
  actionBarOffset.value = Math.max(-maxOffset, Math.min(maxOffset, newOffset))
}

const handleMouseUp = () => {
  isDragging.value = false
}

onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
})

// Media devices composable
const {
  loadingText: devicesLoadingText,
  isDeviceInfoVisible,
  permissionCamera,
  permissionMicrophone,
  videoDeviceList,
  audioDeviceList,
  currentDeviceInfo,
  updateDeviceList,
  showDeviceInfoTemporarily,
  cleanupDeviceInfo,
} = useMediaDevices()

// Media stream composable
const {
  mediaStreamRef,
  loadingText: streamLoadingText,
  isStreaming,
  startMediaStream,
  handleStartStreaming,
  stopMediaStreaming,
  clearSelect,
} = useMediaStream({
  videoRef,
  videoDeviceList,
  audioDeviceList,
  onStreamStarted: (info) => {
    graphInfo.value = info
  },
  onCapabilitiesQuery: (videoTrack) => {
    queryCameraCapabilities(videoTrack)
  },
  showDeviceInfoTemporarily,
})

// Camera capabilities composable
const {
  loadingText: capabilitiesLoadingText,
  queryCameraCapabilities,
  applyResolutionSettings,
  recheckResolutionSettings,
} = useCameraCapabilities()

// Video recording composable
const {videoRecorder} = useVideoRecording(videoRef)

// Screenshot composable
const {handleScreenshot} = useScreenshot(videoRef)

// Player UI composable
const {
  showSettings,
  loadingText: uiLoadingText,
  criticalError,
  toggleFullScreen,
  isFullscreen,
  isActionBarVisible,
  resetError,
} = usePlayerUI(rootRef, {isShowFloatBar, isShowFloatBarInNonKvmMode})

// Track dialog visibility states
const isMacroDialogVisible = ref(false)

// Computed property to check if any dialog is open
const isAnyDialogOpen = computed(() => {
  return showSettings.value || isMacroDialogVisible.value || isPromptVisible.value
})

// Video filters composable
const {videoFilterStyle, videoWrapperStyle, deviceInfoOverlayStyle} = useVideoFilters({
  graphInfo,
  isFullscreen,
})

// Computed properties
const loadingText = computed(() => {
  return (
    devicesLoadingText.value ||
    streamLoadingText.value ||
    capabilitiesLoadingText.value ||
    uiLoadingText.value
  )
})

const isTestingCapabilities = computed(() => {
  return capabilitiesLoadingText.value === 'Testing input resolution settings...'
})

// Enhanced device info with resolution
const enhancedDeviceInfo = computed(() => {
  if (!currentDeviceInfo.value || !isStreaming.value) {
    return null
  }

  return {
    ...currentDeviceInfo.value,
    resolution: `${graphInfo.value.width}x${graphInfo.value.height}`,
    aspectRatio: graphInfo.value.aspectRatio.toFixed(2),
    config: settingsStore.videoConfig
      ? `${settingsStore.videoConfig.width}x${settingsStore.videoConfig.height} @ ${settingsStore.videoConfig.frameRate}fps`
      : null,
  }
})

/**
 * Listen for device change events
 */
const listenDeviceChange = () => {
  navigator.mediaDevices.ondevicechange = async () => {
    await updateDeviceList()

    // Check if currently selected devices still exist
    if (settingsStore.currentVideoDeviceId) {
      const videoExists = videoDeviceList.value.some(
        (device) => device.deviceId === settingsStore.currentVideoDeviceId
      )
      if (!videoExists) {
        console.warn('Active video device was removed. Stopping stream.')
        stopMediaStreaming()
        settingsStore.currentVideoDeviceId = ''
        settingsStore.videoConfig = null
        window.$notification({
          type: 'warning',
          message: 'Video device disconnected',
          timeout: 3000,
        })
      }
    }

    if (settingsStore.currentAudioDeviceId) {
      const audioExists = audioDeviceList.value.some(
        (device) => device.deviceId === settingsStore.currentAudioDeviceId
      )
      if (!audioExists) {
        console.warn('Active audio device was removed.')
        settingsStore.currentAudioDeviceId = ''
        // Restart stream with video only if video device still exists
        if (settingsStore.currentVideoDeviceId && isStreaming.value) {
          await handleStartStreaming()
        }
      }
    }
  }
}

/**
 * Request permissions and initialize devices
 */
const requirePermission = () => {
  clearSelect()
  initDevices()
}

/**
 * Initialize devices on mount
 */
const initDevices = async () => {
  try {
    uiLoadingText.value = 'Initializing devices...'

    // Check if MediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'MediaDevices API not supported. Please use a modern browser with camera/microphone support.'
      )
    }

    // Request permissions first to get proper device labels
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({audio: true})
      tempStream.getTracks().forEach((track) => track.stop())
    } catch (e) {
      console.warn('getUserMedia audio Error:', e)
    }
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({video: true})
      tempStream.getTracks().forEach((track) => track.stop())
    } catch (e) {
      console.warn('getUserMedia video Error:', e)
    }

    // Update device list after permissions are granted
    await updateDeviceList()

    if (settingsStore.currentVideoDeviceId || settingsStore.currentAudioDeviceId) {
      await startMediaStream()
      listenDeviceChange()
      return
    }

    listenDeviceChange()
  } catch (error: any) {
    console.error('Critical error during initialization:', error)

    // Check for critical errors that should show fallback UI
    if (
      error.message?.includes('not supported') ||
      error.name === 'NotSupportedError' ||
      error.name === 'NotAllowedError'
    ) {
      criticalError.value = {
        message: 'Unable to initialize media devices',
        details: error.message,
      }
    } else {
      // Non-critical errors show as notifications
      window.$notification({
        type: 'error',
        message: error.message || 'An error occurred',
        timeout: 5000,
      })
    }
  } finally {
    uiLoadingText.value = ''
  }
}

/**
 * Enter KVM control mode
 */
const enterInputMode = async () => {
  if (!kvmInputRef.value) {
    return
  }
  // Prevent entering input mode when any dialog is open
  if (isAnyDialogOpen.value) {
    return
  }

  // Check if auto capture is disabled
  if (!settingsStore.autoCaptureMouse) {
    const shouldCapture = confirm('Capture mouse for KVM control?')
    if (!shouldCapture) {
      return
    }
  }

  kvmInputRef.value.autoEnable(absMouseRef.value)
}

/**
 * Apply resolution settings wrapper
 */
const handleApplyResolution = async () => {
  await applyResolutionSettings(
    settingsStore.currentVideoDeviceId,
    settingsStore.currentAudioDeviceId,
    mediaStreamRef,
    videoRef,
    (info) => {
      graphInfo.value = info
      showDeviceInfoTemporarily()
    }
  )
}

/**
 * Recheck resolutions wrapper
 */
const handleRecheckResolutions = async () => {
  await recheckResolutionSettings(mediaStreamRef)
}

// Lifecycle hooks
onMounted(async () => {
  await initDevices()
})

onBeforeUnmount(() => {
  stopMediaStreaming()
  // Remove device change listener to prevent memory leak
  if (navigator.mediaDevices) {
    navigator.mediaDevices.ondevicechange = null
  }
  // Clear device info timeout
  cleanupDeviceInfo()
})
</script>

<template>
  <div ref="rootRef" class="web-mediadevices-player" @click="enterInputMode">
    <!-- Critical Error Fallback UI -->
    <div v-if="criticalError" class="error-boundary">
      <div class="error-content">
        <span class="error-icon">⚠️</span>
        <h2>{{ criticalError.message }}</h2>
        <p v-if="criticalError.details" class="error-details">{{ criticalError.details }}</p>
        <div class="error-actions">
          <button class="btn-retry" @click="resetError(), initDevices()">
            <span class="mdi mdi-refresh"></span>
            Retry
          </button>
        </div>
      </div>
    </div>

    <transition name="fade">
      <div class="loading-layer" v-if="loadingText">⌛ {{ loadingText }}</div>
    </transition>
    <div
      @click.stop
      :class="[settingsStore.floatUI ? 'float-ui' : null]"
      class="action-bar-wrap"
      :style="{transform: `translateX(${actionBarOffset}px)`}"
    >
      <DragButton
        v-if="settingsStore.floatUI && settingsStore.enableKvmInput"
        :docked="!isShowFloatBar"
        @click.stop="isShowFloatBar = !isShowFloatBar"
      />
      <div
        ref="actionBarRef"
        class="action-bar font-emoji"
        :class="[
          settingsStore.floatUI && 'float-bar',
          {
            visible: isActionBarVisible,
            dragging: isDragging,
          },
        ]"
        @mousedown="handleActionBarMouseDown"
      >
        <transition name="fade-left">
          <div style="transition-delay: 0.3s" v-show="isActionBarVisible" class="action-bar-side">
            <div class="flex-row-center-gap">
              <label
                class="select-label-wrapper"
                for="videoSelect"
                title="Select Video Device"
                :class="{activated: settingsStore.currentVideoDeviceId}"
              >
                <span class="mdi mdi-monitor"></span>
                <template v-if="permissionCamera === 'granted'">
                  <select
                    class="btn-no-style"
                    id="videoSelect"
                    v-model="settingsStore.currentVideoDeviceId"
                    @change="handleStartStreaming"
                  >
                    <option
                      v-for="item in videoDeviceList"
                      :key="item.deviceId"
                      :value="item.deviceId"
                    >
                      {{ item.label }}
                    </option>
                  </select>
                </template>
                <button
                  :title="permissionCamera"
                  class="btn-no-style icon-alert"
                  v-else
                  @click="requirePermission"
                >
                  ⚠️
                </button>
              </label>

              <label
                class="select-label-wrapper"
                for="audioSelect"
                title="Select Audio Device"
                :class="{activated: settingsStore.currentAudioDeviceId}"
              >
                <span class="mdi mdi-speaker"></span>
                <template v-if="permissionMicrophone === 'granted'">
                  <select
                    class="btn-no-style"
                    id="audioSelect"
                    v-model="settingsStore.currentAudioDeviceId"
                    @change="handleStartStreaming"
                  >
                    <option
                      v-for="item in audioDeviceList"
                      :key="item.deviceId"
                      :value="item.deviceId"
                    >
                      {{ item.label }}
                    </option>
                  </select>
                </template>
                <button
                  class="btn-no-style icon-alert"
                  :title="permissionMicrophone"
                  v-else
                  @click="requirePermission"
                >
                  ⚠️
                </button>
              </label>

              <button
                class="btn-no-style orange"
                @click="stopMediaStreaming"
                v-if="isStreaming"
                title="Stop All Media Devices"
              >
                <span class="mdi mdi-stop-circle-outline"></span>
              </button>
              <button
                class="btn-no-style green"
                title="Start Media Devices"
                @click="handleStartStreaming"
                v-else
              >
                <span class="mdi mdi-play-circle-outline"></span>
              </button>
              <button class="btn-no-style" @click="clearSelect" title="🛑 Reset All Media Devices">
                <span class="mdi mdi-close-circle-outline"></span>
              </button>

              <!-- Separator -->
              <div class="menu-separator"></div>

              <!-- Screenshot button - greyed out when not streaming -->
              <button
                class="btn-no-style"
                @click="handleScreenshot($event)"
                :disabled="!isStreaming"
                title="Screenshot (Shift+Click for area)"
              >
                <span class="mdi mdi-camera-plus-outline"></span>
              </button>

              <!-- OCR Scanner button - greyed out when not streaming -->
              <OCRScanner v-if="isStreaming" />

              <!-- QR Scanner button - greyed out when not streaming -->
              <QRScanner v-if="isStreaming" />

              <!-- Separator -->
              <div class="menu-separator"></div>

              <!-- Record button - greyed out when not streaming -->
              <template v-if="videoRecorder">
                <button
                  class="btn-no-style recording"
                  v-if="Boolean(videoRecorder.mediaRecorder)"
                  @click="videoRecorder.stop()"
                  title="📹 Recording, click to save record"
                >
                  <span class="mdi mdi-record"></span>
                </button>
                <button
                  v-else
                  class="btn-no-style"
                  @click="videoRecorder.start()"
                  :disabled="!isStreaming"
                  title="Record"
                >
                  <span class="mdi mdi-radiobox-marked"></span>
                </button>
              </template>
            </div>
          </div>
        </transition>

        <transition name="fade-right">
          <div
            style="transition-delay: 0.3s"
            v-show="isActionBarVisible"
            class="action-bar-side right"
          >
            <template v-if="settingsStore.enableKvmInput">
              <KBKvmInput ref="kvmInputRef" @connected="enterInputMode" />
              <span style="opacity: 0.5">|</span>
              <MacrosMenu />
              <span style="opacity: 0.5">|</span>
            </template>

            <button @click="showSettings = !showSettings" title="Settings" class="btn-no-style">
              <span class="mdi mdi-cog"></span>
            </button>
            <button
              v-if="!isTauri"
              @click="toggleFullScreen"
              class="btn-no-style"
              title="Fullscreen"
            >
              <span v-if="!isFullscreen" class="mdi mdi-fullscreen"></span>
              <span v-else class="mdi mdi-fullscreen-exit"></span>
            </button>
            <TauriActions v-if="isTauri" />
          </div>
        </transition>
      </div>
    </div>

    <div class="main-graph-wrapper">
      <div
        class="video-wrapper"
        @dblclick.stop="toggleFullScreen"
        :style="videoWrapperStyle"
      >
        <div
          v-show="settingsStore.enableKvmInput && settingsStore.cursorMode === 'absolute'"
          class="abs-mouse-container"
        >
          <div
            class="abs-mouse-area"
            :class="{showBorder: showSettings}"
            ref="absMouseRef"
            :style="{
              width: settingsStore.absMouseAreaWidth + '%',
              height: settingsStore.absMouseAreaHeight + '%',
            }"
          ></div>
        </div>
        <video
          ref="videoRef"
          id="streamVideo"
          autoplay
          playsinline
          :controls="settingsStore.isShowControls"
          :style="videoFilterStyle"
          v-show="!loadingText"
        ></video>

        <!-- Device Info Overlay - Auto-hides after 8 seconds -->
        <transition name="fade">
          <div
            v-if="enhancedDeviceInfo && isStreaming && isDeviceInfoVisible"
            class="device-info-overlay"
            :style="deviceInfoOverlayStyle"
          >
            <div class="device-info-content">
              <div class="info-row">
                <span class="mdi mdi-video"></span>
                <span class="device-name">{{ enhancedDeviceInfo.videoName }}</span>
              </div>
              <div v-if="enhancedDeviceInfo.audioName" class="info-row">
                <span class="mdi mdi-microphone"></span>
                <span class="device-name">{{ enhancedDeviceInfo.audioName }}</span>
              </div>
              <div class="info-row">
                <span class="mdi mdi-fit-to-screen-outline"></span>
                <span>{{ enhancedDeviceInfo.resolution }}</span>
                <span v-if="enhancedDeviceInfo.config" class="config-hint"
                  >({{ enhancedDeviceInfo.config }})</span
                >
              </div>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <SettingsPrompt
      @click.stop
      v-model:visible="showSettings"
      v-model:macro-dialog-visible="isMacroDialogVisible"
      :graph-info="graphInfo"
      :is-testing-capabilities="isTestingCapabilities"
      @apply-resolution="handleApplyResolution"
      @recheck-resolutions="handleRecheckResolutions"
    />
  </div>
</template>

<style lang="scss">
.web-mediadevices-player {
  background-color: black;
  height: 100%;
  width: 100%;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  --radius: 8px;
  --bg: black;

  .action-bar-wrap {
    z-index: 10;
    user-select: none;
    pointer-events: none;
    transition: transform 0.2s ease-out;
    will-change: transform;

    &.float-ui {
      position: absolute;
      left: 0;
      right: 0;
      padding-top: 10px;
    }

    .action-bar {
      height: 100%;
      padding: 5px;
      background: linear-gradient(180deg, rgba(0, 0, 0, 0.53), transparent);
      transition: opacity 0.3s;
      display: flex;
      align-items: center;

      justify-content: space-between;
      gap: 10px;
      pointer-events: auto;
      visibility: visible;
      opacity: 1;
      cursor: grab;

      &.dragging {
        cursor: grabbing;
        user-select: none;
      }

      &.float-bar {
        background: rgba(0, 0, 0, 0.7);
        outline: 1px solid rgba(255, 255, 255, 0.1);

        border-radius: 100px;
        align-items: center;

        margin: 0 auto;
        max-width: 1250px;

        visibility: hidden;
        opacity: 0;
        width: 0;
        height: 0;
        overflow: hidden;
        transition: all 0.5s cubic-bezier(0.18, 0.89, 0.32, 1.28);

        &.visible {
          visibility: visible;
          opacity: 1;

          width: 625px;
          height: 62.5px;
          min-height: 35px;
          padding: 5px 17.5px;

          transition-delay: 0.15s;
        }

        .flex-row-center-gap {
          gap: 5px;
        }

        .select-label-wrapper {
          border-radius: 5px;
          width: 27.5px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

          &:hover {
            background-color: rgba(255, 255, 255, 0.15);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3),
                        0 0 0 1px rgba(255, 255, 255, 0.1);
          }

          &::after {
            left: 4px;
            right: 4px;
          }

          select {
            position: absolute;
            z-index: 2;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            opacity: 0;
          }

          .icon-alert {
            position: absolute;
            z-index: 2;
            right: 0;
            bottom: 0;
          }
        }
      }

      span,
      a {
        font-size: 12px;
      }

      a {
        text-decoration: none;
      }

      .select-label-wrapper {
        position: relative;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border-radius: 6px;
        padding: 4px 6px;

        &:hover {
          background-color: rgba(255, 255, 255, 0.1);
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }

        &.activated {
          &::after {
            background-color: #4caf50;
            box-shadow: 0 0 8px rgba(76, 175, 80, 0.6);
          }
        }

        &::after {
          content: ' ';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background-color: currentColor;
          border-radius: 10px;
          pointer-events: none;
          transition: all 0.3s ease;
        }

        .mdi {
          position: relative;
          z-index: 1;
          pointer-events: none;
        }
      }

      select {
        width: 50px;
        line-height: 1;
        font-size: 12px;
        background: black !important;

        option {
          color: white;
          background: #252525;
        }
      }

      .action-bar-side {
        display: flex;
        align-items: center;
        gap: 5px;
        flex-wrap: wrap;

        &.right {
          justify-content: flex-end;
          flex-wrap: nowrap;
        }

        label {
          display: flex;
          align-items: center;
          gap: 2.5px;
        }
      }

      select {
        width: 125px;
      }

      .mdi {
        font-size: 22.5px;
      }

      .recording {
        color: #f44336;
        animation: linear blink-animation 3s infinite;
      }

      .btn-no-style {
        display: flex;
        line-height: 1;
        border-radius: 100px;
        padding: 2.5px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;

        &:hover {
          background-color: rgba(255, 255, 255, 0.15);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3),
                      0 0 0 1px rgba(255, 255, 255, 0.1);
        }

        &:active {
          transform: translateY(0);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        &.blue {
          color: #2196f3;

          &:hover {
            background-color: rgba(33, 150, 243, 0.2);
            box-shadow: 0 4px 12px rgba(33, 150, 243, 0.4),
                        0 0 0 1px rgba(33, 150, 243, 0.3);
          }
        }

        &.green {
          color: #4caf50;

          &:hover {
            background-color: rgba(76, 175, 80, 0.2);
            box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4),
                        0 0 0 1px rgba(76, 175, 80, 0.3);
          }
        }

        &.orange {
          color: #ffcc00;

          &:hover {
            background-color: rgba(255, 204, 0, 0.2);
            box-shadow: 0 4px 12px rgba(255, 204, 0, 0.4),
                        0 0 0 1px rgba(255, 204, 0, 0.3);
          }
        }

        &.red {
          color: #f44336;

          &:hover {
            background-color: rgba(244, 67, 54, 0.2);
            box-shadow: 0 4px 12px rgba(244, 67, 54, 0.4),
                        0 0 0 1px rgba(244, 67, 54, 0.3);
          }
        }
      }

      .menu-separator {
        width: 1px;
        height: 24px;
        background: rgba(255, 255, 255, 0.2);
        margin: 0 8px;
      }
    }
  }

  .main-graph-wrapper {
    overflow: hidden;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .video-wrapper {
    max-width: 100%;
    max-height: 100%;
    position: relative;

    video {
      width: 100%;
      height: 100%;
      transition: all 1s;
    }

    .abs-mouse-container {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;

      .abs-mouse-area {
        width: 100%;
        height: 100%;

        &.showBorder {
          outline: 2px solid #f44336;
          outline-offset: -2px;

          &::before {
            content: 'Abs Mouse Area';
            background-color: #f44336;
            color: white;
            font-size: 12px;
            font-style: italic;
            margin: 0;
            position: absolute;
            padding: 2px 6px;
            font-weight: bold;
          }
        }

        cursor: crosshair;
      }
    }

    .device-info-overlay {
      position: absolute;
      bottom: 12px;
      left: 12px;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(10px);
      border-radius: 8px;
      padding: 12px 16px;
      color: white;
      font-size: 13px;
      z-index: 2;
      pointer-events: none;
      border: 1px solid rgba(255, 255, 255, 0.1);

      .device-info-content {
        display: flex;
        flex-direction: column;
        gap: 6px;

        .info-row {
          display: flex;
          align-items: center;
          gap: 8px;

          .mdi {
            font-size: 16px;
            color: rgba(255, 255, 255, 0.7);
          }

          .device-name {
            font-weight: 500;
          }

          .config-hint {
            color: rgba(255, 255, 255, 0.6);
            font-size: 11px;
            margin-left: 4px;
          }
        }
      }
    }
  }

  .loading-layer {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    color: white;
    z-index: 20;
    font-size: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s;
  }

  .loading-layer.visible {
    visibility: visible;
    opacity: 1;
  }

  .error-boundary {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;

    .error-content {
      text-align: center;
      max-width: 500px;
      background: rgba(255, 255, 255, 0.05);
      padding: 40px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);

      .error-icon {
        font-size: 64px;
        display: block;
        margin-bottom: 20px;
      }

      h2 {
        color: #fff;
        font-size: 24px;
        margin: 0 0 16px 0;
        font-weight: 600;
      }

      .error-details {
        color: rgba(255, 255, 255, 0.7);
        font-size: 14px;
        margin: 0 0 24px 0;
        line-height: 1.5;
      }

      .error-actions {
        display: flex;
        gap: 12px;
        justify-content: center;

        .btn-retry {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          background: #4caf50;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;

          &:hover {
            background: #45a049;
            transform: translateY(-1px);
          }

          .mdi {
            font-size: 20px;
          }
        }
      }
    }
  }
}
</style>
