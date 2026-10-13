/**
 * KitBash capture cards picked automatically when the app starts, in order of preference, with
 * the serial baud rate of the KVM they ship with. Labels are matched with "contains". The audio
 * label is the part after Chrome's "Default - " prefix, which only appears when the interface is
 * also the OS default input.
 */
export const KNOWN_CAPTURE_DEVICES = [
  {video: 'USB2 Video', audio: 'Digital Audio Interface (USB2 Digital Audio)', baudRate: '57600'},
  {video: 'USB Video', audio: 'Digital Audio Interface (USB Digital Audio)', baudRate: '9600'},
]

interface IDevice {
  deviceId: string
  label: string
}

// Chrome's virtual entries that follow whatever the OS default/communications device is
const VIRTUAL_AUDIO_IDS = new Set(['default', 'communications'])

/**
 * The first known capture card that's plugged in: its video device, plus the matching audio
 * device when present (preferring the device's own entry over Chrome's "Default - " alias).
 */
export const findKnownCaptureDevices = (videoDevices: IDevice[], audioDevices: IDevice[]) => {
  for (const known of KNOWN_CAPTURE_DEVICES) {
    const video = videoDevices.find((d) => d.deviceId && d.label.includes(known.video))
    if (!video) {
      continue
    }
    const audioMatches = audioDevices.filter((d) => d.deviceId && d.label.includes(known.audio))
    const audio = audioMatches.find((d) => !VIRTUAL_AUDIO_IDS.has(d.deviceId)) ?? audioMatches[0]
    return {videoId: video.deviceId, audioId: audio?.deviceId ?? '', baudRate: known.baudRate}
  }
  return null
}
