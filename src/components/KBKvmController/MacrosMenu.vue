<script lang="ts" setup>
import {ref, computed} from 'vue'
import {useMacrosStore} from '@/stores/macros'
import {useSerialState} from '@/components/KBKvmController/utils/serial-state'
import {genPacket, CmdType} from '@/components/KBKvmController/utils/ch9329'
import {ASCII_KEYS} from '@/components/KBKvmController/utils/keys-enum'
import {sleep} from '@/components/KBKvmController/utils'

const macrosStore = useMacrosStore()
const {writer} = useSerialState()
const selectedMacro = ref('')

const hasMacros = computed(() => macrosStore.macros.length > 0)

const writeSerial = (...args: any) => {
  if (!writer.value) {
    window.$notification({
      type: 'error',
      message: 'Serial port not initialized',
      timeout: 3000,
    })
    return
  }
  return writer.value.write(...args)
}

const sendText = async (text: string) => {
  const errorChars = []
  for (const key of text) {
    if (!ASCII_KEYS.has(key)) {
      errorChars.push(key)
      continue
    }
    const [hidCode, shift] = ASCII_KEYS.get(key)
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

const sendCommandKey = async (command: string) => {
  const parts = command.split('+').map((p) => p.trim())

  let controlBits = 0
  let mainKey = ''
  let hidCode = 0

  for (const part of parts) {
    if (part === 'CTRL' || part === 'CONTROL') {
      controlBits |= 0b00000001
    } else if (part === 'SHIFT') {
      controlBits |= 0b00000010
    } else if (part === 'ALT') {
      controlBits |= 0b00000100
    } else if (part === 'META' || part === 'WIN' || part === 'CMD') {
      controlBits |= 0b00001000
    } else {
      mainKey = part
    }
  }

  const keyMap: Record<string, number> = {
    ENTER: 0x28,
    ESCAPE: 0x29,
    ESC: 0x29,
    BACKSPACE: 0x2a,
    TAB: 0x2b,
    SPACE: 0x2c,
    CAPSLOCK: 0x39,
    F1: 0x3a,
    F2: 0x3b,
    F3: 0x3c,
    F4: 0x3d,
    F5: 0x3e,
    F6: 0x3f,
    F7: 0x40,
    F8: 0x41,
    F9: 0x42,
    F10: 0x43,
    F11: 0x44,
    F12: 0x45,
    SCROLLLOCK: 0x47,
    PAUSE: 0x48,
    INSERT: 0x49,
    HOME: 0x4a,
    PAGEUP: 0x4b,
    DELETE: 0x4c,
    DEL: 0x4c,
    END: 0x4d,
    PAGEDOWN: 0x4e,
    RIGHT: 0x4f,
    ARROWRIGHT: 0x4f,
    LEFT: 0x50,
    ARROWLEFT: 0x50,
    DOWN: 0x51,
    ARROWDOWN: 0x51,
    UP: 0x52,
    ARROWUP: 0x52,
    NUMLOCK: 0x53,
  }

  if (mainKey.length === 1) {
    const upperKey = mainKey.toUpperCase()
    if (ASCII_KEYS.has(upperKey)) {
      const [code] = ASCII_KEYS.get(upperKey)
      hidCode = code
    } else if (ASCII_KEYS.has(mainKey.toLowerCase())) {
      const [code] = ASCII_KEYS.get(mainKey.toLowerCase())
      hidCode = code
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

  const value = new Uint8Array([
    ...genPacket(CmdType.CMD_SEND_KB_GENERAL_DATA, controlBits, 0, hidCode, 0, 0, 0, 0, 0),
    ...genPacket(CmdType.CMD_SEND_KB_GENERAL_DATA, 0, 0, 0, 0, 0, 0, 0, 0),
  ])
  await writeSerial(value)
  await sleep(16)
}

const sendAdvancedText = async (text: string) => {
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
    const command = match[1].trim()
    const commandUpper = command.toUpperCase()
    console.log('Processing command:', {raw: match[1], trimmed: command, upper: commandUpper})

    // Skip empty commands
    if (!command) {
      lastIndex = commandRegex.lastIndex
      continue
    }

    // Check if this is a DELAY command (case-insensitive)
    console.log('Checking DELAY:', {
      commandUpper,
      startsWithDelay: commandUpper.startsWith('DELAY='),
      includesDelay: commandUpper.includes('DELAY'),
    })
    if (commandUpper.startsWith('DELAY=')) {
      const delayValue = command.substring(6).trim()
      const delaySeconds = parseFloat(delayValue)
      console.log('DELAY command detected:', {command, delayValue, delaySeconds})
      if (!isNaN(delaySeconds) && delaySeconds > 0) {
        console.log('Sleeping for', delaySeconds, 'seconds (', delaySeconds * 1000, 'ms)')
        await sleep(delaySeconds * 1000)
        console.log('Sleep completed')
      } else {
        window.$notification({
          type: 'warning',
          message: `Invalid delay value: ${command}`,
          timeout: 3000,
        })
      }
    } else {
      await sendCommandKey(commandUpper)
    }

    lastIndex = commandRegex.lastIndex
  }

  // Send any remaining text after the last command
  const remainingText = text.substring(lastIndex)
  if (remainingText) {
    await sendText(remainingText)
  }
}

const handleMacroSelect = async () => {
  const macroId = selectedMacro.value
  if (!macroId) {
    return
  }

  if (!hasMacros.value) {
    window.$notification({
      type: 'info',
      message: 'No macros configured. Add macros in Settings.',
      timeout: 3000,
    })
    selectedMacro.value = ''
    return
  }

  const macro = macrosStore.macros.find((m) => m.id === macroId)
  if (!macro) {
    window.$notification({
      type: 'error',
      message: 'Macro not found',
      timeout: 3000,
    })
    selectedMacro.value = ''
    return
  }

  if (!writer.value) {
    window.$notification({
      type: 'error',
      message: 'Serial port not connected',
      timeout: 3000,
    })
    selectedMacro.value = ''
    return
  }

  try {
    await sendAdvancedText(macro.message)

    window.$notification({
      type: 'success',
      message: `Executed macro: ${macro.name}`,
      timeout: 2000,
    })
  } catch (error: any) {
    console.error('Macro execution error:', error)
    window.$notification({
      type: 'error',
      message: `Failed to execute macro: ${error.message}`,
      timeout: 3000,
    })
  }

  selectedMacro.value = ''
}
</script>

<template>
  <label
    class="select-label-wrapper"
    :title="hasMacros ? 'Macros' : 'No macros configured. Add macros in Settings.'"
    :class="{activated: selectedMacro !== '', disabled: !hasMacros}"
  >
    <span class="mdi mdi-script-text-play"></span>
    <select
      v-model="selectedMacro"
      class="btn-no-style"
      @change="handleMacroSelect"
      :disabled="!hasMacros"
    >
      <option :value="''" disabled hidden>Select Macro</option>
      <option v-for="macro in macrosStore.macros" :key="macro.id" :value="macro.id">
        {{ macro.name }}
      </option>
    </select>
  </label>
</template>

<style lang="scss" scoped>
.select-label-wrapper.disabled {
  opacity: 0.4;
  cursor: not-allowed;

  select {
    cursor: not-allowed;
  }
}
</style>
