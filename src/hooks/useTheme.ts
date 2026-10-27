import { useCallback } from 'react'
import { usePreferences, setPreference, resolvedPalette } from './usePreferences'
import type { ThemeChoice } from './usePreferences'

export type Theme = ThemeChoice

// Thin view over the shared preferences store (see usePreferences.ts), kept so the
// Masthead / command palette's light-dark toggle didn't need rewriting.
export function useTheme() {
  const { theme } = usePreferences()
  const palette = resolvedPalette(theme)
  const isDark = palette === 'dark' || palette === 'night'

  const setTheme = useCallback((next: Theme) => setPreference('theme', next), [])
  // The quick toggle flips between the light and dark palette the reader is
  // closest to, so a sepia reader toggling to dark and back lands on sepia, not paper.
  const toggle = useCallback(() => {
    if (isDark) setPreference('theme', palette === 'night' ? 'sepia' : 'paper')
    else setPreference('theme', palette === 'sepia' ? 'night' : 'dark')
  }, [isDark, palette])

  return { theme, setTheme, toggle, isDark }
}
