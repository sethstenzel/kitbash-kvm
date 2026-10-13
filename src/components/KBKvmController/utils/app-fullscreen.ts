import {effectScope, ref, type Ref} from 'vue'
import {useFullscreen} from '@vueuse/core'
import {isTauri} from '@/utils'

interface IAppFullscreen {
  isFullscreen: Ref<boolean>
  toggle: () => Promise<void>
}

let instance: IAppFullscreen | null = null

const notifyFailure = (error: unknown) => {
  console.error('[fullscreen] toggle failed:', error)
  window.$notification({
    type: 'error',
    message: `Fullscreen failed: ${(error as Error)?.message ?? error}`,
    timeout: 4000,
  })
}

/** Desktop app: the window itself goes fullscreen through Tauri */
const createTauriFullscreen = (): IAppFullscreen => {
  const isFullscreen = ref(false)
  // Loaded lazily so the web build doesn't pull in the Tauri window API
  const appWindow = import('@tauri-apps/api/window').then((m) => m.appWindow)
  const sync = async () => {
    isFullscreen.value = await (await appWindow).isFullscreen()
  }
  void appWindow.then((w) => {
    void sync()
    // Also catches fullscreen changes made outside the app (e.g. OS shortcuts)
    void w.onResized(() => void sync())
  })
  const toggle = async () => {
    try {
      const w = await appWindow
      await w.setFullscreen(!(await w.isFullscreen()))
      await sync()
    } catch (error) {
      notifyFailure(error)
    }
  }
  return {isFullscreen, toggle}
}

/**
 * Browser: the Fullscreen API on the whole document, not just the player, because dropdowns,
 * notifications and prompts are teleported to <body> and would otherwise be hidden
 */
const createBrowserFullscreen = (): IAppFullscreen => {
  const {isFullscreen, toggle: vueuseToggle} = useFullscreen(document.documentElement)
  const toggle = async () => {
    try {
      await vueuseToggle()
    } catch (error) {
      notifyFailure(error)
    }
  }
  return {isFullscreen, toggle}
}

/**
 * Single fullscreen state shared by the command bar button, double-clicking the video and the
 * desktop app's own button. The desktop app (WebView2) must not use the browser Fullscreen API:
 * the host can refuse it ("TypeError: not granted"), and it would get out of sync with the
 * window's fullscreen state.
 */
export const useAppFullscreen = (): IAppFullscreen => {
  if (!instance) {
    // Detached scope: the shared listeners live for the whole app, not one component
    instance = effectScope(true).run(() => (isTauri ? createTauriFullscreen() : createBrowserFullscreen()))!
  }
  return instance
}
