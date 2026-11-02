import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyProfile, recordOpen, recordEngaged, recordFeedback, startSession, touch, summarise, decayed, HALF_LIFE_MS, SESSION_GAP_MS } from '../src/lib/profile'
import { scoreStory, rankSections, buildEdition, dedupe, readMinutes, topPicks, type RankContext } from '../src/lib/ranking'
import { topicsOf } from '../src/lib/topics'
import type { Story, CategoryKey } from '../src/lib/types'

const NOW = Date.parse('2026-11-02T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3.6e6).toISOString()

let n = 0
function story(over: Partial<Story> & { headline: string }): Story {
  n++
  return {
    id: over.id ?? `s${n}`, section: 'business', hook: '', summary: '', source: 'Src', sourceUrl: `https://e.com/${n}`,
    dateLabel: '', publishedAt: hoursAgo(5), wordCount: 150, tags: [], priority: 'medium', ...over,
  } as Story
}
const ctx = (over: Partial<RankContext> = {}): RankContext => ({
  now: NOW, profile: emptyProfile(NOW), lens: 'retail', since: 0, threads: {}, personalise: true, ...over,
})

test('topics: recognises the regimes and ignores noise', () => {
  const t = topicsOf(story({ headline: 'SEBI tightens insider trading norms for Reliance Industries promoters', section: 'business' }))
  assert.ok(t.includes('Securities (SEBI)') && t.includes('Reliance & Jio'))
  assert.deepEqual(topicsOf(story({ headline: 'Team wins third Test by five wickets', section: 'sports' })), [])
  // the word, not the company
  assert.ok(!topicsOf(story({ headline: 'Better forecasts save lives', summary: 'India’s reliance on old models is a risk', section: 'opinion' })).includes('Reliance & Jio'))
  assert.ok(topicsOf(story({ headline: 'Reliance Retail opens stores', section: 'retail' })).includes('Reliance & Jio'))
  assert.ok(topicsOf(story({ headline: 'Jio Platforms lists', section: 'business' })).includes('Reliance & Jio'))
})

test('lens: with the Retail/Reliance emphasis a Reliance story outranks an equal generic one', () => {
  const rel = scoreStory(story({ headline: 'Reliance Retail opens 200 stores', section: 'business' }), ctx())
  const gen = scoreStory(story({ headline: 'Municipal bond issue opens next week', section: 'business' }), ctx())
  assert.ok(rel.score > gen.score + 1.5, `${rel.score} vs ${gen.score}`)
  assert.ok(rel.reasons.includes('Reliance & Jio') || rel.reasons.includes('Retail & e-commerce'))
})

test('lens: balanced does not favour Reliance over a Supreme Court ruling', () => {
  const rel = scoreStory(story({ headline: 'Reliance Retail opens 200 stores', section: 'business' }), ctx({ lens: 'balanced' }))
  const sc = scoreStory(story({ headline: 'Supreme Court rules on insolvency set-off', section: 'legal' }), ctx({ lens: 'balanced' }))
  assert.ok(sc.score > rel.score)
})

test('freshness: newer beats older, all else equal', () => {
  const a = scoreStory(story({ headline: 'Municipal bond issue opens', publishedAt: hoursAgo(1) }), ctx())
  const b = scoreStory(story({ headline: 'Municipal bond issue opens', publishedAt: hoursAgo(48) }), ctx())
  assert.ok(a.score > b.score + 1.5)
  assert.ok(a.reasons.includes('Just in'))
})

test('learning: opening stories on a topic lifts that topic; waving it away lowers it', () => {
  let p = emptyProfile(NOW)
  for (let i = 0; i < 4; i++) p = recordOpen(p, story({ headline: `Data protection board issues DPDP notice ${i}`, section: 'tech' }), NOW)
  const dpdp = story({ headline: 'DPDP rules: consent managers explained', section: 'tech' })
  const base = scoreStory(dpdp, ctx()).score
  const learned = scoreStory(dpdp, ctx({ profile: p }))
  assert.ok(learned.score > base + 0.8, `${learned.score} vs ${base}`)
  assert.ok(learned.reasons.some(r => r.includes('Data protection')))

  const disliked = story({ headline: 'Cricket board announces tour schedule', section: 'sports' })
  let q = emptyProfile(NOW)
  for (let i = 0; i < 3; i++) q = recordFeedback(q, story({ headline: `Cricket board news ${i}`, section: 'sports', source: 'Cric' }), -1, NOW)
  assert.ok(scoreStory(disliked, ctx({ profile: q })).score < scoreStory(disliked, ctx()).score - 0.8)
})

test('feedback: a vote replaces the earlier one and can be taken back', () => {
  const s = story({ headline: 'Competition Commission opens probe into marketplace', section: 'legal' })
  let p = recordFeedback(emptyProfile(NOW), s, 1, NOW)
  const up = decayed(p.sections.legal, NOW)
  p = recordFeedback(p, s, -1, NOW)
  assert.ok(decayed(p.sections.legal, NOW) < up - 2)         // swing of two votes
  p = recordFeedback(p, s, null, NOW)
  assert.ok(Math.abs(decayed(p.sections.legal, NOW)) < 1e-9)  // back to nothing
  assert.equal(p.feedback[s.id], undefined)
  assert.equal(recordFeedback(p, s, null, NOW), p)           // no-op returns the same object
})

test('read stories drop below unread ones, and "more like this" lifts the exact story', () => {
  const a = story({ headline: 'Municipal bond issue opens' }), b = story({ headline: 'Municipal bond issue opens too' })
  const p = recordOpen(emptyProfile(NOW), a, NOW)
  assert.ok(scoreStory(a, ctx({ profile: p })).score < scoreStory(b, ctx({ profile: p })).score - 2)
  const liked = recordFeedback(emptyProfile(NOW), b, 1, NOW)
  assert.ok(scoreStory(b, ctx({ profile: liked })).score > scoreStory(b, ctx()).score + 3)
})

test('engagement counts for more than a bare open, and only past the threshold', () => {
  const s = story({ headline: 'GST council changes e-commerce TCS rules', section: 'business' })
  const opened = recordOpen(emptyProfile(NOW), s, NOW)
  assert.equal(recordEngaged(opened, s, 5, NOW), opened)
  const engaged = recordEngaged(opened, s, 40, NOW)
  assert.ok(decayed(engaged.sections.business, NOW) > decayed(opened.sections.business, NOW))
})

test('habits fade: a three-week-old vote is worth half', () => {
  let p = recordFeedback(emptyProfile(NOW - HALF_LIFE_MS), story({ headline: 'SEBI circular on mutual funds' }), 1, NOW - HALF_LIFE_MS)
  const then = decayed(p.topics['Securities (SEBI)'], NOW - HALF_LIFE_MS)
  assert.ok(Math.abs(decayed(p.topics['Securities (SEBI)'], NOW) - then / 2) < 1e-6)
})

test('new since last visit: only after an earlier visit; a quick return keeps the marker', () => {
  const first = startSession(emptyProfile(NOW - 5 * 24 * 3.6e6), NOW - 5 * 24 * 3.6e6)
  assert.equal(first.sessionSince, 0)                                   // first ever visit: nothing is "new"
  const day2 = startSession(touch(first, NOW - 2 * 24 * 3.6e6), NOW)
  assert.equal(day2.sessionSince, NOW - 2 * 24 * 3.6e6)                 // counts from the last activity
  const quick = startSession(touch(day2, NOW + 5 * 60e3), NOW + 10 * 60e3)
  assert.equal(quick.sessionSince, day2.sessionSince)                   // reopened within 30 minutes: same marker
  assert.ok(NOW + SESSION_GAP_MS > NOW)
  const s = story({ headline: 'Fresh item', publishedAt: hoursAgo(2) })
  assert.equal(scoreStory(s, ctx({ since: NOW - 6 * 3.6e6 })).isNew, true)
  assert.equal(scoreStory(s, ctx({ since: 0 })).isNew, false)
})

test('developing stories get a nudge and say how many earlier reports', () => {
  const s = story({ headline: 'Jio Platforms shares to list tomorrow', id: 'dev1' })
  const r = scoreStory(s, ctx({ threads: { dev1: [{ id: 'x', headline: 'h', source: 's', section: 'business', sourceUrl: '', date: '2026-10-19' }] } }))
  assert.equal(r.developing, 1)
})

test('personalise off: publisher order, no reasons, but new-flags still work', () => {
  const sections = { legal: [story({ headline: 'B', section: 'legal' }), story({ headline: 'Reliance A', section: 'legal' })] } as unknown as Record<CategoryKey, Story[]>
  const off = rankSections(sections, ctx({ personalise: false }))
  assert.deepEqual(off.sections.legal.map(s => s.headline), ['B', 'Reliance A'])
  assert.deepEqual(off.byId.get(sections.legal[0].id)?.reasons, [])
  const on = rankSections(sections, ctx())
  assert.equal(on.sections.legal[0].headline, 'Reliance A')
})

test('edition fits the minutes, no section takes over, duplicates collapse', () => {
  const mk = (h: string, section: CategoryKey, url?: string) => { const s = story({ headline: h, section, sourceUrl: url ?? `https://e.com/${h}` }); return { story: s, ranked: scoreStory(s, ctx()) } }
  const items = [
    mk('Reliance Jio listing', 'business', 'https://e.com/jio'), mk('Reliance Jio listing', 'reliance', 'https://e.com/jio'),
    ...Array.from({ length: 12 }, (_, i) => mk(`Supreme Court ruling ${i}`, 'legal')),
    ...Array.from({ length: 6 }, (_, i) => mk(`Retail FMCG story ${i}`, 'retail')),
  ]
  assert.equal(dedupe(items).length, items.length - 1)
  const e5 = buildEdition(items, 5)
  assert.ok(e5.minutes <= 5 && e5.items.length >= 3, JSON.stringify(e5.minutes))
  assert.ok(e5.items.filter(i => i.story.section === 'legal').length <= 2)
  const e20 = buildEdition(items, 20)
  assert.ok(e20.items.length > e5.items.length && e20.minutes <= 20)
  assert.equal(new Set(e20.items.map(i => i.story.sourceUrl)).size, e20.items.length)
  assert.ok(readMinutes(items[0].story) >= 0.6)
})

test('summary: says what it learned, in words', () => {
  let p = emptyProfile(NOW)
  for (let i = 0; i < 3; i++) p = recordOpen(p, story({ headline: `SEBI circular ${i}`, section: 'business', source: 'ET' }), NOW)
  const s = summarise(p, NOW)
  assert.equal(s.storiesRead, 3)
  assert.ok(s.topTopics.includes('Securities (SEBI)'))
})

test('top picks spread across sections instead of one story taking the page', () => {
  const mk = (h: string, section: CategoryKey) => { const s = story({ headline: h, section }); return { story: s, ranked: scoreStory(s, ctx()) } }
  const items = [
    ...Array.from({ length: 6 }, (_, i) => mk(`Reliance Jio listing angle ${i}`, 'reliance')),
    mk('Supreme Court rules on a consumer protection appeal', 'legal'),
    mk('CCI opens probe into marketplace discounts', 'legal'),
    mk('RBI changes digital lending norms', 'business'),
    mk('DPDP rules notified for consent managers', 'tech'),
  ]
  const picks = topPicks(items, 6)
  assert.equal(picks.length, 6)
  assert.ok(picks.filter(p => p.story.section === 'reliance').length <= 3, picks.map(p => p.story.section).join())
  assert.ok(new Set(picks.map(p => p.story.section)).size >= 3)
  assert.equal(new Set(picks.map(p => p.story.id)).size, picks.length)
})
