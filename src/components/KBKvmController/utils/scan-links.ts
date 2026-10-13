const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]!)

export const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch (_) {
    return false
  }
}

const MAX_LINKS_SHOWN = 5

/**
 * Open the first URL found by a scan in a new tab.
 * Browsers only allow window.open shortly after a user gesture, which has usually expired by the
 * time a scan finishes, so the URLs are always also offered as clickable links.
 */
export const openScannedUrls = (urls: string[]) => {
  if (!urls.length) return

  // With 'noopener' window.open always returns null, so success can't be detected from it
  const hasActivation = (navigator as any).userActivation?.isActive ?? false
  if (hasActivation) {
    window.open(urls[0], '_blank', 'noopener,noreferrer')
  }

  const links = urls
    .slice(0, MAX_LINKS_SHOWN)
    .map((u) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">${escapeHtml(u)}</a>`)
    .join('<br>')
  const more = urls.length > MAX_LINKS_SHOWN ? `<br>(+${urls.length - MAX_LINKS_SHOWN} more)` : ''
  const intro = hasActivation
    ? 'Tried to open the first link in a new tab. If nothing opened, click a link below:'
    : 'The browser blocks opening tabs automatically after a scan. Click a link to open it:'

  window.$notification({
    type: 'info',
    html: `${intro}<br>${links}${more}`,
    timeout: 15000,
  })
}
