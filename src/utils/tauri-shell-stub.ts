// Stub for the Tauri shell API, aliased in for browser (non-Tauri) builds only.
// Mirrors the signature of `open` from '@tauri-apps/api/shell'.
export const open = async (path: string): Promise<void> => {
  if (typeof window !== 'undefined') {
    window.open(path, '_blank', 'noopener,noreferrer')
  }
}
