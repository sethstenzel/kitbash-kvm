<script setup lang="ts">
import KbIcon from '@/components/KBKvmController/UI/KbIcon.vue'
import {ref} from 'vue'
import {useAppFullscreen} from '@/components/KBKvmController/utils/app-fullscreen'

// Same fullscreen state as double-clicking the video
const {isFullscreen, toggle: toggleFullScreen} = useAppFullscreen()

const isTop = ref(false)
const toggleTop = async () => {
  try {
    const {appWindow} = await import('@tauri-apps/api/window')
    await appWindow.setAlwaysOnTop(!isTop.value)
    isTop.value = !isTop.value
  } catch (error) {
    window.$notification({type: 'error', message: `Keep on top failed: ${(error as Error)?.message ?? error}`, timeout: 4000})
  }
}
</script>

<template>
  <button class="btn-no-style" :title="isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'" @click="toggleFullScreen">
    <KbIcon v-if="!isFullscreen" name="fullscreen" />
    <KbIcon v-else name="fullscreen-exit" />
  </button>
  <button
    class="btn-no-style"
    :class="[isTop ? 'active' : '']"
    @click="toggleTop"
    :title="isTop ? 'Unpin window' : 'Keep window on top'"
  >
    <KbIcon :name="isTop ? 'pin' : 'pin-off'" />
  </button>
</template>
