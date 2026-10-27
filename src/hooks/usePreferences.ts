import { useSyncExternalStore } from 'react'

// One store for every reading preference, shared by every component that reads
// it. Before this, each component that called useTheme() kept its own copy of the
// theme in local state, so changing it in Settings left the Masthead's sun/moon
// icon (and the command palette's label) showing the old value until a remount.

export type ThemeChoice = 'auto' | 'paper' | 'sepia' | 'dark' | 'night'
export type ReadingFont = 'serif' | 'sans' | 'legible'
export type TextSize = 's' | 'm' | 'l' | 'xl'

export interface Preferences {
  theme: ThemeChoice
  font: ReadingFont
  textSize: TextSize
  /** Page curl, ink-settle and the paper-edition layout. */
  pageEffects: boolean
  pageSound: boolean
}

const KEYS = {
  theme: 'daily-brief:theme',
  font: 'daily-brief:font',
  textSize: 'daily-brief:text-size',
  pageEffects: 'daily-brief:page-effects',
  pageSound: 'daily-brief:page-sound',
} as const

const THEMES: ThemeChoice[] = ['auto', 'paper', 'sepia', 'dark', 'night']
const FONTS: ReadingFont[] = ['serif', 'sans', 'legible']
const SIZES: TextSize[] = ['s', 'm', 'l', 'xl']

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

function load(): Preferences {
  const rawTheme = read(KEYS.theme)
  // 'light' was the only light option before sepia/night existed.
  const theme = rawTheme === 'light' ? 'paper' : (THEMES as string[]).includes(rawTheme ?? '') ? rawTheme as ThemeChoice : 'auto'
  const font = read(KEYS.font)
  const size = read(KEYS.textSize)
  return {
    theme,
    font: (FONTS as string[]).includes(font ?? '') ? font as ReadingFont : 'serif',
    textSize: (SIZES as string[]).includes(size ?? '') ? size as TextSize : 'm',
    pageEffects: read(KEYS.pageEffects) !== 'false',
    pageSound: read(KEYS.pageSound) === 'true',
  }
}

let state: Preferences = load()
const listeners = new Set<() => void>()

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

export function resolvedPalette(theme: ThemeChoice): Exclude<ThemeChoice, 'auto'> {
  if (theme === 'auto') return systemDark() ? 'dark' : 'paper'
  return theme
}

function apply(p: Preferences) {
  const root = document.documentElement
  const palette = resolvedPalette(p.theme)
  // data-theme stays a plain light/dark switch so every existing [data-theme="dark"]
  // rule and Tailwind's dark: variant keep working; data-palette layers the
  // sepia/night variations on top of it.
  root.dataset.theme = palette === 'dark' || palette === 'night' ? 'dark' : 'light'
  root.dataset.palette = palette
  root.dataset.font = p.font
  root.dataset.textSize = p.textSize
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--canvas').trim() || '#FBFAF7')
}

apply(state)

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (state.theme === 'auto') { apply(state); listeners.forEach(l => l()) }
})

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  state = { ...state, [key]: value }
  write(KEYS[key], String(value))
  apply(state)
  listeners.forEach(l => l())
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

/** Reduced-motion users always get the static layout, whatever the toggle says. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    cb => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  )
}

/** True when the flip-book paper edition should be used. */
export function usePaperMode(): boolean {
  const { pageEffects } = usePreferences()
  const reduced = usePrefersReducedMotion()
  return pageEffects && !reduced
}
