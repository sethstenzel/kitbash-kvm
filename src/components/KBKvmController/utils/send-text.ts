/**
 * Typing text, hotkeys and macros on the target. All sends run through one queue so they
 * never interleave, and can be cancelled with cancelSend().
 */
import {ref} from 'vue'
import {ASCII_KEYS} from './keys-enum'
import {KEYBOARD_RELEASE_PACKET, keyboardPacket} from './ch9329'
import {isSerialConnected, writeSerial} from './serial-io'

export type EscapeStyle = 'square' | 'curly' | 'pipe'

const KEY_INTERVAL_MS = 16

class SendStopped extends Error {
  constructor(public reason: 'cancelled' | 'closed') {
    super(reason)
  }
}

/** True while a send is running or queued */
export const isSending = ref(false)

let queue: Promise<unknown> = Promise.resolve()
let pendingCount = 0
let abortController = new AbortController()

/** Stop the running send and drop any queued ones */
export const cancelSend = () => {
  abortController.abort()
  abortController = new AbortController()
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new SendStopped('cancelled'))
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(new SendStopped('cancelled'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, {once: true})
  })

/** Press and release one combination, then wait one key interval */
const tap = async (signal: AbortSignal, modifiers: number, keys: number[]) => {
  if (signal.aborted) {
    throw new SendStopped('cancelled')
  }
  const ok = await writeSerial([...keyboardPacket(modifiers, keys), ...KEYBOARD_RELEASE_PACKET])
  if (!ok) {
    throw new SendStopped('closed')
  }
  await sleep(KEY_INTERVAL_MS, signal)
}

const queuedCancelNotified = new WeakSet<AbortSignal>()

/** Run a send task in the shared queue. Resolves true if it completed. */
const enqueue = (task: (signal: AbortSignal) => Promise<void>): Promise<boolean> => {
  const signal = abortController.signal
  pendingCount++
  isSending.value = true
  const run = queue.then(async () => {
    try {
      if (signal.aborted) {
        throw new SendStopped('cancelled')
      }
      if (!isSerialConnected()) {
        throw new SendStopped('closed')
      }
      await task(signal)
      return true
    } catch (error) {
      if (!(error instanceof SendStopped)) {
        throw error
      }
      // Only the first task to hit a closed port reports it; later queued ones stay quiet
      if (error.reason === 'closed' && !signal.aborted) {
        cancelSend()
        window.$notification({
          type: 'error',
          message: 'Sending stopped: serial port is not connected',
          timeout: 4000,
        })
      } else if (error.reason === 'cancelled' && !queuedCancelNotified.has(signal)) {
        queuedCancelNotified.add(signal)
        window.$notification({type: 'info', message: 'Sending cancelled', timeout: 2000})
      }
      return false
    } finally {
      pendingCount--
      isSending.value = pendingCount > 0
    }
  })
  queue = run.catch(() => {})
  return run
}

interface ISkipped {
  chars: Set<string>
  count: number
}

const normalizeNewlines = (text: string) => text.replace(/\r\n?/g, '\n')

const typeText = async (text: string, signal: AbortSignal, skipped: ISkipped) => {
  for (const char of normalizeNewlines(text)) {
    const keyData = ASCII_KEYS.get(char)
    if (!keyData) {
      skipped.chars.add(char)
      skipped.count++
      continue
    }
    const [hidCode, shift] = keyData
    await tap(signal, shift ? 0x02 : 0, [hidCode])
  }
}

const notifySkipped = (skipped: ISkipped) => {
  if (!skipped.count) {
    return
  }
  const chars = [...skipped.chars].map((c) => JSON.stringify(c).slice(1, -1))
  window.$notification({
    type: 'error',
    message: `${skipped.count} character(s) skipped, only ASCII can be typed: [${chars.join(', ')}]`,
    timeout: 4000,
  })
}

const typeLiteral = (text: string) =>
  enqueue(async (signal) => {
    const skipped: ISkipped = {chars: new Set(), count: 0}
    await typeText(text, signal, skipped)
    notifySkipped(skipped)
  })

/** Type literal text (no command parsing) */
export const sendText = (text: string | null | undefined) =>
  text ? typeLiteral(text) : Promise.resolve(false)

/** Type clipboard text verbatim */
export const sendPastedText = (text: string) => {
  const normalized = normalizeNewlines(text)
  window.$notification({
    type: 'info',
    message: `Typing ${normalized.length} characters from clipboard…`,
    timeout: 3000,
  })
  return typeLiteral(normalized)
}

/** Press and release a key combination given as a modifier byte and HID usage */
export const sendKeyCombo = (modifiers: number, hidCode = 0) =>
  enqueue((signal) => tap(signal, modifiers, hidCode ? [hidCode] : []))

const MODIFIER_NAMES: Record<string, number> = {
  CTRL: 0x01,
  CONTROL: 0x01,
  SHIFT: 0x02,
  ALT: 0x04,
  OPTION: 0x04,
  META: 0x08,
  WIN: 0x08,
  CMD: 0x08,
  GUI: 0x08,
  SUPER: 0x08,
  RCTRL: 0x10,
  RSHIFT: 0x20,
  RALT: 0x40,
  ALTGR: 0x40,
  RMETA: 0x80,
  RWIN: 0x80,
}

const COMMAND_KEYS: Record<string, number> = {
  ENTER: 0x28,
  RETURN: 0x28,
  ESCAPE: 0x29,
  ESC: 0x29,
  BACKSPACE: 0x2a,
  TAB: 0x2b,
  SPACE: 0x2c,
  CAPSLOCK: 0x39,
  PRINTSCREEN: 0x46,
  PRTSC: 0x46,
  SCROLLLOCK: 0x47,
  PAUSE: 0x48,
  INSERT: 0x49,
  INS: 0x49,
  HOME: 0x4a,
  PAGEUP: 0x4b,
  PGUP: 0x4b,
  DELETE: 0x4c,
  DEL: 0x4c,
  END: 0x4d,
  PAGEDOWN: 0x4e,
  PGDN: 0x4e,
  RIGHT: 0x4f,
  ARROWRIGHT: 0x4f,
  LEFT: 0x50,
  ARROWLEFT: 0x50,
  DOWN: 0x51,
  ARROWDOWN: 0x51,
  UP: 0x52,
  ARROWUP: 0x52,
  NUMLOCK: 0x53,
  MENU: 0x65,
  APPS: 0x65,
  CONTEXTMENU: 0x65,
}
for (let i = 1; i <= 12; i++) COMMAND_KEYS[`F${i}`] = 0x39 + i
for (let i = 13; i <= 24; i++) COMMAND_KEYS[`F${i}`] = 0x5b + i

/** Parse e.g. 'CTRL+ALT+DEL', 'ENTER', 'WIN' into a modifier byte and key */
export const parseCommandKey = (command: string): {modifiers: number; hidCode: number} | null => {
  let modifiers = 0
  let hidCode = 0
  for (const part of command.split('+').map((p) => p.trim())) {
    const upper = part.toUpperCase()
    if (MODIFIER_NAMES[upper]) {
      modifiers |= MODIFIER_NAMES[upper]
    } else if (COMMAND_KEYS[upper]) {
      hidCode = COMMAND_KEYS[upper]
    } else if (part.length === 1 && ASCII_KEYS.has(part.toLowerCase())) {
      const [code, shift] = ASCII_KEYS.get(part.toLowerCase())!
      hidCode = code
      if (shift) modifiers |= 0x02
    } else if (part.length === 1 && ASCII_KEYS.has(part)) {
      const [code, shift] = ASCII_KEYS.get(part)!
      hidCode = code
      if (shift) modifiers |= 0x02
    } else {
      return null
    }
  }
  return modifiers || hidCode ? {modifiers, hidCode} : null
}

const ESCAPE_MARKERS: Record<EscapeStyle, [string, string]> = {
  square: ['[[', ']]'],
  curly: ['{{', '}}'],
  pipe: ['||', '||'],
}

/** Opening/closing markers for display, e.g. ['[[', ']]'] */
export const getEscapeMarkers = (style: EscapeStyle | undefined) => ESCAPE_MARKERS[style ?? 'square']

// Commands never contain the marker characters, so |||CMD||| (the original macro syntax) also matches 'pipe'
const ESCAPE_PATTERNS: Record<EscapeStyle, string> = {
  square: String.raw`\[\[([^\[\]]+?)\]\]`,
  curly: String.raw`\{\{([^{}]+?)\}\}`,
  pipe: String.raw`\|{2,3}([^|]+?)\|{2,3}`,
}
const LEGACY_MACRO_PATTERN = String.raw`\|\|\|([^|]+?)\|\|\|`

const buildCommandRegex = (style: EscapeStyle, legacyMacroSyntax: boolean) => {
  const patterns = [ESCAPE_PATTERNS[style] ?? ESCAPE_PATTERNS.square]
  if (legacyMacroSyntax && style !== 'pipe') {
    patterns.push(LEGACY_MACRO_PATTERN)
  }
  return new RegExp(patterns.join('|'), 'g')
}

/**
 * Type text containing command markers like [[CTRL+C]] or [[DELAY=1.5]].
 * `legacyMacroSyntax` additionally accepts |||CMD||| so macros saved before the escape
 * style setting applied to macros keep working.
 */
export const sendAdvancedText = (
  text: string | null | undefined,
  style: EscapeStyle = 'square',
  {legacyMacroSyntax = false} = {},
) => {
  if (!text) {
    return Promise.resolve(false)
  }
  const commandRegex = buildCommandRegex(style, legacyMacroSyntax)
  return enqueue(async (signal) => {
    const skipped: ISkipped = {chars: new Set(), count: 0}
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = commandRegex.exec(text)) !== null) {
      await typeText(text.substring(lastIndex, match.index), signal, skipped)
      lastIndex = commandRegex.lastIndex
      const command = (match.slice(1).find((g) => g !== undefined) ?? '').trim()
      if (!command) {
        continue
      }
      if (/^DELAY=/i.test(command)) {
        const seconds = parseFloat(command.substring(6))
        if (!isNaN(seconds) && seconds > 0) {
          await sleep(seconds * 1000, signal)
        } else {
          window.$notification({
            type: 'warning',
            message: `Invalid delay value: ${command}`,
            timeout: 3000,
          })
        }
        continue
      }
      const combo = parseCommandKey(command)
      if (!combo) {
        // Not a command (e.g. shell `[[ -f x ]]` in an older macro): type it as written
        await typeText(match[0], signal, skipped)
        continue
      }
      await tap(signal, combo.modifiers, combo.hidCode ? [combo.hidCode] : [])
    }
    await typeText(text.substring(lastIndex), signal, skipped)
    notifySkipped(skipped)
  })
}
