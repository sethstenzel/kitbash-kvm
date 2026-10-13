import {createGlobalState} from '@vueuse/core'
import {ref, shallowRef} from 'vue'

/** The subset of the Web Serial SerialPort API used here (also satisfied by web-serial-polyfill) */
export interface ISerialPortLike {
  open(options: {baudRate: number}): Promise<void>
  close(): Promise<void>
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
  getInfo?: () => {usbVendorId?: number; usbProductId?: number}
  addEventListener?: (type: string, listener: (event: Event) => void) => void
  removeEventListener?: (type: string, listener: (event: Event) => void) => void
}

// Only utils/serial-io.ts should touch reader/writer; everything else writes through it
export const useSerialState = createGlobalState(() => {
  const reader = shallowRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const writer = shallowRef<WritableStreamDefaultWriter<Uint8Array> | null>(null)
  const serialPort = shallowRef<ISerialPortLike | null>(null)
  // The browser's port chooser is open (Chrome leaves and refuses fullscreen meanwhile)
  const isChoosingPort = ref(false)
  return {
    reader,
    writer,
    serialPort,
    isChoosingPort,
  }
})
