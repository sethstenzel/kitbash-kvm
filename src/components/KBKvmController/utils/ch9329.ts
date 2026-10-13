/**
 * CH9329 chip serial communication protocol
 * https://www.wch.cn/products/ch9329.html
 * https://www.wch.cn/downloads/CH9329EVT_ZIP.html
 */
export enum CmdType {
  // Get chip version and other information
  CMD_GET_INFO = 0x01,
  // Send USB keyboard general data
  CMD_SEND_KB_GENERAL_DATA = 0x02,
  // Send USB keyboard media data
  CMD_SEND_KB_MEDIA_DATA = 0x03,
  // Send USB absolute mouse data
  CMD_SEND_MS_ABS_DATA = 0x04,
  // Send USB relative mouse data
  CMD_SEND_MS_REL_DATA = 0x05,
  // Send USB custom HID device data
  CMD_SEND_MY_HID_DATA = 0x06,
  // Read USB custom HID device data
  CMD_READ_MY_HID_DATA = 0x87,
  // Get parameter configuration
  CMD_GET_PARA_CFG = 0x08,
  // Set parameter configuration
  CMD_SET_PARA_CFG = 0x09,
  // Get string description information
  CMD_GET_USB_STRING = 0x0a,
  // Set string descriptor configuration
  CMD_SET_USB_STRING = 0x0b,
  // Restore factory default configuration
  CMD_SET_DEFAULT_CFG = 0x0c,
  // Reset chip
  CMD_RESET = 0x0f,
}

export const genPacket = (cmd: CmdType, ...data: number[]) => {
  for (const v of data) if (v < 0 || v > 0xff) throw v
  const ret = [
    // Frame header: 2 bytes, fixed as 0x57, 0xAB
    0x57,
    0xab,
    // Address code: 1 byte, default 0x00
    0x00,
    // Command code
    cmd,
    // Following data length
    data.length,
    // Following data
    ...data,
  ]

  // Checksum: 1 byte, calculation: SUM = HEAD+ADDR+CMD+LEN+DATA
  const sum = new Uint8Array([0])
  for (const v of ret) sum[0] += v
  ret.push(sum[0])
  return ret
}

// clamp to int8
export const i8clamp = (v: number) => Math.max(-0x7f, Math.min(v, 0x7f))

// Decompose a hexadecimal number into low byte and high byte, low byte first, high byte last
export const decomposeHexToBytes = (hexNumber: number) => {
  // Ensure input is a valid hexadecimal number
  // if (typeof hexNumber !== 'number' || hexNumber < 0 || hexNumber > 0xFFFF) {
  //   throw new Error('Please input a valid hex number (between 0 and 0xFFFF)');
  // }

  // Get low byte (last 8 bits)
  const lowByte = hexNumber & 0xff

  // Get high byte (first 8 bits)
  const highByte = (hexNumber >> 8) & 0xff

  return [lowByte, highByte]
}

export enum MediaKey {
  EJECT = 'Eject',
  CD_STOP = 'CD Stop',
  PREV_TRACK = 'Prev. Track',
  NEXT_TRACK = 'Next Track',
  PLAY_PAUSE = 'Play/Pause',
  MUTE = 'Mute',
  VOLUME_PLUS = 'Volume+',
  VOLUME_MINUS = 'Volume-',
  REFRESH = 'Refresh',
  STOP = 'Stop',
  FORWARD = 'Forward',
  BACK = 'Back',
  HOME = 'Home',
  FAVORITES = 'Favorites',
  SEARCH = 'Search',
  E_MAIL = 'E-Mail',
  REWIND = 'Rewind',
  RECORD = 'Record',
  MINIMIZE = 'Minimize',
  MY_COMPUTER = 'My Computer',
  SCREEN_SAVE = 'Screen Save',
  CALCULATOR = 'Calculator',
  EXPLORER = 'Explorer',
  MEDIA = 'Media',
}

// Each row is one data byte, listed BIT7 -> BIT0 (see indexToBinary)
export const mediaKeyMatrix = [
  [
    MediaKey.EJECT,
    MediaKey.CD_STOP,
    MediaKey.PREV_TRACK,
    MediaKey.NEXT_TRACK,
    MediaKey.PLAY_PAUSE,
    MediaKey.MUTE,
    MediaKey.VOLUME_MINUS,
    MediaKey.VOLUME_PLUS,
  ],
  [
    MediaKey.REFRESH,
    MediaKey.STOP,
    MediaKey.FORWARD,
    MediaKey.BACK,
    MediaKey.HOME,
    MediaKey.FAVORITES,
    MediaKey.SEARCH,
    MediaKey.E_MAIL,
  ],
  [
    MediaKey.REWIND,
    MediaKey.RECORD,
    MediaKey.MINIMIZE,
    MediaKey.MY_COMPUTER,
    MediaKey.SCREEN_SAVE,
    MediaKey.CALCULATOR,
    MediaKey.EXPLORER,
    MediaKey.MEDIA,
  ],
]

// arr[0] -> 0b10000000, arr[1] -> 0b01000000, arr[7] -> 0b00000001
export const indexToBinary = (index: number) => {
  return 1 << (7 - index) // 7 - index ensures 1 is shifted to the appropriate bit position
}

/** Keyboard report: modifier byte, reserved byte, up to 6 key usage IDs */
export const keyboardPacket = (modifiers: number, keys: number[] = []) => {
  const slots = [0, 0, 0, 0, 0, 0]
  keys.slice(0, 6).forEach((k, i) => (slots[i] = k))
  return genPacket(CmdType.CMD_SEND_KB_GENERAL_DATA, modifiers & 0xff, 0, ...slots)
}

export const KEYBOARD_RELEASE_PACKET = keyboardPacket(0)

/** Relative mouse report; dx, dy and wheel are signed bytes (wheel > 0 scrolls up) */
export const relativeMousePacket = (buttons: number, dx = 0, dy = 0, wheel = 0) =>
  genPacket(
    CmdType.CMD_SEND_MS_REL_DATA,
    0x01,
    buttons & 0x07,
    i8clamp(dx) & 0xff,
    i8clamp(dy) & 0xff,
    i8clamp(wheel) & 0xff,
  )

export const ABS_MAX = 4095

/** Absolute mouse report; x and y in 0..ABS_MAX */
export const absoluteMousePacket = (buttons: number, x: number, y: number, wheel = 0) =>
  genPacket(
    CmdType.CMD_SEND_MS_ABS_DATA,
    0x02,
    buttons & 0x07,
    ...decomposeHexToBytes(Math.min(ABS_MAX, Math.max(0, Math.round(x)))),
    ...decomposeHexToBytes(Math.min(ABS_MAX, Math.max(0, Math.round(y)))),
    i8clamp(wheel) & 0xff,
  )

export interface ICh9329Frame {
  addr: number
  cmd: number
  data: number[]
}

/**
 * Incremental parser for frames sent by the chip:
 * 0x57 0xAB, addr, cmd (request | 0x80 on success, | 0xC0 on error), len, data, checksum
 */
export class Ch9329FrameParser {
  private buf: number[] = []

  push(chunk: Uint8Array): ICh9329Frame[] {
    const frames: ICh9329Frame[] = []
    for (const b of chunk) this.buf.push(b)
    while (this.buf.length >= 6) {
      if (this.buf[0] !== 0x57 || this.buf[1] !== 0xab) {
        this.buf.shift()
        continue
      }
      const len = this.buf[4]
      const total = 5 + len + 1
      if (this.buf.length < total) break
      let sum = 0
      for (let i = 0; i < total - 1; i++) sum = (sum + this.buf[i]) & 0xff
      if (sum !== this.buf[total - 1]) {
        // Bad checksum: resync on the next header
        this.buf.shift()
        continue
      }
      frames.push({addr: this.buf[2], cmd: this.buf[3], data: this.buf.slice(5, 5 + len)})
      this.buf.splice(0, total)
    }
    // Garbage without a header can't grow unbounded
    if (this.buf.length > 512) this.buf = []
    return frames
  }
}
