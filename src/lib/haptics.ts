import { getPreferences } from '../hooks/usePreferences'

// Short vibration patterns, tuned to feel like a physical page rather than a
// buzz: a few ms is a tick, longer with a gap is a settle. Android browsers
// (Chrome, Brave, Firefox, Samsung Internet) implement navigator.vibrate;
// iPhone browsers don't expose any haptics API, so this is a no-op there.
const PATTERNS = {
  /** A finger grabs a page corner. */
  tick: 6,
  /** A light tap: opening a story, prev/next. */
  soft: 10,
  /** A switch or option changes. */
  select: 12,
  /** A page lands. */
  turn: [14, 22, 8],
  /** Something saved. */
  success: [10, 40, 18],
} as const

export type HapticKind = keyof typeof PATTERNS

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/** Fire a haptic cue. Silent when the reader turned haptics off or the device
    can't vibrate; never throws (browsers refuse vibration before a user gesture). */
export function haptic(kind: HapticKind): void {
  try {
    if (!getPreferences().haptics || !hapticsSupported()) return
    navigator.vibrate(PATTERNS[kind] as number | number[])
  } catch { /* vibration blocked */ }
}
