import { useSyncExternalStore } from 'react'
import { emptyProfile, recordEngaged, recordFeedback, recordOpen, startSession, touch, type Profile } from '../lib/profile'
import type { Story } from '../lib/types'

// What the paper has learned about this reader, kept on this device only. The store is
// shared by every component (the same pattern as usePreferences), saved to
// localStorage a moment after each change, and flushed when the page is hidden.

const KEY = 'daily-brief:profile:v1'

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as Profile
      if (p && p.v === 1) return { ...emptyProfile(), ...p }
    }
  } catch { /* unreadable or unavailable: start fresh */ }
  return emptyProfile()
}

let profile: Profile = startSession(load())
// The paper is "printed" from the profile as it was when you opened it, so stories
// don't shuffle under your thumb while you read. Only a deliberate change (a reset)
// reprints it.
let rankProfile: Profile = profile
let rankEpoch = 0
const listeners = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | undefined

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(profile)) } catch { /* storage unavailable */ }
}
function emit() { listeners.forEach(l => l()) }
function commit(next: Profile) {
  if (next === profile) return
  profile = next
  emit()
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 400)
}

save()
if (typeof document !== 'undefined') {
  const flush = () => { profile = touch(profile); clearTimeout(saveTimer); save() }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
  window.addEventListener('pagehide', flush)
  setInterval(() => { if (document.visibilityState === 'visible') { profile = touch(profile); save() } }, 60_000)
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }

export const markOpened = (story: Story) => commit(recordOpen(profile, story))
export const markEngaged = (story: Story, seconds: number) => commit(recordEngaged(profile, story, seconds))
export const setFeedback = (story: Story, dir: 1 | -1 | null) => commit(recordFeedback(profile, story, dir))

/** Forget everything the paper has learned, and reprint the paper without it. */
export function resetProfile() {
  const fresh = startSession({ ...emptyProfile(), lastSeen: profile.lastSeen, sessionSince: profile.sessionSince })
  profile = fresh
  rankProfile = fresh
  rankEpoch++
  clearTimeout(saveTimer)
  save()
  emit()
}

/** The live profile (changes as you read). */
export const useProfile = () => useSyncExternalStore(subscribe, () => profile, () => profile)
/** The profile the paper was printed from, and a counter that moves when it is reprinted. */
export const useRankProfile = () => useSyncExternalStore(subscribe, () => rankProfile, () => rankProfile)
export const useRankEpoch = () => useSyncExternalStore(subscribe, () => rankEpoch, () => rankEpoch)
export const useIsRead = (id: string) => useSyncExternalStore(subscribe, () => !!profile.read[id], () => false)
export const useVote = (id: string) => useSyncExternalStore(subscribe, () => profile.feedback[id] ?? 0, () => 0)
