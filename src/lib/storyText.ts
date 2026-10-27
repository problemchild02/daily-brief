import { isGenericWhyItMatters } from '../components/cards/genericFallbacks'
import type { Story } from './types'

/**
 * The story's summary paragraph, or null when there's nothing worth showing —
 * same rule as Card.tsx: use the AI summary, fall back to the RSS hook, and drop
 * it when the hook is just the headline repeated (common for Google News items).
 */
export function storyDek(story: Story): string | null {
  const summary = story.summary?.trim()
  if (summary) return summary
  const hook = story.hook?.trim() ?? ''
  if (!hook || hook.toLowerCase().startsWith(story.headline.trim().toLowerCase())) return null
  return hook
}

/**
 * Split a brief into its intro and the "(1) … (2) … (3) …" implications the
 * enrichment prompt asks for. A marker only counts when it's preceded by
 * whitespace (or starts the text) and the numbers run 1, 2, 3… in order — so
 * statute references like "§3(1)" or "Section 2(1)(b)" stay part of the prose.
 */
export function splitImplications(text: string): { intro: string; items: string[] } {
  const marker = /(?:^|\s)\(([1-9])\)\s+/g
  const cuts: { start: number; end: number }[] = []
  let expected = 1
  for (let m = marker.exec(text); m; m = marker.exec(text)) {
    if (Number(m[1]) !== expected) continue
    cuts.push({ start: m.index, end: m.index + m[0].length })
    expected++
  }
  if (cuts.length < 2) return { intro: text.trim(), items: [] }
  const items = cuts.map((c, i) => text.slice(c.end, cuts[i + 1]?.start ?? text.length).trim())
  return { intro: text.slice(0, cuts[0].start).trim(), items: items.filter(Boolean) }
}

/** The practitioner "Why it matters" brief, or null if missing or generic boilerplate. */
export function storyBrief(story: Story): string | null {
  const raw = story.whyItMatters ?? story.contextNote
  if (!raw || isGenericWhyItMatters(raw)) return null
  return raw
}
