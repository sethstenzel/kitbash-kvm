<script setup lang="ts">
import KbIcon from '@/components/KBKvmController/UI/KbIcon.vue'
import {ref} from 'vue'
import {window} from '@tauri-apps/api'

let curWin = window.getCurrent()
const isFullscreen = ref(false)
function toggleFullScreen() {
  isFullscreen.value = !isFullscreen.value
  curWin.setFullscreen(isFullscreen.value)
}
const isTop = ref(false)
function toggleTop() {
  isTop.value = !isTop.value
  curWin.setAlwaysOnTop(isTop.value)
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
