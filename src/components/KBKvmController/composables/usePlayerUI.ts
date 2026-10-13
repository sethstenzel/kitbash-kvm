import {ref, computed, type Ref} from 'vue'
import {useSettingsStore} from '@/stores/settings'
import {useAppFullscreen} from '@/components/KBKvmController/utils/app-fullscreen'

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

  // Fullscreen (window fullscreen in the desktop app, document fullscreen in the browser)
  const {toggle: toggleFullScreen, isFullscreen} = useAppFullscreen()

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
