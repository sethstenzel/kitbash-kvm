<script lang="ts">
export default {
  name: 'KBKvmController',
}
</script>

<script setup lang="ts">
import KbIcon from '@/components/KBKvmController/UI/KbIcon.vue'
import {onMounted, ref, computed, onBeforeUnmount} from 'vue'
import TauriActions from '@/components/KBKvmController/TauriActions.vue'
import {useSettingsStore} from '@/stores/settings'
import SettingsPrompt from '@/components/KBKvmController/SettingsPrompt.vue'
import KBKvmInput from '@/components/KBKvmController/KBKvmInput.vue'
import QRScanner from '@/components/KBKvmController/QRScanner.vue'
import OCRScanner from '@/components/KBKvmController/OCRScanner.vue'
import MacrosMenu from '@/components/KBKvmController/MacrosMenu.vue'
import {useActionBar} from '@/components/KBKvmController/hooks/use-action-bar'

// Import composables
import {useMediaDevices} from './composables/useMediaDevices'
import {useMediaStream, type IStreamInfo} from './composables/useMediaStream'
import {useCameraCapabilities} from './composables/useCameraCapabilities'
import {useVideoRecording} from './composables/useVideoRecording'
import {useScreenshot} from './composables/useScreenshot'
import {useVideoFilters} from './composables/useVideoFilters'
import {usePlayerUI} from './composables/usePlayerUI'
import {isPromptVisible} from '@/components/PromptInput/prompt-input'
import {eventBus} from '@/utils/event-bus'
import {isTauri} from '@/utils'
import {useSerialState} from '@/components/KBKvmController/utils/serial-state'

const settingsStore = useSettingsStore()
const {serialPort} = useSerialState()

// Refs
const videoRef = ref<HTMLVideoElement>()
const mainGraphRef = ref<HTMLElement>()
const kvmInputRef = ref()
const absMouseRef = ref()

// public/ asset; BASE_URL keeps it working when the app is served from a subpath
const logoUrl = `${import.meta.env.BASE_URL}logo.png`

// Graph info state
const graphInfo = ref<IStreamInfo>({
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
const actionBarWrapRef = ref<HTMLElement | null>(null)
let rafId = 0
let pendingOffset: number | null = null

const applyActionBarOffset = (offset: number) => {
  // Applied directly to the DOM element to avoid Vue reactivity overhead during drag
  if (actionBarWrapRef.value) {
    actionBarWrapRef.value.style.transform = `translateX(${offset}px)`
  }
  actionBarOffset.value = offset
}

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
  const maxOffset = window.innerWidth * 0.25
  const newOffset = Math.max(-maxOffset, Math.min(maxOffset, dragStartOffset.value + deltaX))

  pendingOffset = newOffset
  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    if (pendingOffset !== null) {
      applyActionBarOffset(pendingOffset)
      pendingOffset = null
    }
  })
}

const handleMouseUp = () => {
  if (!isDragging.value) return
  isDragging.value = false
  cancelAnimationFrame(rafId)
  // Commit the last position that hadn't been painted yet
  if (pendingOffset !== null) {
    applyActionBarOffset(pendingOffset)
    pendingOffset = null
  }
}

const handleScanStart = () => { isShowFloatBar.value = false }
const handleScanEnd = () => { isShowFloatBar.value = true }

// Video-only mode
const isVideoOnlyMode = ref(false)
const enterVideoOnlyMode = () => {
  isVideoOnlyMode.value = true
  isShowFloatBar.value = false
}
const exitVideoOnlyMode = () => {
  isVideoOnlyMode.value = false
  isShowFloatBar.value = true
}
const handleVideoOnlyKeydown = (e: KeyboardEvent) => {
  if (isVideoOnlyMode.value && e.key === 'Escape') {
    e.stopImmediatePropagation()
    exitVideoOnlyMode()
  }
}

onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  eventBus.on('scan_start', handleScanStart)
  eventBus.on('scan_end', handleScanEnd)
  document.addEventListener('keydown', handleVideoOnlyKeydown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
  eventBus.off('scan_start', handleScanStart)
  eventBus.off('scan_end', handleScanEnd)
  document.removeEventListener('keydown', handleVideoOnlyKeydown, true)
})

// Media devices composable
const {
  deviceList,
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
  waitingForVideoDevice,
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
})

// Camera capabilities composable
const {
  loadingText: capabilitiesLoadingText,
  queryCameraCapabilities,
  applyResolutionSettings,
  recheckResolutionSettings,
} = useCameraCapabilities({
  restartStream: () => handleStartStreaming(),
})

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
} = usePlayerUI({isShowFloatBar, isShowFloatBarInNonKvmMode})

// Track dialog visibility states
const isMacroDialogVisible = ref(false)

// Computed property to check if any dialog is open
const isAnyDialogOpen = computed(() => {
  return showSettings.value || isMacroDialogVisible.value || isPromptVisible.value
})

// Video filters composable
const {videoFilterStyle, videoWrapperStyle, deviceInfoOverlayStyle} = useVideoFilters({
  graphInfo,
  containerRef: mainGraphRef,
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

  const {width, height, frameRate} = graphInfo.value
  const config = settingsStore.videoConfig
  return {
    ...currentDeviceInfo.value,
    resolution: `${width}x${height}${frameRate ? ` @ ${Math.round(frameRate)}fps` : ''}`,
    aspectRatio: graphInfo.value.aspectRatio.toFixed(2),
    config: config?.userSelected
      ? `requested ${config.width}x${config.height} @ ${config.frameRate}fps`
      : 'auto',
  }
})

// Set when the selected capture device was unplugged, so it can resume when plugged back in
/**
 * Listen for device change events
 */
const listenDeviceChange = () => {
  navigator.mediaDevices.ondevicechange = async () => {
    await updateDeviceList()

    // Check if currently selected devices still exist. The selection (and its saved mode) is
    // kept so a bumped cable doesn't force the user to reconfigure.
    if (settingsStore.currentVideoDeviceId) {
      const videoExists = videoDeviceList.value.some(
        (device) => device.deviceId === settingsStore.currentVideoDeviceId
      )
      if (!videoExists && isStreaming.value) {
        console.warn('Active video device was removed. Stopping stream.')
        stopMediaStreaming()
        waitingForVideoDevice.value = true
        window.$notification({
          type: 'warning',
          message: 'Video device disconnected, will resume when reconnected',
          timeout: 3000,
        })
        return
      } else if (videoExists && waitingForVideoDevice.value && !isStreaming.value) {
        await handleStartStreaming()
        return
      }
    }

    // Audio keeps its selection too: drop it from the stream while missing, add it back on return
    if (settingsStore.currentAudioDeviceId && isStreaming.value) {
      const audioExists = audioDeviceList.value.some(
        (device) => device.deviceId === settingsStore.currentAudioDeviceId
      )
      const hasAudioTrack = !!mediaStreamRef.value?.getAudioTracks().some((t) => t.readyState === 'live')
      if (audioExists !== hasAudioTrack) {
        console.warn(`Audio device ${audioExists ? 'reconnected' : 'removed'}, restarting stream`)
        await handleStartStreaming()
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

    // Device labels are empty until permission is granted. Only open throwaway streams when
    // needed: each one briefly opens the capture card at the browser's default resolution.
    await updateDeviceList()
    const devices = deviceList.value
    const needsPermission = (kind: MediaDeviceKind) =>
      devices.some((d) => d.kind === kind && !d.label)
    // Requested separately so denying the microphone doesn't also block the camera
    const kinds = (['audioinput', 'videoinput'] as const).filter(needsPermission)
    for (const kind of kinds) {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia(
          kind === 'audioinput' ? {audio: true} : {video: true}
        )
        tempStream.getTracks().forEach((track) => track.stop())
      } catch (e) {
        console.warn(`getUserMedia ${kind} permission error:`, e)
      }
    }
    if (kinds.length) {
      await updateDeviceList()
    }

    if (settingsStore.currentVideoDeviceId) {
      // Saved device not plugged in yet: resume automatically once it appears
      waitingForVideoDevice.value = !videoDeviceList.value.some(
        (d) => d.deviceId === settingsStore.currentVideoDeviceId
      )
      if (!waitingForVideoDevice.value) {
        await startMediaStream()
      }
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
 * Clicking the video enters KVM control; overlays and the idle placeholder don't
 */
const handleRootClick = () => {
  if (isVideoOnlyMode.value || !isStreaming.value || loadingText.value || criticalError.value) {
    return
  }
  enterInputMode()
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

  // Clicks on the target bubble up here while captured; don't re-prompt for each one
  if (kvmInputRef.value.isCaptured?.()) {
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
const handleApplyResolution = async (mode: {width: number; height: number; fps: number} | null) => {
  await applyResolutionSettings(mode)
  showDeviceInfoTemporarily()
}

/**
 * Recheck resolutions wrapper
 */
const handleRecheckResolutions = async () => {
  await recheckResolutionSettings(mediaStreamRef)
}

const handleResetDevices = () => {
  stopMediaStreaming()
  settingsStore.currentVideoDeviceId = ''
  settingsStore.currentAudioDeviceId = ''
  settingsStore.videoConfig = null
  settingsStore.cameraCapabilities = null
  settingsStore.cameraCapabilitiesCache = {}
  window.$notification({
    type: 'success',
    message: 'Device data cleared. Please reselect your camera and audio devices.',
    timeout: 4000,
  })
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
  <div class="web-mediadevices-player" @click="handleRootClick">
    <!-- Critical Error Fallback UI -->
    <div v-if="criticalError" class="error-boundary">
      <div class="error-content">
        <KbIcon class="error-icon" name="warning" :size="64" />
        <h2>{{ criticalError.message }}</h2>
        <p v-if="criticalError.details" class="error-details">{{ criticalError.details }}</p>
        <div class="error-actions">
          <button class="btn-retry" @click.stop="resetError(), initDevices()">
            <span class="mdi mdi-refresh"></span>
            Retry
          </button>
        </div>
      </div>
    </div>

    <transition name="fade">
      <div class="loading-layer" v-if="loadingText"><KbIcon class="spin" name="loading" :size="28" /> {{ loadingText }}</div>
    </transition>
    <div
      @click.stop
      :class="[settingsStore.floatUI ? 'float-ui' : null, {dragging: isDragging}]"
      class="action-bar-wrap"
      ref="actionBarWrapRef"
      :style="{transform: `translateX(${actionBarOffset}px)`}"
    >
      <div
        ref="actionBarRef"
        class="action-bar"
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
                <KbIcon name="video-source" />
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
                  <KbIcon name="warning" :size="14" />
                </button>
              </label>

              <label
                class="select-label-wrapper"
                for="audioSelect"
                title="Select Audio Device"
                :class="{activated: settingsStore.currentAudioDeviceId}"
              >
                <KbIcon name="audio-source" />
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
                  <KbIcon name="warning" :size="14" />
                </button>
              </label>

              <button
                class="btn-no-style orange"
                @click="stopMediaStreaming"
                v-if="isStreaming"
                title="Stop All Media Devices"
              >
                <KbIcon name="stop" />
              </button>
              <button
                class="btn-no-style green"
                title="Start Media Devices"
                @click="handleStartStreaming"
                v-else
              >
                <KbIcon name="play" />
              </button>
              <button class="btn-no-style" @click="clearSelect" title="🛑 Reset All Media Devices">
                <KbIcon name="reset" />
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
                <KbIcon name="screenshot" />
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
                  :disabled="videoRecorder.stopping"
                  @click="videoRecorder.stop()"
                  :title="videoRecorder.stopping ? 'Saving recording...' : '📹 Recording, click to save record'"
                >
                  <KbIcon name="recording" />
                </button>
                <button
                  v-else
                  class="btn-no-style"
                  @click="videoRecorder.start()"
                  :disabled="!isStreaming"
                  title="Record"
                >
                  <KbIcon name="record" />
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
              <KBKvmInput ref="kvmInputRef" :videoOnlyMode="isVideoOnlyMode" @connected="enterInputMode" @menu-close="isShowFloatBar = false" @menu-open="isShowFloatBar = true" />
              <template v-if="serialPort">
                <div class="menu-separator"></div>
                <MacrosMenu />
              </template>
              <div class="menu-separator"></div>
            </template>

            <button @click="showSettings = !showSettings" title="Settings" class="btn-no-style">
              <KbIcon name="settings" />
            </button>
            <button
              class="btn-no-style"
              :class="{active: isVideoOnlyMode}"
              :title="isVideoOnlyMode ? 'Exit Video Only Mode (Esc)' : 'Video Only Mode'"
              @click.stop="isVideoOnlyMode ? exitVideoOnlyMode() : enterVideoOnlyMode()"
            >
              <KbIcon :name="isVideoOnlyMode ? 'video-only-off' : 'video-only'" />
            </button>
            <button
              v-if="!isTauri"
              @click="toggleFullScreen"
              class="btn-no-style"
              title="Fullscreen"
            >
              <KbIcon v-if="!isFullscreen" name="fullscreen" />
              <KbIcon v-else name="fullscreen-exit" />
            </button>
            <TauriActions v-if="isTauri" />
          </div>
        </transition>
      </div>
    </div>

    <div ref="mainGraphRef" class="main-graph-wrapper">
      <!-- No-stream placeholder — lives outside video-wrapper so it fills the full app area -->
      <transition name="fade">
        <div v-if="!isStreaming && !loadingText" class="no-stream-placeholder">
          <img :src="logoUrl" alt="KitBash KVM" class="no-stream-logo" />
        </div>
      </transition>

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
                <KbIcon name="video-source" :size="16" />
                <span class="device-name">{{ enhancedDeviceInfo.videoName }}</span>
              </div>
              <div v-if="enhancedDeviceInfo.audioName" class="info-row">
                <KbIcon name="microphone" :size="16" />
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
      v-model:visible="showSettings"
      v-model:macro-dialog-visible="isMacroDialogVisible"
      :graph-info="isStreaming ? graphInfo : null"
      :is-testing-capabilities="isTestingCapabilities"
      @apply-resolution="handleApplyResolution"
      @recheck-resolutions="handleRecheckResolutions"
      @reset-devices="handleResetDevices"
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

    &.dragging {
      transition: none;
    }

    &.float-ui {
      position: absolute;
      left: 0;
      right: 0;
      padding-top: 0;
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
        // KitBash palette: frosted charcoal panel with the logo's orange / red / navy as a base stripe
        position: relative;
        background: rgba(16, 21, 27, 0.86);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-top: none;
        border-radius: 0 0 18px 18px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
        align-items: center;

        margin: 0 auto;
        width: max-content;
        max-width: calc(100vw - 16px);
        height: 50px;
        padding: 4px 16px 6px;

        visibility: hidden;
        opacity: 0;
        transform: translateY(-110%);
        transition:
          opacity 0.15s ease,
          transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.15),
          visibility 0s linear 0.35s;

        &::after {
          content: '';
          position: absolute;
          left: 18px;
          right: 18px;
          bottom: 0;
          height: 2px;
          border-radius: 2px;
          background: linear-gradient(90deg, #ffa01e 0 33%, #ff3f1e 33% 66%, #2a7bb0 66% 100%);
          opacity: 0.85;
          pointer-events: none;
        }

        &.visible {
          visibility: visible;
          opacity: 1;
          transform: translateY(0);
          transition:
            opacity 0.2s ease,
            transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.15),
            visibility 0s linear;
        }

        .flex-row-center-gap {
          gap: 4px;
        }

        .select-label-wrapper {
          width: 34px;
          height: 34px;
          padding: 0;
          justify-content: center;

          &::after {
            left: 9px;
            right: 9px;
            bottom: 2px;
          }

          select {
            position: absolute;
            z-index: 2;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            opacity: 0;
            cursor: pointer;
          }

          .icon-alert {
            position: absolute;
            z-index: 2;
            right: -2px;
            bottom: -2px;
            min-width: 0;
            width: auto;
            height: auto;
            padding: 0;
            background: none;
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
        display: flex;
        align-items: center;
        border-radius: 9px;
        padding: 4px 6px;
        transition:
          background-color 0.2s ease,
          transform 0.2s ease;

        &:hover {
          background-color: rgba(255, 255, 255, 0.09);
          transform: translateY(-1px);
        }

        &::after {
          content: ' ';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background-color: rgba(255, 255, 255, 0.18);
          border-radius: 10px;
          pointer-events: none;
          transition: all 0.3s ease;
        }

        // Device selected
        &.activated::after {
          background-color: #ffa01e;
          box-shadow: 0 0 6px rgba(255, 160, 30, 0.7);
        }

        .kb-icon {
          position: relative;
          z-index: 1;
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

        .btn-no-style.active {
          background-color: rgba(255, 160, 30, 0.14);
          box-shadow: inset 0 0 0 1px rgba(255, 160, 30, 0.55);
        }
      }

      select {
        width: 125px;
      }

      .mdi {
        font-size: 22.5px;
      }

      .recording .kb-icon {
        animation: linear blink-animation 2s infinite;
      }

      .btn-no-style {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 34px;
        height: 34px;
        line-height: 1;
        border-radius: 9px;
        padding: 0 6px;
        position: relative;
        transition:
          background-color 0.2s ease,
          transform 0.2s ease,
          opacity 0.2s ease;

        .kb-icon {
          transition: transform 0.2s ease;
        }

        &:hover:not(:disabled) {
          background-color: rgba(255, 255, 255, 0.09);

          .kb-icon {
            transform: translateY(-1px) scale(1.08);
          }
        }

        &:active:not(:disabled) .kb-icon {
          transform: scale(0.94);
        }

        &:focus-visible {
          outline: 2px solid #ffa01e;
          outline-offset: 1px;
        }

        &:disabled {
          opacity: 0.35;
          filter: grayscale(0.8);
          cursor: not-allowed;
        }
      }

      .menu-separator {
        width: 1px;
        height: 22px;
        background: rgba(255, 255, 255, 0.14);
        margin: 0 6px;
      }
    }
  }

  .main-graph-wrapper {
    overflow: hidden;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .no-stream-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .no-stream-logo {
    width: clamp(240px, 52.5%, 600px);
    opacity: 0.35;
    user-select: none;
  }

  .video-wrapper {
    // Sized in px by useVideoFilters; may exceed the container before rotation (±90°)
    flex-shrink: 0;
    position: relative;

    video {
      display: block;
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
    gap: 12px;
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

  .loading-layer .spin {
    animation: kb-spin 1s linear infinite;
  }

  @keyframes kb-spin {
    to {
      transform: rotate(360deg);
    }
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
        margin: 0 auto 20px;
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
