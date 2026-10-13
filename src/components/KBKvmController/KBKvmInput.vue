<script lang="ts" setup>
import KbIcon from '@/components/KBKvmController/UI/KbIcon.vue'
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useEventListener} from '@vueuse/core'
import ActionDropdown from '@/components/KBKvmController/UI/ActionDropdown.vue'
import {createPrompt} from '@/components/PromptInput/prompt-input'
import {
  ASCII_KEYS,
  HID_CODES_BY_EVENT_CODE,
  MODIFIER_BITS,
} from '@/components/KBKvmController/utils/keys-enum'
import {useSerialState, type ISerialPortLike} from '@/components/KBKvmController/utils/serial-state'
import {
  closeSerial,
  onSerialClosed,
  onSerialRelease,
  openSerial,
  writeSerial,
} from '@/components/KBKvmController/utils/serial-io'
import {
  ABS_MAX,
  absoluteMousePacket,
  CmdType,
  genPacket,
  i8clamp,
  indexToBinary,
  KEYBOARD_RELEASE_PACKET,
  keyboardPacket,
  MediaKey,
  mediaKeyMatrix,
  relativeMousePacket,
} from '@/components/KBKvmController/utils/ch9329'
import {
  cancelSend,
  getEscapeMarkers,
  isSending,
  sendAdvancedText,
  sendKeyCombo,
  sendPastedText,
  sendText,
} from '@/components/KBKvmController/utils/send-text'
import {
  clientToVideoNormalized,
  getVideoOrientation,
  screenDeltaToVideo,
} from '@/components/KBKvmController/utils/video-geometry'
import {useSettingsStore} from '@/stores/settings'

const props = defineProps<{videoOnlyMode?: boolean}>()
const emit = defineEmits(['connected', 'disconnected', 'menu-close', 'menu-open'])

const settingsStore = useSettingsStore()
const {serialPort} = useSerialState()
const rootRef = ref<HTMLElement>()

/* ---------------- Serial connection ---------------- */

const initSerial = async () => {
  if (serialPort.value) {
    return
  }
  try {
    let port: ISerialPortLike | null = null
    if (navigator.serial?.requestPort) {
      port = await navigator.serial.requestPort()
    } else if (navigator.usb?.requestDevice) {
      // todo: using polyfill  `Failed to execute 'open' on 'USBDevice': Access denied.`
      const serialPolyfill = import('web-serial-polyfill')
      const device = await navigator.usb.requestDevice({filters: []})
      port = new (await serialPolyfill).SerialPort(device as any, {
        usbControlInterfaceClass: 255,
        usbTransferInterfaceClass: 255,
      })
    }
    if (!port) {
      throw new Error('Web Serial is not supported in this browser')
    }
    const baudRate = settingsStore.baudRate || (await createPrompt('9600', 'baud rate')) || '9600'
    settingsStore.baudRate = baudRate

    await openSerial(port, +baudRate)
    emit('connected', port)
  } catch (error: any) {
    // The user dismissed the port chooser
    if (error?.name === 'NotFoundError') {
      return
    }
    console.error(error)
    window.$notification({
      type: 'warning',
      message: error?.message || String(error),
      timeout: 5000,
    })
  }
}

const disposeSerialRelease = onSerialRelease(() => releaseAllInput())
const disposeSerialClosed = onSerialClosed(() => {
  stopCapture()
  emit('disconnected')
})

/* ---------------- Input state & release ---------------- */

const pressedModifiers = new Set<string>() // KeyboardEvent.code of held modifiers
const pressedKeys: string[] = [] // KeyboardEvent.code of held non-modifier keys, in press order
let lastControlLeftDown = -Infinity

interface IRelativeState {
  buttons: number
  x: number
  y: number
  dirty: boolean
  timer: ReturnType<typeof setTimeout> | null
}
let relativeState: IRelativeState | null = null
let absButtons = 0
let lastAbsPosition: {x: number; y: number} | null = null

const modifierByte = () => {
  let bits = 0
  pressedModifiers.forEach((code) => (bits |= MODIFIER_BITS[code]))
  return bits
}
const pressedHidCodes = () => pressedKeys.map((code) => HID_CODES_BY_EVENT_CODE[code])
const sendKeyboardState = () => writeSerial(keyboardPacket(modifierByte(), pressedHidCodes()))

/** Release all keys and mouse buttons on the target */
const releaseAllInput = () => {
  stopEscHold()
  pressedModifiers.clear()
  pressedKeys.length = 0
  absButtons = 0
  if (relativeState) {
    Object.assign(relativeState, {buttons: 0, x: 0, y: 0, dirty: false})
  }
  const packets = [...KEYBOARD_RELEASE_PACKET, ...relativeMousePacket(0)]
  if (lastAbsPosition) {
    packets.push(...absoluteMousePacket(0, lastAbsPosition.x, lastAbsPosition.y))
  }
  return writeSerial(packets)
}

/* ---------------- Keyboard ---------------- */

const ESC_HOLD_MS = 1000
const PASTE_EVENT_WAIT_MS = 150
const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
// Set by holding Esc; keyboard forwarding resumes when capture is re-enabled
let keyboardReleased = false
let escHoldTimer: ReturnType<typeof setTimeout> | null = null

const stopEscHold = () => {
  if (escHoldTimer) {
    clearTimeout(escHoldTimer)
    escHoldTimer = null
  }
}

const isForwardingKeyboard = () => !!serialPort.value && !props.videoOnlyMode && !keyboardReleased

let pasteWaiter: ((text: string | null) => void) | null = null

/** Clipboard text from the 'paste' event the shortcut triggers, else the async clipboard API */
const readClipboardText = () =>
  new Promise<string | null>((resolve) => {
    const timer = setTimeout(async () => {
      pasteWaiter = null
      try {
        resolve((await navigator.clipboard.readText()) || null)
      } catch {
        resolve(null)
      }
    }, PASTE_EVENT_WAIT_MS)
    pasteWaiter = (text) => {
      clearTimeout(timer)
      pasteWaiter = null
      resolve(text)
    }
  })

useEventListener(
  document,
  'paste',
  (event: ClipboardEvent) => {
    if (!pasteWaiter) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    pasteWaiter(event.clipboardData?.getData('text/plain') || null)
  },
  {capture: true},
)

const isPasteShortcut = (event: KeyboardEvent) =>
  settingsStore.pasteInterceptCtrlV !== false &&
  event.code === 'KeyV' &&
  (event.ctrlKey || event.metaKey) &&
  !event.altKey &&
  !event.shiftKey

/** Ctrl/Cmd+V: type the local clipboard on the target; forward a real Ctrl+V if it holds no text */
const handlePasteShortcut = async () => {
  // The modifier may already be down on the target; release it so typed text isn't Ctrl+chars
  const modifiers = modifierByte() || 0x01
  pressedModifiers.clear()
  pressedKeys.length = 0
  void writeSerial(KEYBOARD_RELEASE_PACKET)

  const text = await readClipboardText()
  if (text) {
    void sendPastedText(text)
  } else {
    void sendKeyCombo(modifiers, HID_CODES_BY_EVENT_CODE.KeyV)
  }
}

const releaseCapture = () => {
  keyboardReleased = true
  releaseAllInput()
  stopCapture()
  emit('menu-open')
  window.$notification({
    type: 'info',
    message: 'Keyboard & mouse released. Click the video to capture again.',
    timeout: 3000,
  })
}

// Re-sync modifiers with the event's flags. Covers keyups the browser never delivered and a
// modifier still physically held after the Ctrl+V paste released it, without undoing the AltGr fix.
const syncModifiers = (event: KeyboardEvent) => {
  const isAltGr =
    pressedModifiers.has('AltRight') &&
    !pressedModifiers.has('ControlLeft') &&
    !pressedModifiers.has('ControlRight')
  const pairs: Array<[boolean, string, string]> = [
    [event.ctrlKey && !isAltGr, 'ControlLeft', 'ControlRight'],
    [event.shiftKey, 'ShiftLeft', 'ShiftRight'],
    [event.altKey, 'AltLeft', 'AltRight'],
    [event.metaKey, 'MetaLeft', 'MetaRight'],
  ]
  for (const [isDown, left, right] of pairs) {
    if (!isDown) {
      pressedModifiers.delete(left)
      pressedModifiers.delete(right)
    } else if (!pressedModifiers.has(left) && !pressedModifiers.has(right)) {
      pressedModifiers.add(left)
    }
  }
}

/** Press and release a key immediately, keeping the currently held keys */
const tapKey = (code: string) =>
  writeSerial([
    ...keyboardPacket(modifierByte(), [...pressedHidCodes(), HID_CODES_BY_EVENT_CODE[code]].slice(-6)),
    ...keyboardPacket(modifierByte(), pressedHidCodes()),
  ])

// While the pointer is on the command bar (or one of its menus is open) keys belong to the app,
// e.g. holding Shift to Shift+click a toolbar button must not reach the target or hide the bar.
// Keyups are still handled, so a key held before moving onto the bar is released on the target.
const isPointerOnCommandBar = () => !!document.querySelector('.action-bar:hover, .action-dropdown-menu')

const handleKeydown = (event: KeyboardEvent) => {
  if (
    !isForwardingKeyboard() ||
    event.isComposing ||
    event.keyCode === 229 ||
    isPointerOnCommandBar()
  ) {
    return
  }
  emit('menu-close')
  // The target OS does its own key repeat, except for keys we only ever tap
  if (event.repeat) {
    event.preventDefault()
    const isTapped =
      event.code !== 'Escape' &&
      settingsStore.keyboardCompatibleMode &&
      !MODIFIER_BITS[event.code] &&
      HID_CODES_BY_EVENT_CODE[event.code] !== undefined
    if (isTapped) {
      void tapKey(event.code)
    }
    return
  }
  // Not prevented, so the browser fires the 'paste' event
  if (isPasteShortcut(event)) {
    void handlePasteShortcut()
    return
  }
  event.preventDefault()

  const code = event.code
  if (code === 'Escape') {
    stopEscHold()
    escHoldTimer = setTimeout(() => {
      escHoldTimer = null
      releaseCapture()
    }, ESC_HOLD_MS)
    // Tapped, so holding Esc to release capture doesn't auto-repeat Esc on the target
    syncModifiers(event)
    void tapKey(code)
    return
  }

  const isModifier = !!MODIFIER_BITS[code]
  if (!isModifier) {
    syncModifiers(event)
  }
  if (isModifier) {
    if (code === 'ControlLeft') {
      lastControlLeftDown = event.timeStamp
    } else if (code === 'AltRight' && event.timeStamp - lastControlLeftDown < 10) {
      // Windows AltGr arrives as a synthetic ControlLeft immediately followed by AltRight
      pressedModifiers.delete('ControlLeft')
    }
    pressedModifiers.add(code)
  } else if (HID_CODES_BY_EVENT_CODE[code] !== undefined) {
    if (!pressedKeys.includes(code)) {
      pressedKeys.push(code)
    }
  } else {
    return
  }
  void sendKeyboardState()

  // Compatible mode: keys are tapped (pressed and released at once) instead of held
  if (settingsStore.keyboardCompatibleMode && !isModifier) {
    pressedKeys.splice(pressedKeys.indexOf(code), 1)
    void sendKeyboardState()
  }
}

const handleKeyup = (event: KeyboardEvent) => {
  const code = event.code
  if (code === 'Escape') {
    stopEscHold()
  }
  if (!isForwardingKeyboard()) {
    return
  }

  let changed = false
  if (MODIFIER_BITS[code]) {
    changed = pressedModifiers.delete(code)
    // macOS doesn't deliver keyups for keys released while Cmd is held
    if (isMac && (code.startsWith('Meta') || code.startsWith('OS')) && pressedKeys.length) {
      pressedKeys.length = 0
      changed = true
    }
  } else {
    const index = pressedKeys.indexOf(code)
    if (index >= 0) {
      pressedKeys.splice(index, 1)
      changed = true
    } else if (code === 'PrintScreen') {
      // Windows only delivers the keyup for PrintScreen: send a full tap
      event.preventDefault()
      void writeSerial([
        ...keyboardPacket(modifierByte(), [...pressedHidCodes(), HID_CODES_BY_EVENT_CODE.PrintScreen]),
        ...keyboardPacket(modifierByte(), pressedHidCodes()),
      ])
      return
    }
  }
  if (changed) {
    event.preventDefault()
    void sendKeyboardState()
  }
}

useEventListener(document, 'keydown', handleKeydown)
useEventListener(document, 'keyup', handleKeyup)
useEventListener(window, 'blur', () => releaseAllInput())
useEventListener(document, 'visibilitychange', () => {
  if (document.hidden) {
    releaseAllInput()
  }
})

// In fullscreen, Keyboard Lock lets Ctrl+W/T/N, Alt+Tab etc. reach the target
const syncKeyboardLock = () => {
  const keyboard = navigator.keyboard
  if (!keyboard) {
    return
  }
  if (document.fullscreenElement && serialPort.value) {
    keyboard.lock().catch((error) => console.warn('Keyboard lock failed:', error))
  } else {
    keyboard.unlock()
  }
}
useEventListener(document, 'fullscreenchange', syncKeyboardLock)
watch(serialPort, syncKeyboardLock)

/* ---------------- Mouse: shared ---------------- */

const WHEEL_NOTCH_PX = 100
let wheelRemainder = 0

/** Accumulate wheel deltas into notches; positive = scroll up (CH9329 convention) */
const wheelToNotches = (event: WheelEvent) => {
  const scale =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 33
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? 800
        : 1
  const px = event.deltaY * scale
  if (!px) {
    return 0
  }
  if (Math.sign(px) !== Math.sign(wheelRemainder)) {
    wheelRemainder = 0
  }
  wheelRemainder += px
  const notches = Math.trunc(wheelRemainder / WHEEL_NOTCH_PX)
  wheelRemainder -= notches * WHEEL_NOTCH_PX
  return -notches
}

/* ---------------- Mouse: relative (pointer lock) ---------------- */

const pointerLocked = ref(false)
let relativeAbort: AbortController | null = null

const lockPointer = async (el?: HTMLElement) => {
  if (!el || document.pointerLockElement === el) {
    return
  }
  try {
    await el.requestPointerLock({unadjustedMovement: true})
  } catch {
    // unadjustedMovement isn't supported everywhere
    try {
      await el.requestPointerLock()
    } catch (error) {
      console.warn('Pointer lock failed:', error)
    }
  }
}

const unlockPointer = () => {
  if (rootRef.value && document.pointerLockElement === rootRef.value) {
    document.exitPointerLock()
  }
}

const bindRelativeMouse = (el: HTMLElement) => {
  relativeAbort?.abort()
  const abort = new AbortController()
  relativeAbort = abort
  const state: IRelativeState = {buttons: 0, x: 0, y: 0, dirty: false, timer: null}
  relativeState = state

  const flush = () => {
    let x = Math.round(state.x)
    let y = Math.round(state.y)
    state.x -= x
    state.y -= y
    const packets: number[] = []
    // do-while so button changes go out even without movement
    do {
      const dx = i8clamp(x)
      const dy = i8clamp(y)
      x -= dx
      y -= dy
      packets.push(...relativeMousePacket(state.buttons, dx, dy))
    } while (x !== 0 || y !== 0)
    void writeSerial(packets)
  }
  // 16ms throttle; movement accumulated meanwhile is flushed when the window ends
  const tick = () => {
    state.timer = null
    if (state.dirty) {
      state.dirty = false
      flush()
      state.timer = setTimeout(tick, 16)
    }
  }
  const onMouse = (event: MouseEvent) => {
    emit('menu-close')
    const delta = screenDeltaToVideo(
      event.movementX,
      event.movementY,
      getVideoOrientation(settingsStore),
    )
    state.x += delta.x
    state.y += delta.y
    const buttons = event.buttons & 0x07
    if (buttons !== state.buttons) {
      state.buttons = buttons
      if (state.timer) {
        clearTimeout(state.timer)
        state.timer = null
      }
    }
    if (state.timer) {
      state.dirty = true
      return
    }
    state.dirty = false
    flush()
    state.timer = setTimeout(tick, 16)
  }
  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const notches = wheelToNotches(event)
    if (notches) {
      void writeSerial(relativeMousePacket(state.buttons, 0, 0, notches))
    }
  }

  const {signal} = abort
  el.addEventListener('mousemove', onMouse, {signal})
  el.addEventListener('mousedown', onMouse, {signal})
  el.addEventListener('mouseup', onMouse, {signal})
  el.addEventListener('wheel', onWheel, {passive: false, signal})
  signal.addEventListener('abort', () => {
    if (state.timer) clearTimeout(state.timer)
    if (relativeState === state) relativeState = null
  })
}

useEventListener(document, 'pointerlockchange', () => {
  const el = rootRef.value
  if (el && document.pointerLockElement === el) {
    if (props.videoOnlyMode) return
    pointerLocked.value = true
    bindRelativeMouse(el)
    return
  }
  if (pointerLocked.value) {
    pointerLocked.value = false
    relativeAbort?.abort()
    relativeAbort = null
    releaseAllInput()
    emit('menu-open')
  }
})

/* ---------------- Mouse: absolute ---------------- */

const absMouseRef = ref<HTMLElement | null>(null)
let absoluteAbort: AbortController | null = null

const releaseAbsoluteMouse = () => {
  absoluteAbort?.abort()
  absoluteAbort = null
  absMouseRef.value = null
}

const areaFraction = (percent: unknown) => {
  const n = Number(percent)
  return n > 0 && n <= 100 ? n / 100 : 1
}

/** Client point -> CH9329 absolute coordinates, honoring rotation, mirroring, object-fit and the calibrated area */
const toAbsolute = (absEl: HTMLElement, clientX: number, clientY: number) => {
  const video = (absEl.closest('.video-wrapper')?.querySelector('video') ??
    document.getElementById('streamVideo')) as HTMLVideoElement | null
  const frame = video ? clientToVideoNormalized(video, clientX, clientY) : null
  let u: number
  let v: number
  if (frame) {
    const aw = areaFraction(settingsStore.absMouseAreaWidth)
    const ah = areaFraction(settingsStore.absMouseAreaHeight)
    u = (frame.x - (1 - aw) / 2) / aw
    v = (frame.y - (1 - ah) / 2) / ah
  } else {
    // No video dimensions yet; nothing to map onto while hidden either
    const rect = absEl.getBoundingClientRect()
    if (!rect.width || !rect.height) {
      return null
    }
    u = (clientX - rect.left) / rect.width
    v = (clientY - rect.top) / rect.height
  }
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
  return {x: Math.round(clamp01(u) * ABS_MAX), y: Math.round(clamp01(v) * ABS_MAX)}
}

const bindAbsoluteMouse = (absEl: HTMLElement) => {
  if (props.videoOnlyMode) return
  releaseAbsoluteMouse()
  absMouseRef.value = absEl
  const abort = new AbortController()
  absoluteAbort = abort
  const {signal} = abort
  absButtons = 0

  const writeAbsolute = (x: number, y: number, wheel = 0) => {
    lastAbsPosition = {x, y}
    void writeSerial(absoluteMousePacket(absButtons, x, y, wheel))
  }
  // Leading + trailing throttle for moves. The pending move is dropped whenever a button change
  // is sent, otherwise it would fire afterwards with the old button state and undo the press.
  let pendingMove: {x: number; y: number} | null = null
  let moveTimer: ReturnType<typeof setTimeout> | null = null
  const writeThrottled = (pos: {x: number; y: number}) => {
    if (moveTimer) {
      pendingMove = pos
      return
    }
    writeAbsolute(pos.x, pos.y)
    moveTimer = setTimeout(() => {
      moveTimer = null
      if (pendingMove) {
        const next = pendingMove
        pendingMove = null
        writeThrottled(next)
      }
    }, 16)
  }

  // While a button is held, follow the pointer outside the area so the release isn't lost
  let dragAbort: AbortController | null = null
  const syncDragTracking = () => {
    if (absButtons && !dragAbort) {
      dragAbort = new AbortController()
      window.addEventListener('mousemove', onWindowMouse, {signal: dragAbort.signal})
      window.addEventListener('mouseup', onWindowMouse, {signal: dragAbort.signal})
    } else if (!absButtons && dragAbort) {
      dragAbort.abort()
      dragAbort = null
    }
  }

  // Reused while the video is hidden (stream restart), so button releases still go out
  let lastPos: {x: number; y: number} | null = null
  const handleMouse = (event: MouseEvent) => {
    emit('menu-close')
    const pos = toAbsolute(absEl, event.clientX, event.clientY) ?? lastPos
    if (!pos) {
      return
    }
    lastPos = pos
    const buttons = event.buttons & 0x07
    // Button changes go out immediately: the trailing throttle keeps only the last call
    // per window, so a fast down+up (e.g. touchpad tap) would otherwise lose the press
    if (event.type !== 'mousemove' || buttons !== absButtons) {
      absButtons = buttons
      pendingMove = null
      writeAbsolute(pos.x, pos.y)
      syncDragTracking()
      return
    }
    // 9600 baud can't keep up with every mousemove
    writeThrottled(pos)
  }
  const onAreaMouse = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    handleMouse(event)
  }
  function onWindowMouse(event: MouseEvent) {
    if (absEl.contains(event.target as Node)) return
    if (!absButtons) {
      syncDragTracking()
      return
    }
    handleMouse(event)
  }
  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const notches = wheelToNotches(event)
    if (notches) {
      const pos = toAbsolute(absEl, event.clientX, event.clientY) ?? lastPos
      if (!pos) {
        return
      }
      pendingMove = null
      writeAbsolute(pos.x, pos.y, notches)
    }
  }

  absEl.addEventListener('mousemove', onAreaMouse, {signal})
  absEl.addEventListener('mousedown', onAreaMouse, {signal})
  absEl.addEventListener('mouseup', onAreaMouse, {signal})
  absEl.addEventListener('wheel', onWheel, {passive: false, signal})
  absEl.addEventListener('contextmenu', (e) => e.preventDefault(), {signal})
  absEl.addEventListener(
    'dblclick',
    (e) => {
      e.preventDefault()
      e.stopPropagation()
    },
    {signal},
  )
  signal.addEventListener('abort', () => {
    dragAbort?.abort()
    if (moveTimer) clearTimeout(moveTimer)
  })
}

/* ---------------- Capture lifecycle ---------------- */

/** Stop forwarding the mouse (pointer lock / absolute area); no serial writes */
const stopCapture = () => {
  stopEscHold()
  unlockPointer()
  relativeAbort?.abort()
  relativeAbort = null
  pointerLocked.value = false
  releaseAbsoluteMouse()
}

watch(
  () => settingsStore.cursorMode,
  (mode) => {
    if (mode === 'relative') {
      releaseAbsoluteMouse()
    } else {
      unlockPointer()
    }
  },
  {immediate: true},
)

// Changing the baud rate requires reopening the port
watch(
  () => settingsStore.baudRate,
  (newBaudRate, oldBaudRate) => {
    if (oldBaudRate !== undefined && newBaudRate !== oldBaudRate && serialPort.value) {
      void closeSerial()
      window.$notification({
        type: 'info',
        message: `Baud rate changed to ${newBaudRate}. Serial connection closed.`,
        timeout: 3000,
      })
    }
  },
)

onBeforeUnmount(() => {
  releaseAllInput()
  stopCapture()
  navigator.keyboard?.unlock()
  disposeSerialRelease()
  disposeSerialClosed()
})

let captureHintShown = false

const autoEnable = (el?: HTMLElement) => {
  if (!serialPort.value) {
    initSerial()
    return
  }
  keyboardReleased = false
  if (!captureHintShown) {
    captureHintShown = true
    window.$notification({
      type: 'info',
      message: 'Hold Esc to release keyboard & mouse',
      timeout: 4000,
    })
  }

  if (settingsStore.cursorMode === 'relative') {
    lockPointer(rootRef.value)
  } else if (el && !absMouseRef.value) {
    bindAbsoluteMouse(el)
  }
}

// True when keyboard/mouse are already being forwarded to the target
const isCaptured = () =>
  !!serialPort.value &&
  (settingsStore.cursorMode === 'relative' ? pointerLocked.value : !!absMouseRef.value)

defineExpose({
  autoEnable,
  isCaptured,
})

/* ---------------- Toolbar actions ---------------- */

const escapeMarkers = computed(() => getEscapeMarkers(settingsStore.advancedTextEscapeStyle))

const showSendInput = async () => {
  const text = await createPrompt('', 'Send Text', {
    type: 'textarea',
    contentStyle: {minWidth: '420px', maxWidth: '600px'},
    inputProps: {
      rows: 10,
      cols: 50,
    },
  })
  void sendText(text)
}

const showSendAdvancedInput = async () => {
  const [open, close] = escapeMarkers.value
  const c = (command: string) => `${open}${command}${close}`
  const text = await createPrompt('', 'Send Adv. Text (Command Key Support)', {
    type: 'textarea',
    contentStyle: {minWidth: '420px', maxWidth: '600px'},
    inputProps: {
      rows: 10,
      cols: 50,
      placeholder: [
        `Example: ${c('WIN+M')}`,
        `Example: Username${c('TAB')}Password${c('DELAY=1')}${c('ENTER')}`,
        '',
        'Supported commands:',
        `- ${c('ENTER')} - Press Enter`,
        `- ${c('CTRL+C')} - Press Ctrl+C`,
        `- ${c('ALT+F4')} - Press Alt+F4`,
        `- ${c('SHIFT+TAB')} - Press Shift+Tab`,
        `- ${c('DELAY=2')} - Wait 2 seconds (supports decimals)`,
        'And many more special keys...',
      ].join('\n'),
    },
  })
  void sendAdvancedText(text, settingsStore.advancedTextEscapeStyle)
}

const selectedTransfer = ref('')
const transferOptions = [
  {
    value: '',
    label: 'Text Transfer',
    disabled: true,
    hidden: true,
  },
  {
    value: 'send_text',
    label: 'Send Text...',
    action: showSendInput,
  },
  {
    value: 'send_advanced_text',
    label: 'Send Adv. Text (Command Key Support)...',
    action: showSendAdvancedInput,
  },
]
const handleTransferSelect = async () => {
  const item = transferOptions.find((i) => i.value === selectedTransfer.value)
  selectedTransfer.value = ''
  await item?.action?.()
}

const selectedComboKey = ref('')
const specialKeyOptions = [
  {value: '', label: 'Send Special Keys', disabled: true, hidden: true},
  {value: 'ctrl_alt_del', label: 'Ctrl + Alt + Del', values: {key: 'Delete', controlBits: 0b00000101}},
  {value: 'alt_f4', label: 'Alt + F4', values: {key: 'F4', controlBits: 0b00000100}},
  {value: 'ctrl_space', label: 'Ctrl + Space', values: {key: ' ', controlBits: 0b00000001}},
  {value: 'alt_space', label: 'Alt + Space', values: {key: ' ', controlBits: 0b00000100}},
  {value: 'meta', label: 'Meta / Win', values: {controlBits: 0b00001000}},
  {value: 'meta_tab', label: 'Meta / Win + Tab', values: {key: 'Tab', controlBits: 0b00001000}},
  {value: 'alt_tab', label: 'Alt + Tab', values: {key: 'Tab', controlBits: 0b00000100}},
  {value: 'esc', label: 'Esc', values: {key: 'Escape'}},
  {value: 'capslock', label: 'Capslock', values: {key: 'CapsLock'}},
  {label: '-----------------', disabled: true},
  {value: 'f1', label: 'F1', values: {key: 'F1'}},
  {value: 'f2', label: 'F2', values: {key: 'F2'}},
  {value: 'f10', label: 'F10', values: {key: 'F10'}},
  {value: 'f12', label: 'F12', values: {key: 'F12'}},
  {value: 'delete', label: 'Delete', values: {key: 'Delete'}},
]
const handleSendComboKey = () => {
  const item = specialKeyOptions.find((i) => i.value && i.value === selectedComboKey.value)
  selectedComboKey.value = ''
  if (!item?.values) {
    return
  }
  const hidCode = item.values.key ? (ASCII_KEYS.get(item.values.key)?.[0] ?? 0) : 0
  void sendKeyCombo(item.values.controlBits ?? 0, hidCode)
}

const selectedMediaKey = ref('')
const mediaKeyACPIOptions = [
  {value: 0b00000100, label: 'Wake-up'},
  {value: 0b00000010, label: 'Sleep'},
  {value: 0b00000001, label: 'Power'},
]
const mediaKeyCommonGroups = [
  {
    label: 'Media Control',
    children: [
      {value: MediaKey.MUTE, label: '🔇 Mute'},
      {value: MediaKey.VOLUME_PLUS, label: '🔊 Volume Up'},
      {value: MediaKey.VOLUME_MINUS, label: '🔉 Volume Down'},
    ],
  },
]

const handleSendMedialKey = async () => {
  const value = selectedMediaKey.value
  selectedMediaKey.value = ''
  if (!value) {
    return
  }

  const acpiItem = mediaKeyACPIOptions.find((i) => i.value === Number(value))
  if (acpiItem) {
    await writeSerial([
      ...genPacket(CmdType.CMD_SEND_KB_MEDIA_DATA, 0x01, acpiItem.value),
      ...genPacket(CmdType.CMD_SEND_KB_MEDIA_DATA, 0x01, 0),
    ])
    return
  }

  const bytes = [0, 0, 0]
  mediaKeyMatrix.forEach((row, i) => {
    const j = row.indexOf(value as MediaKey)
    if (j >= 0) {
      bytes[i] = indexToBinary(j)
    }
  })
  await writeSerial([
    ...genPacket(CmdType.CMD_SEND_KB_MEDIA_DATA, 0x02, ...bytes),
    ...genPacket(CmdType.CMD_SEND_KB_MEDIA_DATA, 0x02, 0, 0, 0),
  ])
}

const mediaKeyOptions = (() => {
  const flat: any[] = [{value: undefined, label: 'ACPI', group: true}, ...mediaKeyACPIOptions]
  mediaKeyCommonGroups.forEach((g) => {
    flat.push({value: undefined, label: g.label, group: true}, ...g.children)
  })
  return flat
})()
</script>

<template>
  <div ref="rootRef" class="kvm-input flex-row-center-gap scrollbar-mini" tabindex="-1">
    <button
      v-if="!serialPort"
      @click="initSerial"
      class="btn-no-style blue"
      title="Connect KVM (Serial)"
    >
      <KbIcon name="serial-connect" />
    </button>
    <template v-else>
      <button @click="closeSerial()" class="btn-no-style orange" title="Disconnect KVM (Serial)">
        <KbIcon name="serial-disconnect" />
      </button>

      <button
        v-if="isSending"
        @click="cancelSend"
        class="btn-no-style stop-sending"
        title="Stop Sending Text"
      >
        <KbIcon name="stop" />
      </button>

      <ActionDropdown
        icon="text-transfer"
        title="Text Transfer"
        placeholder="Send Text..."
        :options="transferOptions"
        v-model="selectedTransfer"
        @change="handleTransferSelect"
      />

      <ActionDropdown
        icon="hotkeys"
        title="Send Common Hotkeys"
        keycaps
        placeholder="Send Hotkey..."
        :options="specialKeyOptions"
        v-model="selectedComboKey"
        @change="handleSendComboKey"
      />

      <ActionDropdown
        icon="media-keys"
        title="Send Media Keys"
        placeholder="Send Media Key..."
        :options="mediaKeyOptions"
        v-model="selectedMediaKey"
        @change="handleSendMedialKey"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
.kvm-input {
  outline: none;
}

.stop-sending {
  color: #f44336;
}
</style>
