<script lang="ts" setup>
import {onBeforeUnmount, onMounted, Ref, ref, shallowRef, watch} from 'vue'
import {createPrompt} from '@/components/PromptInput/prompt-input'
import {useEventListener, usePointerLock, useThrottleFn, useWindowFocus} from '@vueuse/core'
import {ASCII_KEYS} from '@/components/KBKvmController/utils/keys-enum'
import {useSerialState} from '@/components/KBKvmController/utils/serial-state'
import {
  CmdType,
  decomposeHexToBytes,
  genPacket,
  i8clamp,
  indexToBinary,
  MediaKey,
  mediaKeyMatrix,
} from '@/components/KBKvmController/utils/ch9329'
import {useSettingsStore} from '@/stores/settings'
import {sleep} from '@/components/KBKvmController/utils'
import {eventBus} from '@/utils/event-bus'

const emit = defineEmits(['connected', 'disconnected'])

const settingsStore = useSettingsStore()
const {reader, writer, serialPort} = useSerialState()

const writeSerial = (...args: any) => {
  if (!writer.value) {
    window.$notification({
      type: 'error',
      message: 'Serial port not initialized',
      timeout: 3000,
    })
    return
  }
  // console.log(args)
  return writer.value.write(...args)
}

// Loop to read serial port output
async function readLoop(reader) {
  while (true) {
    try {
      // Read data from serial port
      const {value, done} = await reader.read()
      if (done) {
        // Reading finished
        console.log('Stream closed')
        break
      }
      // Process read data
      console.log(value)
    } catch (error) {
      console.error('Read error: ', error)
      break
    }
  }
}

const initSerial = async () => {
  if (serialPort.value) {
    return
  }
  try {
    let port = null
    if (navigator?.serial?.requestPort) {
      port = await navigator.serial.requestPort()
    } else if (navigator?.usb?.requestDevice) {
      // todo: using polyfill  `Failed to execute 'open' on 'USBDevice': Access denied.`
      const serialPolyfill = import('web-serial-polyfill')
      const device = await navigator.usb.requestDevice({filters: []})
      // console.log(device)
      port = new (await serialPolyfill).SerialPort(device, {
        usbControlInterfaceClass: 255,
        usbTransferInterfaceClass: 255,
      })
    }
    const baudRate = settingsStore.baudRate || (await createPrompt('9600', 'baud rate')) || '9600'
    settingsStore.baudRate = baudRate

    // Opening port
    const opened = port.open({baudRate: +baudRate})
    const timeout = new Promise((resolve, reject) => setTimeout(reject, 900))
    await Promise.race([timeout, opened])
    reader.value = await port.readable.getReader()
    writer.value = await port.writable.getWriter()
    serialPort.value = port
    console.log(port)
    emit('connected', port)

    // readLoop(reader.value)
  } catch (error: any) {
    console.error(error)
    window.$notification({
      type: 'warning',
      message: error.message,
      timeout: 5000,
    })
  }
}
const closeSerial = () => {
  if (reader.value) {
    reader.value.releaseLock()
    reader.value = null
  }
  if (writer.value) {
    writer.value.releaseLock()
    writer.value = null
  }
  if (serialPort.value) {
    serialPort.value.close()
    serialPort.value = null
  }
  releaseAbsoluteMouse()
  emit('disconnected')
}
onBeforeUnmount(() => {
  // closeSerial()
  // closeSerial()
  // closeSerial()
})

const sendText = async (text: string | null) => {
  if (!text) {
    return
  }
  const errorChars = []
  // switch to the ascii mode of ch9329 needs reconnect, which is unacceptable
  for (const key of text) {
    if (!ASCII_KEYS.has(key)) {
      errorChars.push(key)
      continue
    }
    const keyData = ASCII_KEYS.get(key)
    if (!keyData) continue
    const [hidCode, shift] = keyData
    // console.log({key, hidCode, shift})
    const value = new Uint8Array([
      ...genPacket(CmdType.CMD_SEND_KB_GENERAL_DATA, shift ? 2 : 0, 0, hidCode, 0, 0, 0, 0, 0),
      ...genPacket(CmdType.CMD_SEND_KB_GENERAL_DATA, 0, 0, 0, 0, 0, 0, 0, 0),
    ])
    await writeSerial(value)
    await sleep(16)
  }

  if (errorChars.length) {
    window.$notification({
      type: 'error',
      message: `[${errorChars.join(', ')}] send failed, only ASCII char is allowed.`,
      timeout: 3000,
    })
  }
}

const sendAdvancedText = async (text: string | null) => {
  if (!text) {
    return
  }

  // Parse text for command markers: |||COMMAND|||
  const commandRegex = /\|\|\|(.+?)\|\|\|/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = commandRegex.exec(text)) !== null) {
    // Send regular text before the command
    const textBefore = text.substring(lastIndex, match.index)
    if (textBefore) {
      await sendText(textBefore)
    }

    // Parse and send the command
    const command = match[1].trim().toUpperCase()
    await sendCommandKey(command)

    lastIndex = commandRegex.lastIndex
  }

  // Send any remaining text after the last command
  const remainingText = text.substring(lastIndex)
  if (remainingText) {
    await sendText(remainingText)
  }
}

const sendCommandKey = async (command: string) => {
  // Parse modifier keys and the main key
  // Format: CTRL+C, ALT+F4, ENTER, etc.
  const parts = command.split('+').map(p => p.trim())

  let controlBits = 0
  let mainKey = ''
  let hidCode = 0

  for (const part of parts) {
    if (part === 'CTRL' || part === 'CONTROL') {
      controlBits |= 0b00000001 // Ctrl
    } else if (part === 'SHIFT') {
      controlBits |= 0b00000010 // Shift
    } else if (part === 'ALT') {
      controlBits |= 0b00000100 // Alt
    } else if (part === 'META' || part === 'WIN' || part === 'CMD') {
      controlBits |= 0b00001000 // Meta/Windows/Command
    } else {
      mainKey = part
    }
  }

  // Map key names to HID codes
  const keyMap = {
    'ENTER': 0x28,
    'ESCAPE': 0x29,
    'ESC': 0x29,
    'BACKSPACE': 0x2a,
    'TAB': 0x2b,
    'SPACE': 0x2c,
    'CAPSLOCK': 0x39,
    'F1': 0x3a,
    'F2': 0x3b,
    'F3': 0x3c,
    'F4': 0x3d,
    'F5': 0x3e,
    'F6': 0x3f,
    'F7': 0x40,
    'F8': 0x41,
    'F9': 0x42,
    'F10': 0x43,
    'F11': 0x44,
    'F12': 0x45,
    'SCROLLLOCK': 0x47,
    'PAUSE': 0x48,
    'INSERT': 0x49,
    'HOME': 0x4a,
    'PAGEUP': 0x4b,
    'DELETE': 0x4c,
    'DEL': 0x4c,
    'END': 0x4d,
    'PAGEDOWN': 0x4e,
    'RIGHT': 0x4f,
    'ARROWRIGHT': 0x4f,
    'LEFT': 0x50,
    'ARROWLEFT': 0x50,
    'DOWN': 0x51,
    'ARROWDOWN': 0x51,
    'UP': 0x52,
    'ARROWUP': 0x52,
    'NUMLOCK': 0x53,
  }

  // Check if it's a single character key
  if (mainKey.length === 1) {
    const upperKey = mainKey.toUpperCase()
    if (ASCII_KEYS.has(upperKey)) {
      const keyData = ASCII_KEYS.get(upperKey)
      if (keyData) {
        hidCode = keyData[0] as number
      }
    } else if (ASCII_KEYS.has(mainKey.toLowerCase())) {
      const keyData = ASCII_KEYS.get(mainKey.toLowerCase())
      if (keyData) {
        hidCode = keyData[0] as number
      }
    }
  } else if (keyMap[mainKey]) {
    hidCode = keyMap[mainKey]
  }

  if (hidCode === 0) {
    window.$notification({
      type: 'warning',
      message: `Unknown key command: ${command}`,
      timeout: 3000,
    })
    return
  }

  // Send key press
  const value = new Uint8Array([
    ...genPacket(CmdType.CMD_SEND_KB_GENERAL_DATA, controlBits, 0, hidCode, 0, 0, 0, 0, 0),
    ...genPacket(CmdType.CMD_SEND_KB_GENERAL_DATA, 0, 0, 0, 0, 0, 0, 0, 0),
  ])
  await writeSerial(value)
  await sleep(16)
}

const rootRef = ref()

// https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock
const {isSupported, lock, unlock, element, triggerElement} = usePointerLock(rootRef, {
  unadjustedMovement: true,
})

const handleRelativeMouseWheel = async (event: WheelEvent) => {
  event.preventDefault() // Prevent default zoom behavior
  // event.deltaY represents scroll distance
  let value
  if (event.deltaY > 0) {
    // console.log('Scroll down', event.deltaY)
    value = new Uint8Array(genPacket(CmdType.CMD_SEND_MS_REL_DATA, 1, 0, 0, 0, 0xfd))
  } else {
    // console.log('Scroll up', event.deltaY)

    value = new Uint8Array(genPacket(CmdType.CMD_SEND_MS_REL_DATA, 1, 0, 0, 0, 0x02))
  }
  await writeSerial(value)
}

// Mouse lock, relative mouse mode
useEventListener(document, 'pointerlockchange', (event) => {
  if (!document.pointerLockElement) {
    console.log('Exit pointer lock')
    const el = rootRef.value
    el.onmousemove = el.onmousedown = el.onmouseup = null
    document.removeEventListener('wheel', handleRelativeMouseWheel)

    return
  }
  console.log('Enter pointer lock', event, document.pointerLockElement)
  const el = rootRef.value

  let [pressedBits, x, y] = [0, 0, 0]
  let timer: any = null // a modified throttle strategy

  document.addEventListener('wheel', handleRelativeMouseWheel, {passive: false})
  el.onmousemove =
    el.onmousedown =
    el.onmouseup =
      (event: MouseEvent) => {
        /*        const pressedBits = event.buttons // so lucky, coincidence or necessity?
        const x = Math.round(event.movementX)
        const y = Math.round(event.movementY)

        let [pX, pY] = [i8clamp(x), i8clamp(y)]
        if (pX < 0) pX = (0xff + pX) & 0xff
        if (pY < 0) pY = (0xff + pY) & 0xff
        writeSerial(
          new Uint8Array(genPacket(CmdType.CMD_SEND_MS_REL_DATA, 0x01, pressedBits, pX, pY, 0)),
        )*/

        x += event.movementX
        y += event.movementY
        if (pressedBits != event.buttons || i8clamp(x) !== x || i8clamp(y) !== y) {
          clearTimeout(timer)
          timer = null // force trigger
        }
        pressedBits = event.buttons // so lucky, coincidence or necessity?
        if (timer !== null) return
        x = Math.round(x)
        y = Math.round(y)
        const value: any = []
        do {
          let [pX, pY] = [i8clamp(x), i8clamp(y)]
          x -= pX
          y -= pY
          if (pX < 0) pX = (0xff + pX) & 0xff
          if (pY < 0) pY = (0xff + pY) & 0xff
          // console.log({pressedBits, pX, pY})
          value.push(...genPacket(CmdType.CMD_SEND_MS_REL_DATA, 0x01, pressedBits, pX, pY, 0))
        } while (
          x !== 0 ||
          y !== 0 // use "do while" loop to send mousedown/mouseup immediately
        )
        x = 0
        y = 0
        writer.value.write(new Uint8Array(value)) // without await on purpose
        timer = setTimeout(() => (timer = null), 16)
      }
})

// Absolute mouse mode
const absMouseRef = ref()
const releaseAbsoluteMouse = () => {
  const absEl = absMouseRef.value
  absMouseRef.value = null
  if (!absEl) {
    return
  }
  absEl.oncontextmenu = absEl.ondblclick = null
  absEl.onmousemove = absEl.onmousedown = absEl.onmouseup = null
  document.removeEventListener('wheel', handleRelativeMouseWheel)
}
onBeforeUnmount(() => {
  handleKeyup()
  releaseAbsoluteMouse()
})
const bindAbsoluteMouse = (absEl) => {
  absMouseRef.value = absEl

  document.addEventListener('wheel', handleRelativeMouseWheel, {passive: false})
  absEl.oncontextmenu = (e) => e.preventDefault()
  absEl.ondblclick = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const writeSerialThrottled = useThrottleFn(
    ({pressedBits, x, y}) => {
      writeSerial(
        new Uint8Array(
          genPacket(
            CmdType.CMD_SEND_MS_ABS_DATA,
            0x02,
            pressedBits,
            ...decomposeHexToBytes(x),
            ...decomposeHexToBytes(y),
            0,
          ),
        ),
      )
    },
    16,
    true,
  )

  absEl.onmousemove =
    absEl.onmousedown =
    absEl.onmouseup =
      (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()

        let pressedBits = event.buttons

        // TODO: optimize,
        const rect = absEl.getBoundingClientRect()
        const screenWidth = rect.width
        const screenHeight = rect.height

        // Calculate mouse coordinates relative to element top-left
        let offsetX = event.clientX - rect.left
        let offsetY = event.clientY - rect.top
        // if (settingsStore.filterMirrorY) {
        //   offsetX = rect.width - offsetX
        // }
        // if (settingsStore.filterMirrorX) {
        //   offsetY = rect.height - offsetY
        // }

        // Calculate new position
        let x = Math.floor((offsetX * 4096) / screenWidth)
        let y = Math.floor((offsetY * 4096) / screenHeight)
        // console.log({
        //   event,
        //   offsetX,
        //   offsetY,
        //   screenWidth,
        //   screenHeight,
        //   x,
        //   y,
        // })

        // 9600 baud rate causes slow mouse movement when browser console is open, throttling required
        writeSerialThrottled({
          pressedBits,
          x,
          y,
        })
      }
}
watch(
  () => settingsStore.cursorMode,
  (mode) => {
    if (mode === 'relative') {
      releaseAbsoluteMouse()
      return
    }
  },
  {immediate: true},
)

// Watch for baud rate changes and disconnect serial connection
watch(
  () => settingsStore.baudRate,
  (newBaudRate, oldBaudRate) => {
    // Only disconnect if baud rate actually changed and there's an active connection
    if (oldBaudRate !== undefined && newBaudRate !== oldBaudRate && serialPort.value) {
      console.log(`Baud rate changed from ${oldBaudRate} to ${newBaudRate}, disconnecting serial...`)
      closeSerial()
      window.$notification({
        type: 'info',
        message: `Baud rate changed to ${newBaudRate}. Serial connection closed.`,
        timeout: 3000,
      })
    }
  },
)

const showSendInput = async () => {
  const text = await createPrompt('', 'Send Text', {
    type: 'textarea',
    inputProps: {
      rows: 10,
      cols: 50,
    },
  })
  sendText(text)
}

const showSendAdvancedInput = async () => {
  const text = await createPrompt('', 'Send Adv. Text (Command Key Support)', {
    type: 'textarea',
    inputProps: {
      rows: 10,
      cols: 50,
      placeholder: 'Example: Hello, World!|||ENTER|||Username|||TAB|||Password|||ENTER|||\n\nSupported commands:\n- |||ENTER||| - Press Enter\n- |||CTRL+C||| - Press Ctrl+C\n- |||ALT+F4||| - Press Alt+F4\n- |||SHIFT+TAB||| - Press Shift+Tab\nAnd many more special keys...',
    },
  })
  sendAdvancedText(text)
}

// Macro execution
const eatKeys = new Set() // avoid tailing control keys (press and release key A will emit event keyup[A] and keyup[Shift])

const handleKeydown = async (event: KeyboardEvent) => {
  if (!serialPort.value) {
    return
  }
  event.preventDefault()

  // console.log(event)
  // Press Shift+Esc to unlock mouse
  if (event.shiftKey && event.key === 'Escape') {
    await unlock()
    return
  }

  const isCompatibleMode = settingsStore.keyboardCompatibleMode

  if (isCompatibleMode && eatKeys.has(event.key)) {
    eatKeys.delete(event.key)
    return
  }

  // Check if this is a modifier key pressed alone (Shift, Control, Alt, Meta)
  const isModifierKey = ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)

  if (isModifierKey) {
    // Send modifier-only packet when modifier keys are pressed
    let controlBits = 0
    if (event.shiftKey) {
      controlBits |= 0b00000010
      eatKeys.add('Shift')
    }
    if (event.ctrlKey) {
      controlBits |= 0b00000001
      eatKeys.add('Control')
    }
    if (event.altKey) {
      controlBits |= 0b00000100
      eatKeys.add('Alt')
    }
    if (event.metaKey) {
      controlBits |= 0b00001000
      eatKeys.add('Meta')
    }

    // Send modifier state with no key pressed (hidCode = 0)
    await writeSerial(
      new Uint8Array(genPacket(CmdType.CMD_SEND_KB_GENERAL_DATA, controlBits, 0, 0, 0, 0, 0, 0, 0))
    )
    return
  }

  const keyData = ASCII_KEYS.get(event.key)
  if (!keyData) return
  const [hidCode, shift] = keyData
  let controlBits = 0
  if (shift || event.shiftKey) {
    controlBits |= 0b00000010
    eatKeys.add('Shift')
  }
  if (event.ctrlKey) {
    controlBits |= 0b00000001
    eatKeys.add('Control')
  }
  if (event.altKey) {
    controlBits |= 0b00000100
    eatKeys.add('Alt')
  }
  if (event.metaKey) {
    controlBits |= 0b00001000
    eatKeys.add('Meta')
  }

  let arr = genPacket(CmdType.CMD_SEND_KB_GENERAL_DATA, controlBits, 0, hidCode, 0, 0, 0, 0, 0)
  if (isCompatibleMode) {
    arr = [...arr, ...genPacket(CmdType.CMD_SEND_KB_GENERAL_DATA, 0, 0, 0, 0, 0, 0, 0, 0)]
  }

  await writeSerial(new Uint8Array(arr))
}

const handleKeyup = async (event?: KeyboardEvent) => {
  if (!serialPort.value) {
    return
  }
  if (event) {
    event.preventDefault()
  }

  // Normal mode, send key release
  await writeSerial(
    new Uint8Array([...genPacket(CmdType.CMD_SEND_KB_GENERAL_DATA, 0, 0, 0, 0, 0, 0, 0, 0)]),
  )
}
useEventListener(document, 'keydown', handleKeydown)
useEventListener(document, 'keyup', handleKeyup)

const focused = useWindowFocus()
watch(focused, (val) => {
  if (!val) {
    handleKeyup()
  }
})

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
    action() {
      showSendInput()
    },
  },
  {
    value: 'send_advanced_text',
    label: 'Send Adv. Text (Command Key Support)...',
    action() {
      showSendAdvancedInput()
    },
  },
  // {
  //   value: 'scan_qr',
  //   label: 'Scan QR Code',
  //   async action() {
  //     eventBus.emit('scan_qr')
  //   },
  // },
  // {
  //   value: 'scan_qr_from_image',
  //   label: 'Scan QR Code From Image...',
  //   async action() {
  //     eventBus.emit('scan_qr_from_image')
  //   },
  // },
]
const handleTransferSelect = async () => {
  const item = transferOptions.find((i) => i.value === selectedTransfer.value)
  if (!item) {
    return
  }
  await item.action()

  selectedTransfer.value = ''
}

const selectedComboKey = ref('')

// Build special key options including macros
import {computed} from 'vue'
const specialKeyOptions = computed(() => {
  const baseOptions = [
    {value: '', label: 'Send Special Keys', disabled: true, hidden: true},
    {
      value: 'ctrl_alt_del',
      label: 'Ctrl + Alt + Del',
      values: {
        key: 'Delete',
        controlBits: 0b00000101,
      },
    },
  {
    value: 'alt_f4',
    label: 'Alt + F4',
    values: {
      key: 'F4',
      controlBits: 0b00000100,
    },
  },
  {
    value: 'shift_alt',
    label: 'Shift + Alt',
    values: {
      controlBits: 0b00000110,
    },
  },
  {
    value: 'ctrl_space',
    label: 'Ctrl + Space',
    values: {
      key: ' ',
      controlBits: 0b00000001,
    },
  },
  {
    value: 'alt_space',
    label: 'Alt + Space',
    values: {
      key: ' ',
      controlBits: 0b00000100,
    },
  },
  {
    value: 'meta',
    label: 'Meta',
    values: {
      controlBits: 0b00001000,
    },
  },
  {
    value: 'meta_tab',
    label: 'Meta + Tab',
    values: {
      key: 'Tab',
      controlBits: 0b00001000,
    },
  },
  {
    value: 'alt_tab',
    label: 'Alt + Tab',
    values: {
      key: 'Tab',
      controlBits: 0b00000100,
    },
  },
  {
    value: 'esc',
    label: 'Esc',
    values: {
      key: 'Escape',
    },
  },
  {
    value: 'capslock',
    label: 'Capslock',
    values: {
      key: 'Capslock',
    },
  },
    {label: '-----------------', disabled: true},
    {value: 'ctrl_alt_f1', label: 'Ctrl + Alt + F1'},
    {value: 'ctrl_alt_f2', label: 'Ctrl + Alt + F2'},
    {value: 'ctrl_alt_f3', label: 'Ctrl + Alt + F3'},
    {value: 'ctrl_alt_f4', label: 'Ctrl + Alt + F4'},
    {value: 'ctrl_alt_f5', label: 'Ctrl + Alt + F5'},
    {value: 'ctrl_alt_f6', label: 'Ctrl + Alt + F6'},
    {value: 'ctrl_alt_f7', label: 'Ctrl + Alt + F7'},
    {value: 'ctrl_alt_f8', label: 'Ctrl + Alt + F8'},
    {value: 'ctrl_alt_f9', label: 'Ctrl + Alt + F9'},
  ]

  return baseOptions
})
const handleSendComboKey = async () => {
  const value = selectedComboKey.value
  if (!value) {
    return
  }

  let key: string = ''
  let controlBits
  let hidCode = 0

  if (/^ctrl_alt_f\d+$/.test(value)) {
    key = 'F' + value.slice(10)
    controlBits = 0b00000101
  } else {
    const item = specialKeyOptions.value.find((i: any) => i.value === value)
    if (!item) {
      return
    }
    key = item.values?.key || ''
    controlBits = item.values?.controlBits || 0
  }
  if (key) {
    const keyData = ASCII_KEYS.get(key)
    if (keyData) {
      hidCode = keyData[0] as number
    }
  }

  const sv = new Uint8Array([
    ...genPacket(CmdType.CMD_SEND_KB_GENERAL_DATA, controlBits, 0, hidCode, 0, 0, 0, 0, 0),
    ...genPacket(CmdType.CMD_SEND_KB_GENERAL_DATA, 0, 0, 0, 0, 0, 0, 0, 0),
  ])
  await writeSerial(sv)

  selectedComboKey.value = ''
}

const selectedMediaKey = ref('')
const mediaKeyACPIOptions = [
  {value: 0b00000100, label: 'Wake-up'},
  {value: 0b00000010, label: 'Sleep'},
  {value: 0b00000001, label: 'Power'},
]
const mediaKeyCommonGroups = computed(() => {
  const groups: Array<{label: string; children: Array<{value: any; label: string}>}> = [
    {
      label: 'Media Control',
      children: [
        {value: MediaKey.MUTE, label: '🔇 Mute'},
        {value: MediaKey.VOLUME_PLUS, label: '🔊 Volume Up'},
        {value: MediaKey.VOLUME_MINUS, label: '🔉 Volume Down'},
      ],
    },
  ]

  return groups
})

const handleSendMedialKey = async () => {
  const value = selectedMediaKey.value
  if (!value) {
    return
  }

  const acpiItem = mediaKeyACPIOptions.find((i) => i.value === Number(value))
  if (acpiItem) {
    // Send ACPI key
    const sv = new Uint8Array([
      ...genPacket(CmdType.CMD_SEND_KB_MEDIA_DATA, 0x01, value),
      ...genPacket(CmdType.CMD_SEND_KB_MEDIA_DATA, 0x01, 0),
    ])
    await writeSerial(sv)
    selectedMediaKey.value = ''
    return
  }

  // Send media key
  const arr = [0, 0, 0]
  for (let i = 0; i < mediaKeyMatrix.length; i++) {
    for (let j = 0; j < mediaKeyMatrix[i].length; j++) {
      const v = mediaKeyMatrix[i][j]
      if (v === value) {
        arr[i] = indexToBinary(j)
        break
      }
    }
  }

  const sv = new Uint8Array([
    ...genPacket(CmdType.CMD_SEND_KB_MEDIA_DATA, 0x02, ...arr),
    ...genPacket(CmdType.CMD_SEND_KB_MEDIA_DATA, 0x02, 0, 0, 0),
  ])
  await writeSerial(sv)

  selectedMediaKey.value = ''
}

const autoEnable = (el) => {
  if (!serialPort.value) {
    initSerial()
    return
  }

  if (settingsStore.cursorMode === 'relative') {
    lock(rootRef.value)
  } else if (el && !absMouseRef.value) {
    bindAbsoluteMouse(el)
  }
}

defineExpose({
  autoEnable,
})
</script>

<template>
  <div ref="rootRef" class="kvm-input flex-row-center-gap scrollbar-mini" tabindex="-1">
    <button
      v-if="!serialPort"
      @click="initSerial"
      class="btn-no-style blue"
      title="Connect Serial"
    >
      <span class="mdi mdi-connection"></span>
    </button>
    <template v-else>
      <button @click="closeSerial" class="btn-no-style orange" title="Close Serial">
        <span class="mdi mdi-lan-disconnect"></span>
      </button>
      <!--<button @click="lock(rootRef)" class="btn-no-style blue">Capture Mouse</button>-->

      <label
        class="select-label-wrapper"
        title="Text Transfer"
        :class="{activated: selectedTransfer !== ''}"
      >
        <span class="mdi mdi-card-text"></span>
        <select v-model="selectedTransfer" class="btn-no-style" @change="handleTransferSelect">
          <option
            v-for="item in transferOptions"
            :disabled="item.disabled"
            :hidden="item.hidden"
            :key="item.value"
            :value="item.value"
          >
            {{ item.label }}
          </option>
        </select>
      </label>

      <label
        class="select-label-wrapper"
        title="Send Common Hotkeys"
        :class="{activated: selectedComboKey !== ''}"
      >
        <span class="mdi mdi-keyboard-close-outline"></span>
        <select v-model="selectedComboKey" class="btn-no-style" @change="handleSendComboKey">
          <option
            v-for="item in specialKeyOptions"
            :key="item.value"
            :value="item.value"
            :disabled="item.disabled"
            :hidden="item.hidden"
          >
            {{ item.label }}
          </option>
        </select>
      </label>

      <label
        class="select-label-wrapper"
        title="Send Special Keys"
        :class="{activated: selectedMediaKey !== ''}"
      >
        <span class="mdi mdi-keyboard-close"></span>
        <select v-model="selectedMediaKey" class="btn-no-style" @change="handleSendMedialKey">
          <option :value="''" disabled hidden>Select Media Keys</option>
          <optgroup label="ACPI">
            <option v-for="item in mediaKeyACPIOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </optgroup>
          <optgroup v-for="group in mediaKeyCommonGroups" :key="group.label" :label="group.label">
            <option v-for="item in group.children" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </optgroup>
        </select>
      </label>
    </template>
  </div>
</template>

<style scoped lang="scss">
.kvm-input {
  outline: none;
}
</style>
