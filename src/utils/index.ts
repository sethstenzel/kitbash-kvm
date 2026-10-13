import {open} from '@tauri-apps/api/shell'
import pkg from '../../package.json'

/**
 * True when running inside the Tauri (v1) WebView.
 * `window.__TAURI__` only exists with `build.withGlobalTauri: true`; the IPC bridge
 * `window.__TAURI_IPC__` is always injected and is what @tauri-apps/api itself calls.
 */
export const isTauri: boolean =
  typeof window !== 'undefined' && '__TAURI_IPC__' in window

export const uniOpenUrl = (url: string) => {
  if (isTauri) {
    // Opens in the system browser (requires tauri.allowlist.shell.open)
    open(url).catch((e) => {
      console.error('Failed to open url via Tauri shell', e)
    })
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export const getVersion = () => {
  return `v${pkg.version}`
}

export const getPkg = () => pkg
