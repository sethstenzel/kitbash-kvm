// Stub for Tauri shell API when running in browser mode
export const open = (url: string) => {
  if (typeof window !== 'undefined') {
    window.open(url)
  }
}
