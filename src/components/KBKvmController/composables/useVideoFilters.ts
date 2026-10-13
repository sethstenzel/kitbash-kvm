import {computed, type Ref} from 'vue'
import {useElementSize} from '@vueuse/core'
import {useSettingsStore, isValidCssFilter} from '@/stores/settings'

interface UseVideoFiltersOptions {
  graphInfo: Ref<{width: number; height: number; aspectRatio: number}>
  // Element the video is laid out in (centered); its size bounds the video
  containerRef: Ref<HTMLElement | undefined>
}

/**
 * Composable for video filter and transformation logic
 * Handles mirroring, rotation, CSS filters, and aspect ratio adjustments
 */
export function useVideoFilters(options: UseVideoFiltersOptions) {
  const {graphInfo, containerRef} = options
  const settingsStore = useSettingsStore()
  const {width: containerWidth, height: containerHeight} = useElementSize(containerRef)

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

    // An invalid custom filter falls back to the presets instead of silently dropping all filtering
    if (settingsStore.inputFilter && isValidCssFilter(settingsStore.inputFilter)) {
      style.filter = settingsStore.inputFilter
    } else if (settingsStore.selectedFilters?.length) {
      style.filter = settingsStore.selectedFilters.join(' ')
    }
    if (settingsStore.fitMode) {
      style.objectFit = settingsStore.fitMode
    }
    return style
  })

  /**
   * Computed style for the video wrapper: explicit pixel size plus rotation about its center.
   * The wrapper is sized in its unrotated frame, so for ±90° width and height are swapped and
   * after rotation it exactly covers the area the video occupies on screen.
   */
  const videoWrapperStyle = computed(() => {
    const rotation = settingsStore.filterRotation || 0
    const quarterTurn = Math.abs(rotation) % 180 === 90
    const cw = containerWidth.value
    const ch = containerHeight.value
    if (!cw || !ch) {
      return {width: '100%', height: '100%'}
    }

    let width: number
    let height: number
    const videoAR = graphInfo.value.aspectRatio
    if (settingsStore.fitMode === 'contain' && videoAR > 0) {
      // Largest box with the displayed aspect ratio that fits the container
      const shownAR = quarterTurn ? 1 / videoAR : videoAR
      const shownW = Math.min(cw, ch * shownAR)
      const shownH = shownW / shownAR
      width = quarterTurn ? shownH : shownW
      height = quarterTurn ? shownW : shownH
    } else {
      // Other fit modes fill the whole container; object-fit handles the video inside
      width = quarterTurn ? ch : cw
      height = quarterTurn ? cw : ch
    }

    return {
      width: `${Math.floor(width)}px`,
      height: `${Math.floor(height)}px`,
      transform: rotation ? `rotate(${rotation}deg)` : undefined,
    }
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
