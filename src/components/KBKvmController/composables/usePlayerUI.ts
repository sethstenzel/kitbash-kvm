import {ref, computed, type Ref} from 'vue'
import {useFullscreen} from '@vueuse/core'
import {useSettingsStore} from '@/stores/settings'

interface UsePlayerUIOptions {
  isShowFloatBar: Ref<boolean>
  isShowFloatBarInNonKvmMode: Ref<boolean>
}

/**
 * Composable for player UI state management
 * Handles fullscreen, settings dialog, loading states, and action bar visibility
 */
export function usePlayerUI(options: UsePlayerUIOptions) {
  const {isShowFloatBar, isShowFloatBarInNonKvmMode} = options
  const settingsStore = useSettingsStore()

  // State
  const showSettings = ref(false)
  const loadingText = ref('')
  const criticalError = ref<{message: string; details?: string} | null>(null)

  // Fullscreen
  // Whole document, not just the player: dropdowns, notifications and prompts are teleported
  // to <body> and would be invisible if only the player element were fullscreen
  const {toggle: toggleFullScreen, isFullscreen} = useFullscreen(document.documentElement)

  // Computed
  const isActionBarVisible = computed(() => {
    return (
      (isShowFloatBar.value && settingsStore.floatUI && settingsStore.enableKvmInput) ||
      !settingsStore.floatUI ||
      (!settingsStore.enableKvmInput && isShowFloatBarInNonKvmMode.value)
    )
  })

  const resetError = () => {
    criticalError.value = null
  }

  return {
    // State
    showSettings,
    loadingText,
    criticalError,

    // Fullscreen
    toggleFullScreen,
    isFullscreen,

    // Computed
    isActionBarVisible,

    // Methods
    resetError,
  }
}
