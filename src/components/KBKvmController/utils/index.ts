export function snapVideoImage(video: HTMLVideoElement) {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')!.drawImage(video, 0, 0, video.videoWidth, video.videoHeight)

  // Convert canvas to png format and save
  return canvas.toDataURL('image/png')
}

export const downloadUrl = (url: string, filename?) => {
  // Create a virtual <a> tag
  const a = document.createElement('a')
  // Set href to file URL
  a.href = url
  // Set download attribute to specify download filename
  a.download = filename
  // Add <a> tag to DOM
  document.body.appendChild(a)
  // Simulate click <a> tag to trigger download
  a.click()
  // Remove <a> tag after click
  document.body.removeChild(a)
}

/**
 * Copy string to clipboard operation (compatible with new and old interfaces)
 * @param text Text to copy
 */
export const copyToClipboard = (text): Promise<void> => {
  return new Promise((resolve, reject) => {
    // If Clipboard API is supported, use it
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          resolve()
        })
        .catch((error) => {
          reject(error)
        })
    } else {
      // Use document.execCommand for old API compatibility
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.display = 'none'
      document.body.appendChild(textarea)
      textarea.select()

      try {
        const success = document.execCommand('copy')
        if (!success) {
          throw new Error('Unable to perform copy operation')
        } else {
          resolve()
        }
      } catch (error) {
        reject(error)
      } finally {
        document.body.removeChild(textarea)
      }
    }
  })
}

export const copy = async (val, isShowVal = true) => {
  if (!val) {
    return
  }
  if (typeof val === 'object') {
    if (isShowVal) {
      console.info('object', val)
    }
    val = JSON.stringify(val, null, 2)
  }
  if (isShowVal) {
    console.info('copy:', val)
  }
  await copyToClipboard(val)
  let showVal = ''
  if (isShowVal) {
    if (val.length > 350) {
      showVal = val.slice(0, 350) + '...'
    } else {
      showVal = val
    }
  }
  if (showVal) {
    showVal = ': ' + showVal
  }
  window.$notification({
    type: 'success',
    message: `Copied${showVal}`,
    timeout: 5000,
  })
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
