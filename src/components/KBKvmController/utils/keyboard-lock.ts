/**
 * Keyboard Lock (only takes effect in fullscreen), shared by features that need keys the browser
 * normally keeps for itself:
 *  - 'kvm': Ctrl+W/T/N, Alt+Tab etc. reach the target while the KVM is connected
 *  - 'area-selection': Esc cancels a screenshot/OCR/QR selection instead of leaving fullscreen
 * The lock is held while any reason is active and the page is fullscreen.
 */
const reasons = new Set<string>()

const sync = () => {
  const keyboard = navigator.keyboard
  if (!keyboard) {
    return
  }
  if (document.fullscreenElement && reasons.size) {
    keyboard.lock().catch((error) => console.warn('Keyboard lock failed:', error))
  } else {
    keyboard.unlock()
  }
}

document.addEventListener('fullscreenchange', sync)

export const setKeyboardLock = (reason: string, wanted: boolean) => {
  if (wanted) {
    reasons.add(reason)
  } else {
    reasons.delete(reason)
  }
  sync()
}
