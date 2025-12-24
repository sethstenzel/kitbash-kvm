import {computed, type Ref} from 'vue'
import {useSettingsStore} from '@/stores/settings'

interface UseVideoFiltersOptions {
  graphInfo: Ref<{width: number; height: number; aspectRatio: number}>
  isFullscreen: Ref<boolean>
}

/**
 * Composable for video filter and transformation logic
 * Handles mirroring, rotation, CSS filters, and aspect ratio adjustments
 */
export function useVideoFilters(options: UseVideoFiltersOptions) {
  const {graphInfo, isFullscreen} = options
  const settingsStore = useSettingsStore()

  /**
   * Computed style for video filters (mirroring and CSS filters)
   */
  const videoFilterStyle = computed(() => {
    const style: any = {}

    // Build transform string for mirroring only (rotation is applied to wrapper)
    const transforms: string[] = []

    // Add mirroring transforms
    if (settingsStore.filterMirrorX && settingsStore.filterMirrorY) {
      transforms.push(`rotateX(180deg) rotateY(180deg)`)
    } else if (settingsStore.filterMirrorX) {
      transforms.push(`rotateX(180deg)`)
    } else if (settingsStore.filterMirrorY) {
      transforms.push(`rotateY(180deg)`)
    }

    if (transforms.length > 0) {
      style.transform = transforms.join(' ')
    }

    if (settingsStore.inputFilter) {
      style.filter = settingsStore.inputFilter
    } else if (settingsStore.selectedFilters) {
      style.filter = settingsStore.selectedFilters.join(' ')
    }
    if (settingsStore.fitMode) {
      style.objectFit = settingsStore.fitMode
    }
    return style
  })

  /**
   * Computed style for video wrapper (rotation and scaling)
   */
  const videoWrapperStyle = computed(() => {
    const style: any = {}
    const rotation = settingsStore.filterRotation || 0
    const isVerticalRotation = rotation === 90 || rotation === -90

    // Apply rotation and scaling transform to the wrapper
    const transforms: string[] = []

    if (rotation && rotation !== 0) {
      transforms.push(`rotate(${rotation}deg)`)
    }

    // For vertical rotations, we need to scale the wrapper to fit properly
    // The wrapper dimensions are swapped, so we scale based on the aspect ratio difference
    if (isVerticalRotation && settingsStore.fitMode === 'contain' && graphInfo.value.aspectRatio) {
      // When in fullscreen, calculate scale based on viewport dimensions
      // Otherwise, use the video's aspect ratio
      let scaleFactor: number

      if (isFullscreen.value) {
        // In fullscreen with vertical rotation, we need to maximize the use of available space
        // The rotated video's effective aspect ratio is inverted (1 / originalAspect)
        const viewportAspectRatio = window.innerWidth / window.innerHeight
        const videoAspectRatio = graphInfo.value.aspectRatio

        // Scale to fit the rotated video within the fullscreen viewport
        // Use max to ensure we fill the available space
        scaleFactor = Math.max(viewportAspectRatio * videoAspectRatio, 1)
      } else {
        // Non-fullscreen: use the original aspect ratio scaling
        scaleFactor = graphInfo.value.aspectRatio
      }

      transforms.push(`scale(${scaleFactor})`)
    }

    if (transforms.length > 0) {
      style.transform = transforms.join(' ')
    }

    // When in contain mode, adjust aspect ratio based on rotation
    if (settingsStore.fitMode === 'contain' && graphInfo.value.aspectRatio) {
      if (isVerticalRotation) {
        // Swap aspect ratio for vertical rotations
        style.aspectRatio = 1 / graphInfo.value.aspectRatio
      } else {
        style.aspectRatio = graphInfo.value.aspectRatio
      }
    } else {
      style.width = '100%'
      style.height = '100%'
    }

    return style
  })

  /**
   * Computed style for device info overlay (counter-rotation)
   */
  const deviceInfoOverlayStyle = computed(() => {
    const rotation = settingsStore.filterRotation || 0

    // Counter-rotate the overlay to keep it upright
    if (rotation && rotation !== 0) {
      return {
        transform: `rotate(${-rotation}deg)`,
      }
    }

    return {}
  })

  return {
    videoFilterStyle,
    videoWrapperStyle,
    deviceInfoOverlayStyle,
  }
}
