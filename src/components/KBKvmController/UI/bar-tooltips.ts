import type {Directive} from 'vue'
import './bar-tooltips.scss'

/**
 * Themed tooltips for every [title] inside the element (the command bar), replacing the
 * browser's native ones. While hovered, the title is parked in data-kb-tip so the native
 * tooltip doesn't also appear; it's restored on leave so Vue's bindings keep owning it.
 */
const SHOW_DELAY_MS = 450
// Sliding straight onto a neighbouring button shows its tooltip without the delay
const WARM_WINDOW_MS = 400
const GAP = 10
const EDGE = 6

let tip: HTMLDivElement | null = null
let current: HTMLElement | null = null
let showTimer: ReturnType<typeof setTimeout> | null = null
let lastHiddenAt = 0

const getTip = () => {
  if (!tip) {
    tip = document.createElement('div')
    tip.className = 'kb-tooltip'
    tip.setAttribute('role', 'tooltip')
    document.body.appendChild(tip)
  }
  return tip
}

const hideTip = () => {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
  if (tip?.classList.contains('visible')) {
    tip.classList.remove('visible')
    lastHiddenAt = performance.now()
  }
}

/** Hide and hand the title back to the element */
const release = () => {
  hideTip()
  if (current) {
    const text = current.dataset.kbTip
    delete current.dataset.kbTip
    // Vue may have set a newer title while it was parked
    if (text && !current.hasAttribute('title')) {
      current.setAttribute('title', text)
    }
    current = null
  }
}

const position = (el: HTMLElement, t: HTMLDivElement) => {
  const r = el.getBoundingClientRect()
  const below = r.bottom + GAP + t.offsetHeight <= window.innerHeight - EDGE
  const centerX = r.left + r.width / 2
  const left = Math.min(
    Math.max(EDGE, centerX - t.offsetWidth / 2),
    window.innerWidth - t.offsetWidth - EDGE
  )
  t.style.left = `${left}px`
  t.style.top = `${below ? r.bottom + GAP : r.top - GAP - t.offsetHeight}px`
  t.style.setProperty('--arrow-x', `${centerX - left}px`)
  t.dataset.side = below ? 'bottom' : 'top'
}

const show = (el: HTMLElement) => {
  showTimer = null
  const text = el.dataset.kbTip
  // An open dropdown shows its own header instead
  if (!text || current !== el || el.getAttribute('aria-expanded') === 'true') {
    return
  }
  const t = getTip()
  t.textContent = text
  position(el, t)
  t.classList.add('visible')
}

const handlers = new WeakMap<HTMLElement, Record<string, EventListener>>()

export const vBarTooltips: Directive<HTMLElement> = {
  mounted(bar) {
    const onOver = (e: Event) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[title], [data-kb-tip]')
      if (!el || el === current || !bar.contains(el)) {
        return
      }
      release()
      const text = el.getAttribute('title')
      if (!text) {
        return
      }
      el.dataset.kbTip = text
      el.removeAttribute('title')
      current = el
      const isWarm = performance.now() - lastHiddenAt < WARM_WINDOW_MS
      showTimer = setTimeout(() => show(el), isWarm ? 0 : SHOW_DELAY_MS)
    }
    const onOut = (e: Event) => {
      const next = (e as PointerEvent).relatedTarget as Node | null
      if (current && !(next && current.contains(next))) {
        release()
      }
    }
    // Clicking hides the tooltip but keeps the title parked, so the native one can't pop up
    const onDown = () => hideTip()
    const listeners: Record<string, EventListener> = {
      pointerover: onOver,
      pointerout: onOut,
      pointerdown: onDown,
    }
    Object.entries(listeners).forEach(([type, fn]) => bar.addEventListener(type, fn))
    window.addEventListener('scroll', release, true)
    window.addEventListener('blur', release)
    handlers.set(bar, listeners)
  },
  unmounted(bar) {
    const listeners = handlers.get(bar)
    if (listeners) {
      Object.entries(listeners).forEach(([type, fn]) => bar.removeEventListener(type, fn))
      handlers.delete(bar)
    }
    window.removeEventListener('scroll', release, true)
    window.removeEventListener('blur', release)
    release()
  },
}
