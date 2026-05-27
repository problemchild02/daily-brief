import { useEffect, useState, useCallback } from 'react'

export type Theme = 'light' | 'dark' | 'auto'

const STORAGE_KEY = 'daily-brief:theme'

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'auto' ? getSystemTheme() : theme
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', resolveTheme(theme))
}

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'auto') return v
  } catch {
    // localStorage unavailable
  }
  return 'auto'
}

// Apply immediately on module load to eliminate flash of wrong theme.
applyTheme(readStored())

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStored)

  useEffect(() => {
    applyTheme(theme)

    if (theme !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('auto')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }
    setThemeState(next)
  }, [])

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  const isDark = resolveTheme(theme) === 'dark'

  return { theme, setTheme, toggle, isDark }
}
