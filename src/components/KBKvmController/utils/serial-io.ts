/**
 * Single owner of the serial reader/writer: open/close, a serialized write queue,
 * a read loop that drains and parses CH9329 replies, and disconnect handling.
 */
import {useSerialState, type ISerialPortLike} from './serial-state'
import {Ch9329FrameParser, CmdType, genPacket, type ICh9329Frame} from './ch9329'

const OPEN_TIMEOUT_MS = 900
const PROBE_TIMEOUT_MS = 500
// Per the Web Serial spec these leave the port usable: a fresh readable is provided afterwards
const NON_FATAL_READ_ERRORS = ['BreakError', 'FramingError', 'ParityError', 'BufferOverrunError']

type ReleaseHook = () => unknown
type ClosedHook = (lost: boolean) => void
const releaseHooks = new Set<ReleaseHook>()
const closedHooks = new Set<ClosedHook>()

/** Called before the port closes (while writes still work) to release keys/buttons */
export const onSerialRelease = (hook: ReleaseHook) => {
  releaseHooks.add(hook)
  return () => releaseHooks.delete(hook)
}

/** Called after the port has closed; `lost` is true when the device went away */
export const onSerialClosed = (hook: ClosedHook) => {
  closedHooks.add(hook)
  return () => closedHooks.delete(hook)
}

const noop = () => {}

/** Resolves with p's value, or undefined after ms; never leaves p's rejection unhandled */
const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | undefined> => {
  p.catch(noop)
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    p,
    new Promise<undefined>((resolve) => (timer = setTimeout(resolve, ms))),
  ]).finally(() => clearTimeout(timer))
}

let writeChain: Promise<unknown> = Promise.resolve()
let tearingDown = false
let closingPromise: Promise<void> | null = null
let detachDisconnect: (() => void) | null = null

const replyWaiters = new Set<{cmd: number; resolve: (frame: ICh9329Frame | null) => void}>()

export const isSerialConnected = () => !!useSerialState().serialPort.value

/**
 * Queue bytes for the port. Writes never overlap and never reject:
 * resolves false when not connected or when the write failed (which tears the connection down).
 */
export const writeSerial = (data: Uint8Array | number[]): Promise<boolean> => {
  const {writer} = useSerialState()
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const result = writeChain.then(async () => {
    const w = writer.value
    if (!w) {
      return false
    }
    try {
      await w.write(bytes)
      return true
    } catch (error) {
      handleConnectionLost(error)
      return false
    }
  })
  writeChain = result
  return result
}

/** Wait for the chip's reply to `cmd` (success or error frame); null on timeout or close */
export const waitForReply = (cmd: CmdType, timeoutMs: number) =>
  new Promise<ICh9329Frame | null>((resolve) => {
    const waiter = {
      cmd,
      resolve: (frame: ICh9329Frame | null) => {
        clearTimeout(timer)
        replyWaiters.delete(waiter)
        resolve(frame)
      },
    }
    const timer = setTimeout(() => waiter.resolve(null), timeoutMs)
    replyWaiters.add(waiter)
  })

let lastChipErrorLog = 0
const handleFrame = (frame: ICh9329Frame) => {
  if (!(frame.cmd & 0x80)) {
    return
  }
  const requestCmd = frame.cmd & 0x3f
  if (frame.cmd & 0x40 && Date.now() - lastChipErrorLog > 5000) {
    lastChipErrorLog = Date.now()
    console.warn(
      `CH9329 rejected command 0x${requestCmd.toString(16)}, status 0x${(frame.data[0] ?? 0).toString(16)}`,
    )
  }
  for (const waiter of [...replyWaiters]) {
    if (waiter.cmd === requestCmd) {
      waiter.resolve(frame)
    }
  }
}

const readLoop = async (port: ISerialPortLike) => {
  const {reader, serialPort} = useSerialState()
  const parser = new Ch9329FrameParser()
  while (reader.value && !tearingDown) {
    const r = reader.value
    try {
      const {value, done} = await r.read()
      if (done) {
        break
      }
      if (value) {
        parser.push(value).forEach(handleFrame)
      }
    } catch (error: any) {
      if (tearingDown) {
        return
      }
      if (NON_FATAL_READ_ERRORS.includes(error?.name) && port.readable) {
        try {
          r.releaseLock()
          reader.value = port.readable.getReader()
          continue
        } catch {
          // fall through to teardown
        }
      }
      handleConnectionLost(error)
      return
    }
  }
  // The stream ended without us closing it: the device is gone
  if (!tearingDown && serialPort.value === port) {
    handleConnectionLost(new Error('Serial read stream closed'))
  }
}

const handleConnectionLost = (error?: unknown) => {
  if (tearingDown || !useSerialState().serialPort.value) {
    return
  }
  console.warn('Serial connection lost:', error)
  void closeSerial({lost: true})
}

const attachDisconnectListeners = (port: ISerialPortLike) => {
  const onDisconnect = (event: Event) => {
    if ((event.target as unknown) === port) {
      handleConnectionLost(new Error('Serial device disconnected'))
    }
  }
  const serial = navigator.serial
  serial?.addEventListener?.('disconnect', onDisconnect)
  port.addEventListener?.('disconnect', onDisconnect)
  detachDisconnect = () => {
    serial?.removeEventListener?.('disconnect', onDisconnect)
    port.removeEventListener?.('disconnect', onDisconnect)
  }
}

const openWithTimeout = async (port: ISerialPortLike, baudRate: number) => {
  const opened = port.open({baudRate})
  const result = await withTimeout(
    opened.then(() => 'opened' as const),
    OPEN_TIMEOUT_MS,
  )
  if (result === 'opened') {
    return
  }
  if (result === undefined) {
    // open() keeps running after the timeout; close it once it settles so the next attempt starts clean
    const late = await withTimeout(
      opened.then(
        () => true,
        () => false,
      ),
      3000,
    )
    if (late) {
      await port.close().catch(noop)
    } else if (late === undefined) {
      opened.then(() => port.close()).catch(noop)
    }
    throw new Error(
      `Timed out opening the serial port at ${baudRate} baud. Unplug/replug the device and try again.`,
    )
  }
}

/** Ask the chip for its info; warn when it doesn't answer (usually a wrong baud rate) */
const probeChip = async (baudRate: number) => {
  const reply = waitForReply(CmdType.CMD_GET_INFO, PROBE_TIMEOUT_MS)
  if (!(await writeSerial(genPacket(CmdType.CMD_GET_INFO)))) {
    return
  }
  if (!(await reply) && isSerialConnected()) {
    window.$notification({
      type: 'warning',
      message: `No response from the KVM chip at ${baudRate} baud. The baud rate may be wrong; change it in Settings if keyboard/mouse don't work.`,
      timeout: 8000,
    })
  }
}

export const openSerial = async (port: ISerialPortLike, baudRate: number) => {
  const {reader, writer, serialPort} = useSerialState()
  if (closingPromise) {
    await closingPromise
  }
  try {
    await openWithTimeout(port, baudRate)
  } catch (error: any) {
    if (error?.name !== 'InvalidStateError') {
      throw error
    }
    // Already open, e.g. by an earlier attempt that timed out
    await port.close().catch(noop)
    await openWithTimeout(port, baudRate)
  }
  if (!port.readable || !port.writable) {
    await port.close().catch(noop)
    throw new Error('Serial port opened without readable/writable streams')
  }
  tearingDown = false
  writeChain = Promise.resolve()
  reader.value = port.readable.getReader()
  writer.value = port.writable.getWriter()
  serialPort.value = port
  attachDisconnectListeners(port)
  void readLoop(port)
  void probeChip(baudRate)
}

/** Release inputs (best effort), then tear down reader, writer and port. Safe to call repeatedly. */
export const closeSerial = ({lost = false}: {lost?: boolean} = {}): Promise<void> => {
  if (closingPromise) {
    return closingPromise
  }
  const {reader, writer, serialPort} = useSerialState()
  const port = serialPort.value
  if (!port) {
    return Promise.resolve()
  }
  tearingDown = true
  closingPromise = (async () => {
    for (const hook of releaseHooks) {
      try {
        await withTimeout(Promise.resolve(hook()), 300)
      } catch (error) {
        console.warn(error)
      }
    }
    await withTimeout(writeChain, lost ? 100 : 500)

    const r = reader.value
    const w = writer.value
    reader.value = null
    writer.value = null
    detachDisconnect?.()
    detachDisconnect = null
    if (r) {
      await withTimeout(r.cancel(), 500)
      try {
        r.releaseLock()
      } catch {
        // already released
      }
    }
    if (w) {
      await withTimeout(lost ? w.abort() : w.close(), 500)
      try {
        w.releaseLock()
      } catch {
        // already released
      }
    }
    try {
      await withTimeout(port.close(), 1000)
    } catch (error) {
      console.warn('Error closing serial port:', error)
    }
    serialPort.value = null
    replyWaiters.forEach((waiter) => waiter.resolve(null))
    closedHooks.forEach((hook) => hook(lost))
    if (lost) {
      window.$notification({
        type: 'warning',
        message: 'KVM serial device disconnected',
        timeout: 5000,
      })
    }
  })().finally(() => {
    closingPromise = null
  })
  return closingPromise
}
