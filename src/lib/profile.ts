import type { Story } from './types'
import { topicsOf } from './topics'

// What the paper has learned about this reader, on this device. Everything is a
// decaying weight (half-life three weeks), so a habit that stops fades out. Nothing
// here leaves the device.

export interface Affinity { w: number; t: number }

export interface Profile {
  v: 1
  read: Record<string, number>              // story id -> first opened (ms)
  engaged: Record<string, number>           // story id -> seconds spent (>= ENGAGED_SECONDS)
  feedback: Record<string, 1 | -1>          // story id -> "more like this" / "less like this"
  sections: Record<string, Affinity>
  sources: Record<string, Affinity>
  topics: Record<string, Affinity>
  lastSeen: number                          // last activity (ms)
  sessionSince: number                      // where "new since your last visit" counts from
  created: number
}

export const HALF_LIFE_MS = 21 * 24 * 3600 * 1000
export const ENGAGED_SECONDS = 15
const MAX_TOPICS = 300
const KEEP_READ_MS = 60 * 24 * 3600 * 1000
/** A visit this soon after the last one continues the same "session". */
export const SESSION_GAP_MS = 30 * 60 * 1000

export function emptyProfile(now = Date.now()): Profile {
  return { v: 1, read: {}, engaged: {}, feedback: {}, sections: {}, sources: {}, topics: {}, lastSeen: 0, sessionSince: 0, created: now }
}

export const decayed = (a: Affinity | undefined, now: number): number =>
  a ? a.w * Math.pow(0.5, (now - a.t) / HALF_LIFE_MS) : 0

function bump(map: Record<string, Affinity>, key: string, amount: number, now: number) {
  map[key] = { w: decayed(map[key], now) + amount, t: now }
}

function trim(map: Record<string, Affinity>, now: number, max: number) {
  const keys = Object.keys(map)
  if (keys.length <= max) return
  keys.sort((a, b) => Math.abs(decayed(map[a], now)) - Math.abs(decayed(map[b], now)))
  for (const k of keys.slice(0, keys.length - max)) delete map[k]
}

/** Opening a story is a mild vote for its section, source and topics. */
export function recordOpen(p: Profile, story: Story, now = Date.now()): Profile {
  if (p.read[story.id]) return p
  const next: Profile = { ...p, read: { ...p.read, [story.id]: now }, sections: { ...p.sections }, sources: { ...p.sources }, topics: { ...p.topics } }
  bump(next.sections, story.section, 1, now)
  bump(next.sources, story.source, 0.6, now)
  for (const t of topicsOf(story)) bump(next.topics, t, 1, now)
  trim(next.topics, now, MAX_TOPICS)
  return next
}

/** Staying with a story is a much stronger vote than opening it. */
export function recordEngaged(p: Profile, story: Story, seconds: number, now = Date.now()): Profile {
  if (seconds < ENGAGED_SECONDS || p.engaged[story.id]) return p
  const next: Profile = { ...p, engaged: { ...p.engaged, [story.id]: seconds }, sections: { ...p.sections }, sources: { ...p.sources }, topics: { ...p.topics } }
  bump(next.sections, story.section, 1.5, now)
  bump(next.sources, story.source, 0.8, now)
  for (const t of topicsOf(story)) bump(next.topics, t, 1.5, now)
  return next
}

/** "More like this" / "Less like this", or null to take it back. Replaces an earlier vote. */
export function recordFeedback(p: Profile, story: Story, dir: 1 | -1 | null, now = Date.now()): Profile {
  const before = p.feedback[story.id] ?? 0
  const after = dir ?? 0
  if (before === after) return p
  const delta = after - before
  const feedback = { ...p.feedback }
  if (dir === null) delete feedback[story.id]; else feedback[story.id] = dir
  const next: Profile = { ...p, feedback, sections: { ...p.sections }, sources: { ...p.sources }, topics: { ...p.topics } }
  bump(next.sections, story.section, 1.5 * delta, now)
  bump(next.sources, story.source, 1.0 * delta, now)
  for (const t of topicsOf(story)) bump(next.topics, t, 2.0 * delta, now)
  trim(next.topics, now, MAX_TOPICS)
  return next
}

/** Open the app: decide what "new since your last visit" counts from, and tidy up. */
export function startSession(p: Profile, now = Date.now()): Profile {
  const read: Record<string, number> = {}
  for (const [id, ts] of Object.entries(p.read)) if (now - ts < KEEP_READ_MS) read[id] = ts
  // A quick return continues the previous session's marker; a real gap starts a new one.
  const sessionSince = p.lastSeen === 0 ? 0 : now - p.lastSeen > SESSION_GAP_MS ? p.lastSeen : p.sessionSince || p.lastSeen
  return { ...p, read, sessionSince, lastSeen: now }
}

export function touch(p: Profile, now = Date.now()): Profile {
  return { ...p, lastSeen: now }
}

/** What the paper has noticed, for the reader to see (and trust or reset). */
export function summarise(p: Profile, now = Date.now()) {
  const top = (m: Record<string, Affinity>, n: number) =>
    Object.entries(m).map(([k, a]) => [k, decayed(a, now)] as const)
      .filter(([, w]) => w >= 1).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
  const less = Object.entries(p.topics).map(([k, a]) => [k, decayed(a, now)] as const)
    .filter(([, w]) => w <= -1.5).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([k]) => k)
  return {
    storiesRead: Object.keys(p.read).length,
    topTopics: top(p.topics, 4).filter(t => !t.startsWith('co:')),
    topSections: top(p.sections, 3),
    topSources: top(p.sources, 3),
    fewer: less.filter(t => !t.startsWith('co:')),
    votes: Object.keys(p.feedback).length,
  }
}
