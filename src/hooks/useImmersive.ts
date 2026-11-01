import { useSyncExternalStore } from 'react'

// Immersive reading: the browser's own bars (via the Fullscreen API) and the app's
// chrome (masthead, tab bar, sidebar, paper toolbar) all step aside so the page fills
// the screen. Browsers that can't install a web app as a real app (Brave on Android
// has no WebAPK service) still support the Fullscreen API, so this is the way to a
// chrome-free paper there. iPhone Safari has no Fullscreen API on pages; the app's own
// chrome still hides, and "Add to Home Screen" gives the standalone view.

let on = false
const listeners = new Set<() => void>()
const emit = () => {
  document.documentElement.dataset.immersive = on ? 'true' : 'false'
  listeners.forEach(l => l())
}

export const fullscreenSupported = () =>
  typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

export function enterImmersive() {
  on = true
  emit()
  // Must run inside the tap that called us. Denied or unsupported is fine: the
  // app's own chrome is already hidden.
  try { void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' } as FullscreenOptions)?.catch(() => {}) } catch { /* unsupported */ }
}

export function exitImmersive() {
  on = false
  emit()
  try { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}) } catch { /* ignore */ }
}

if (typeof document !== 'undefined') {
  // The Back gesture / Esc leaves fullscreen without going through exitImmersive().
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && on) { on = false; emit() }
  })
}

export function useImmersive() {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => on,
    () => false,
  )
}
