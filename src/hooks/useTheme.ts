import { useCallback } from 'react'
import { usePreferences, setPreference, resolvedPalette, isDarkPalette } from './usePreferences'
import type { ThemeChoice } from './usePreferences'

export type Theme = ThemeChoice

// Remembered for this visit only; a fresh load starts from the classic pair.
const lastUsed: { light: Theme; dark: Theme } = { light: 'paper', dark: 'dark' }

// Thin view over the shared preferences store (see usePreferences.ts), kept so the
// Masthead / command palette's light-dark toggle didn't need rewriting.
export function useTheme() {
  const { theme } = usePreferences()
  const palette = resolvedPalette(theme)
  const isDark = isDarkPalette(palette)

  const setTheme = useCallback((next: Theme) => setPreference('theme', next), [])
  // The quick toggle flips to the last palette of the other kind the reader used, so
  // a Sepia reader toggling to Night and back lands on Sepia, not Paper.
  const toggle = useCallback(() => {
    lastUsed[isDark ? 'dark' : 'light'] = palette
    setPreference('theme', isDark ? lastUsed.light : lastUsed.dark)
  }, [isDark, palette])

  return { theme, setTheme, toggle, isDark }
}
