import type { CategoryKey, Story, ThreadsMap } from './types'
import { decayed, type Profile } from './profile'
import { topicsOf, topicLabel } from './topics'

// How the paper decides what to put first. Several signals add up; none is allowed to
// dominate, and the two biggest reasons are kept so the reader can see *why* a story
// is where it is. No AI, no network, no tokens.

export type Lens = 'retail' | 'balanced'

const RETAIL_LENS: Record<string, number> = {
  'Reliance & Jio': 3, 'Retail & e-commerce': 2.4, 'Consumer protection': 2, 'FMCG & food safety': 1.8,
  'Data protection': 1.6, 'FDI & foreign exchange': 1.5, 'Competition (CCI)': 1.4, 'Supreme Court': 1.4,
  'Tax & GST': 1.1, 'Securities (SEBI)': 1.0, 'Companies Act & M&A': 0.9, 'Labour & employment': 0.8,
  'Intellectual property': 0.8, 'Telecom & tech regulation': 0.8, 'Constitutional law': 0.6, 'Real estate': 0.5,
  'Insolvency': 0.7, 'Banking & payments (RBI)': 0.8, 'High Courts': 0.5, 'Arbitration': 0.6, 'Criminal law': 0.2,
}
const BALANCED_LENS: Record<string, number> = {
  'Supreme Court': 1.4, 'High Courts': 0.8, 'Securities (SEBI)': 1.1, 'Banking & payments (RBI)': 1.1,
  'Competition (CCI)': 1.1, 'Data protection': 1.1, 'Tax & GST': 1.1, 'Insolvency': 1.0, 'Companies Act & M&A': 1.0,
  'FDI & foreign exchange': 1.0, 'Constitutional law': 0.9, 'Arbitration': 0.8, 'Consumer protection': 0.9,
  'Intellectual property': 0.8, 'Labour & employment': 0.8, 'Reliance & Jio': 0.8, 'Retail & e-commerce': 0.6,
  'Telecom & tech regulation': 0.7, 'Real estate': 0.5, 'FMCG & food safety': 0.4, 'Criminal law': 0.4,
}
const SECTION_BASE: Record<Lens, Record<CategoryKey, number>> = {
  retail:   { legal: 1.0, reliance: 1.0, retail: 0.8, business: 0.4, tech: 0.2, world: -0.2, sports: -0.6, opinion: 0 },
  balanced: { legal: 1.0, business: 0.6, reliance: 0.4, retail: 0.4, tech: 0.3, world: 0, sports: -0.4, opinion: 0 },
}

export interface Ranked {
  score: number
  /** At most two short reasons, strongest first. */
  reasons: string[]
  isNew: boolean
  developing: number
}

export interface RankContext {
  now: number
  profile: Profile
  lens: Lens
  /** Stories published after this are "new since your last visit"; 0 = no earlier visit. */
  since: number
  threads: ThreadsMap
  /** Off: the paper keeps the publisher's order and gives no reasons. */
  personalise: boolean
}

const slog = (x: number) => Math.sign(x) * Math.log1p(Math.abs(x))

export function scoreStory(story: Story, ctx: RankContext): Ranked {
  const developing = ctx.threads[story.id]?.length ?? 0
  const published = Date.parse(story.publishedAt || '')
  const isNew = ctx.since > 0 && Number.isFinite(published) && published > ctx.since
  if (!ctx.personalise) return { score: 0, reasons: [], isNew, developing }

  const parts: { points: number; label: string }[] = []
  const add = (points: number, label: string) => { if (points) parts.push({ points, label }) }

  // 1. The reader's angle (Retail/Reliance emphasis, or a balanced legal desk).
  const lens = ctx.lens === 'retail' ? RETAIL_LENS : BALANCED_LENS
  const topics = topicsOf(story)
  const lensTopics = topics.filter(t => lens[t]).sort((a, b) => lens[b] - lens[a])
  lensTopics.slice(0, 2).forEach((t, i) => add(lens[t] * (i === 0 ? 1 : 0.4), t))
  add(SECTION_BASE[ctx.lens][story.section] ?? 0, '')

  // 2. How serious it is.
  if (story.priority === 'high') add(0.8, 'Top story')
  else if (story.priority === 'medium') add(0.3, '')
  if ((story.facts ?? []).some(f => f.label === 'Timeline')) add(0.5, 'Has a deadline')

  // 3. Freshness.
  const hours = Number.isFinite(published) ? Math.max(0, (ctx.now - published) / 3.6e6) : 48
  const fresh = 2.5 * Math.pow(0.5, hours / 18)
  add(fresh, hours < 4 ? 'Just in' : '')

  // 4. What this reader does: sections, sources and topics they read (or wave away).
  const p = ctx.profile
  const sectionAff = decayed(p.sections[story.section], ctx.now)
  add(0.5 * slog(sectionAff), sectionAff >= 2 ? `You often read ${story.section === 'reliance' ? 'Reliance / Jio' : story.section}` : '')
  add(0.3 * slog(decayed(p.sources[story.source], ctx.now)), '')
  const topicAff = topics.map(t => [t, decayed(p.topics[t], ctx.now)] as const)
  topicAff.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  topicAff.slice(0, 3).forEach(([t, w]) => add(0.7 * slog(w), w >= 2 && !t.startsWith('co:') ? `You read a lot on ${topicLabel(t)}` : ''))

  // 5. Direct votes, reading history, running stories.
  const vote = p.feedback[story.id]
  if (vote === 1) add(4, 'You asked for more like this')
  if (vote === -1) add(-4, '')
  if (p.read[story.id]) add(-3, '')
  if (isNew) add(1.2, 'New since your last visit')
  if (developing) add(0.6, developing === 1 ? 'Developing: 1 earlier report' : `Developing: ${developing} earlier reports`)

  const score = parts.reduce((s, x) => s + x.points, 0)
  const reasons = parts.filter(x => x.label && x.points >= 0.5).sort((a, b) => b.points - a.points)
    .map(x => x.label).filter((l, i, arr) => arr.indexOf(l) === i).slice(0, 2)
  return { score, reasons, isNew, developing }
}

export interface RankedStory { story: Story; ranked: Ranked }

/** Each section's stories, best first (stable: ties keep the publisher's order). */
export function rankSections(sections: Record<CategoryKey, Story[]>, ctx: RankContext) {
  const byId = new Map<string, Ranked>()
  const out = {} as Record<CategoryKey, Story[]>
  for (const key of Object.keys(sections) as CategoryKey[]) {
    const scored = (sections[key] ?? []).map((story, i) => {
      const ranked = scoreStory(story, ctx)
      byId.set(story.id, ranked)
      return { story, ranked, i }
    })
    if (ctx.personalise) scored.sort((a, b) => b.ranked.score - a.ranked.score || a.i - b.i)
    out[key] = scored.map(x => x.story)
  }
  return { sections: out, byId }
}

/** Dual-tagged stories (business and Reliance) appear once, in their best-scoring place. */
export function dedupe(items: RankedStory[]): RankedStory[] {
  const best = new Map<string, RankedStory>()
  for (const it of items) {
    const key = it.story.sourceUrl || it.story.headline.toLowerCase()
    const cur = best.get(key)
    if (!cur || it.ranked.score > cur.ranked.score) best.set(key, it)
  }
  const keep = new Set(best.values())
  return items.filter(it => keep.has(it))
}

/** Minutes to take in a story as the paper presents it: summary, note and a beat to decide. */
export function readMinutes(story: Story): number {
  const words = story.wordCount || ((story.summary || '') + ' ' + (story.contextNote || '')).split(/\s+/).filter(Boolean).length
  return Math.max(0.6, Math.round((words / 190 + 0.35) * 10) / 10)
}

/**
 * Pick from best-first, but let each pick make the next ones from the same section or
 * the same subject slightly less attractive. Otherwise one big story (a listing, a
 * ruling covered by eight outlets) fills the whole list. Stories still keep their own
 * entry; this only spreads the choice.
 */
function diversified(sorted: RankedStory[], accept: (it: RankedStory, picked: RankedStory[]) => boolean, limit: number) {
  const pool = [...sorted]
  const picked: RankedStory[] = []
  const sectionCount: Record<string, number> = {}
  const topicCount: Record<string, number> = {}
  const mainTopic = (s: Story) => topicsOf(s).find(t => !t.startsWith('co:')) ?? ''
  while (pool.length && picked.length < limit) {
    let bestI = -1, bestV = -Infinity
    pool.forEach((it, i) => {
      if (!accept(it, picked)) return
      const v = it.ranked.score - 0.8 * (sectionCount[it.story.section] ?? 0) - 0.6 * (topicCount[mainTopic(it.story)] ?? 0)
      if (v > bestV) { bestV = v; bestI = i }
    })
    if (bestI < 0) break
    const [it] = pool.splice(bestI, 1)
    picked.push(it)
    sectionCount[it.story.section] = (sectionCount[it.story.section] ?? 0) + 1
    const t = mainTopic(it.story)
    if (t) topicCount[t] = (topicCount[t] ?? 0) + 1
  }
  return picked
}

/** The few best stories for the top of "For you". */
export function topPicks(items: RankedStory[], n: number): RankedStory[] {
  return diversified(dedupe(items).sort((a, b) => b.ranked.score - a.ranked.score), () => true, n)
}

/** An edition that fits the time you have: best stories first, no section taking over. */
export function buildEdition(items: RankedStory[], minutes: number) {
  const sorted = dedupe(items).sort((a, b) => b.ranked.score - a.ranked.score)
  const cap = Math.max(2, Math.ceil(minutes / 3))
  const spent = (got: RankedStory[]) => got.reduce((s, g) => s + readMinutes(g.story), 0)
  const picked = diversified(sorted, (it, got) =>
    spent(got) + readMinutes(it.story) <= minutes && got.filter(g => g.story.section === it.story.section).length < cap, 40)
  return { items: picked, minutes: Math.round(spent(picked) * 10) / 10 }
}
