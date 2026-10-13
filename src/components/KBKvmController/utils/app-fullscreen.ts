import {effectScope, ref, type Ref} from 'vue'
import {useFullscreen} from '@vueuse/core'
import {isTauri} from '@/utils'
import {useSerialState} from '@/components/KBKvmController/utils/serial-state'

interface IAppFullscreen {
  isFullscreen: Ref<boolean>
  toggle: () => Promise<void>
}

let instance: IAppFullscreen | null = null

// Checked before entering (never before leaving) fullscreen; returns false to stay windowed and
// is responsible for telling the user why
let enterGuard: (() => boolean) | null = null
export const setFullscreenEnterGuard = (guard: (() => boolean) | null) => {
  enterGuard = guard
}
const isEnterBlocked = (isFullscreen: boolean) => !isFullscreen && !!enterGuard && !enterGuard()

const notifyFailure = (error: unknown) => {
  console.error('[fullscreen] toggle failed:', error)
  const reason = String((error as Error)?.message ?? error)
  // Chrome's "not granted": fullscreen is refused while browser UI such as a chooser is open
  const message = !/not granted/i.test(reason)
    ? `Fullscreen failed: ${reason}`
    : useSerialState().isChoosingPort.value
      ? "Chrome won't go fullscreen while the serial port chooser is open. Pick the KVM's port (or cancel it), then try again."
      : 'Chrome refused fullscreen, usually because a browser dialog is open. Close it and try again.'
  window.$notification({type: 'warning', message, timeout: 6000})
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
      const isFullscreenNow = await w.isFullscreen()
      if (isEnterBlocked(isFullscreenNow)) return
      await w.setFullscreen(!isFullscreenNow)
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
    if (isEnterBlocked(isFullscreen.value)) return
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
