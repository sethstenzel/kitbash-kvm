import {fileTimestamp} from '@/utils/format-date'

// Preferred first; the extension is used for the downloaded file
const RECORDING_FORMATS = [
  {mimeType: 'video/webm;codecs=vp9,opus', ext: 'webm'},
  {mimeType: 'video/webm;codecs=vp8,opus', ext: 'webm'},
  {mimeType: 'video/webm', ext: 'webm'},
  {mimeType: 'video/mp4', ext: 'mp4'},
]

// Extra time recorded after stop is requested so the last frames aren't lost
const STOP_DELAY_MS = 1000

export class VideoRecorder {
  public videoElement: HTMLVideoElement
  public mediaRecorder: MediaRecorder | null = null
  // True while the delayed stop is pending
  public stopping = false
  private recordedChunks: Blob[] = []
  private stream: MediaStream | null = null

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement
  }

  start() {
    if (this.mediaRecorder) return

    const stream = this.videoElement.srcObject
    if (!(stream instanceof MediaStream) || !stream.getTracks().some((t) => t.readyState === 'live')) {
      window.$notification({type: 'error', message: 'Nothing to record: no active video stream', timeout: 3000})
      return
    }

    const format = RECORDING_FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mimeType))
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, {
        audioBitsPerSecond: 320000,
        videoBitsPerSecond: 8000000,
        ...(format ? {mimeType: format.mimeType} : {}),
      })
    } catch (error: any) {
      console.error('Failed to create MediaRecorder:', error)
      window.$notification({
        type: 'error',
        message: `Recording failed to start: ${error?.message || error}`,
        timeout: 5000,
      })
      return
    }

    const mimeType = recorder.mimeType || format?.mimeType || 'video/webm'
    const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data)
      }
    }

    recorder.onstop = () => {
      this.detachStream()
      const blob = new Blob(this.recordedChunks, {type: mimeType})
      this.recordedChunks = []
      this.mediaRecorder = null
      this.stopping = false
      if (!blob.size) {
        window.$notification({type: 'warning', message: 'Recording was empty, nothing saved', timeout: 3000})
        return
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `record_${fileTimestamp()}.${ext}`
      link.click()
      // Release the recording from memory once the download has started
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    }

    recorder.onerror = (event: Event) => {
      const error = (event as any).error
      console.error('MediaRecorder error:', error)
      window.$notification({
        type: 'error',
        message: `Recording error: ${error?.message || 'unknown error'}`,
        timeout: 5000,
      })
    }

    this.recordedChunks = []
    this.stream = stream
    // Stop (and save what was recorded) if the capture device goes away or the stream is replaced
    stream.getTracks().forEach((track) => track.addEventListener('ended', this.handleSourceEnded))
    this.videoElement.addEventListener('emptied', this.handleSourceEnded)
    this.mediaRecorder = recorder
    recorder.start(1000)
  }

  stop() {
    const recorder = this.mediaRecorder
    if (recorder && recorder.state !== 'inactive' && !this.stopping) {
      this.stopping = true
      setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop()
      }, STOP_DELAY_MS)
    }
  }

  private handleSourceEnded = () => {
    // The stream is gone, so there is nothing to wait for
    const recorder = this.mediaRecorder
    if (recorder && recorder.state !== 'inactive') {
      this.stopping = true
      recorder.stop()
      window.$notification({
        type: 'warning',
        message: 'Video stream ended, recording saved',
        timeout: 3000,
      })
    }
  }

  private detachStream() {
    this.stream?.getTracks().forEach((track) => track.removeEventListener('ended', this.handleSourceEnded))
    this.videoElement.removeEventListener('emptied', this.handleSourceEnded)
    this.stream = null
  }
}
