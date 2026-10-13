import {INotification} from '@/components/NotificationList/notification-list'

declare global {
  interface Window {
    $notification: (notification: Partial<INotification>) => void
    /** Tauri v1 IPC bridge, always injected by the Tauri WebView (see utils/index.ts isTauri) */
    __TAURI_IPC__?: (message: unknown) => void
  }

  /** Injected by vite `define` (vite.config.js) */
  const BUILD_TIMESTAMP: number

  // ---- Web Serial (minimal) https://wicg.github.io/serial/ ----
  type ParityType = 'none' | 'even' | 'odd'
  type FlowControlType = 'none' | 'hardware'

  interface SerialOptions {
    baudRate: number
    dataBits?: number
    stopBits?: number
    parity?: ParityType
    bufferSize?: number
    flowControl?: FlowControlType
  }

  interface SerialOutputSignals {
    dataTerminalReady?: boolean
    requestToSend?: boolean
    break?: boolean
  }

  interface SerialInputSignals {
    dataCarrierDetect: boolean
    clearToSend: boolean
    ringIndicator: boolean
    dataSetReady: boolean
  }

  interface SerialPortInfo {
    usbVendorId?: number
    usbProductId?: number
  }

  interface SerialPortFilter {
    usbVendorId?: number
    usbProductId?: number
  }

  interface SerialPortRequestOptions {
    filters?: SerialPortFilter[]
  }

  interface SerialPort extends EventTarget {
    readonly readable: ReadableStream<Uint8Array> | null
    readonly writable: WritableStream<Uint8Array> | null
    open(options: SerialOptions): Promise<void>
    close(): Promise<void>
    forget?(): Promise<void>
    getInfo(): SerialPortInfo
    setSignals(signals: SerialOutputSignals): Promise<void>
    getSignals(): Promise<SerialInputSignals>
  }

  interface Serial extends EventTarget {
    requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>
    getPorts(): Promise<SerialPort[]>
  }

  // ---- WebUSB (minimal) https://wicg.github.io/webusb/ ----
  interface USBDeviceFilter {
    vendorId?: number
    productId?: number
    classCode?: number
    subclassCode?: number
    protocolCode?: number
    serialNumber?: string
  }

  interface USBDeviceRequestOptions {
    filters: USBDeviceFilter[]
    exclusionFilters?: USBDeviceFilter[]
  }

  interface USBDevice {
    readonly vendorId: number
    readonly productId: number
    readonly productName?: string
    readonly manufacturerName?: string
    readonly serialNumber?: string
    readonly opened: boolean
    open(): Promise<void>
    close(): Promise<void>
    forget?(): Promise<void>
  }

  interface USB extends EventTarget {
    requestDevice(options: USBDeviceRequestOptions): Promise<USBDevice>
    getDevices(): Promise<USBDevice[]>
  }

  // ---- Keyboard Lock https://wicg.github.io/keyboard-lock/ ----
  interface Keyboard {
    lock(keyCodes?: string[]): Promise<void>
    unlock(): void
  }

  interface Navigator {
    /** Web Serial; undefined in Firefox/Safari */
    readonly serial?: Serial
    /** WebUSB; undefined in Firefox/Safari */
    readonly usb?: USB
    /** Keyboard Lock; Chromium only */
    readonly keyboard?: Keyboard
  }

  // ---- Pointer Lock 2.0 (unadjustedMovement) ----
  interface PointerLockOptions {
    unadjustedMovement?: boolean
  }

  interface Element {
    requestPointerLock(options?: PointerLockOptions): Promise<void> | void
  }
}

export {}
