import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Layers, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useAppContext } from '../contexts/AppContext'
import { usePreferences } from '../hooks/usePreferences'
import { setFeedback, useIsRead, useProfile, useVote } from '../hooks/useProfile'
import { CATEGORIES } from '../lib/categories'
import { relativeTime } from '../lib/dateFormat'
import { storyDek } from '../lib/storyText'
import { buildEdition, dedupe, readMinutes, scoreStory, topPicks, type RankedStory } from '../lib/ranking'
import { haptic } from '../lib/haptics'

type View = 'picks' | 5 | 10 | 20
const VIEWS: { id: View; label: string }[] = [
  { id: 'picks', label: 'Top picks' }, { id: 5, label: '5 min' }, { id: 10, label: '10 min' }, { id: 20, label: '20 min' },
]

const WHEN = new Intl.DateTimeFormat('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

function PickCard({ item, index }: { item: RankedStory; index?: number }) {
  const { onStoryOpen } = useAppContext()
  const { story, ranked } = item
  const read = useIsRead(story.id)
  const vote = useVote(story.id)
  const cat = CATEGORIES[story.section]
  const dek = storyDek(story)
  return (
    <li className="border-b border-rule py-4 first:pt-0 last:border-0">
      <div className="flex gap-3">
        {index !== undefined && (
          <span aria-hidden className="w-5 shrink-0 pt-0.5 font-display text-[15px] font-semibold" style={{ color: 'var(--accent)' }}>{index}</span>
        )}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => { haptic('soft'); onStoryOpen(story) }}
            className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded-sm"
            style={{ padding: 0 }}
          >
            <span className="type-kicker block" style={{ color: `var(${cat.colorVar})` }}>
              {ranked.isNew && <span className="mr-1.5 rounded-sm px-1 py-px text-[9px]" style={{ background: 'var(--accent)', color: 'var(--canvas)' }}>NEW</span>}
              {cat.label}
            </span>
            <span
              className="mt-1 block font-display font-semibold leading-[1.2] text-balance"
              style={{ fontSize: 'calc(18px * var(--reading-scale))', color: read ? 'var(--ink-3)' : 'var(--ink)' }}
            >
              {story.headline}
            </span>
            {dek && (
              <span className="mt-1 line-clamp-2 block font-reading text-ink-2" style={{ fontSize: 'calc(14px * var(--reading-scale))', lineHeight: 1.5 }}>
                {dek}
              </span>
            )}
          </button>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[10px] text-ink-3">
            <span>{story.source} · {readMinutes(story)} min · {relativeTime(story.publishedAt)}</span>
            {ranked.reasons.length > 0 && <span className="text-ink-2">▸ {ranked.reasons.join(' · ')}</span>}
          </div>
          <div className="mt-2 flex gap-2">
            {([[1, 'More like this', ThumbsUp], [-1, 'Less like this', ThumbsDown]] as const).map(([dir, label, Icon]) => {
              const on = vote === dir
              return (
                <button
                  key={dir}
                  type="button"
                  aria-pressed={on}
                  aria-label={label}
                  onClick={() => { haptic(on ? 'soft' : 'select'); setFeedback(story, on ? null : dir) }}
                  className="inline-flex items-center gap-1 rounded-full active:scale-95 transition-transform"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '3px 9px', background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--canvas)' : 'var(--ink-3)', boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--rule)' }}
                >
                  <Icon size={10} /> {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </li>
  )
}

function Block({ icon: Icon, title, note, children }: { icon: typeof Sparkles; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b-2 border-ink pb-2">
        <Icon size={14} className="translate-y-0.5 text-ink-3" />
        <h2 className="font-display text-[19px] font-semibold text-ink">{title}</h2>
        {note && <span className="w-full font-mono text-[10px] text-ink-3 sm:ml-auto sm:w-auto">{note}</span>}
      </div>
      {children}
    </section>
  )
}

/** Everything the paper has worked out for this reader, on one scrolling page. */
export function ForYouPage() {
  const { feeds, threads, loading } = useAppContext()
  const { personalise, lens } = usePreferences()
  const profile = useProfile()
  const [view, setView] = useState<View>('picks')

  // Scored live (unlike the printed paper) so what you've just read drops away.
  const items = useMemo<RankedStory[]>(() => {
    if (!feeds) return []
    const ctx = { now: Date.now(), profile, lens, since: profile.sessionSince, threads, personalise: true }
    const all = Object.values(feeds.sections).flat().map(story => ({ story, ranked: scoreStory(story, ctx) }))
    return dedupe(all).sort((a, b) => b.ranked.score - a.ranked.score)
  }, [feeds, profile, lens, threads])

  const fresh = items.filter(i => i.ranked.isNew)
  const developing = items.filter(i => i.ranked.developing > 0).slice(0, 4)
  const edition = useMemo(() => (view === 'picks' ? null : buildEdition(items, view)), [items, view])
  const picks = useMemo(() => topPicks(items, 8), [items])

  if (loading && !feeds) return <p className="px-6 py-16 text-center font-mono text-[12px] text-ink-3">Loading…</p>

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-[30px] font-bold leading-none tracking-[-0.02em] text-ink">For you</h1>
      <p className="mt-2 font-mono text-[10px] leading-relaxed text-ink-3">
        {personalise
          ? <>Ranked for {lens === 'retail' ? 'a retail & Reliance angle' : 'a balanced legal desk'}, and by what you read. What it learns stays on this device. <Link to="/settings" className="underline">Settings</Link></>
          : <>Personal ranking is off, so the paper keeps the publisher's order. This page still shows what is new. Turn it on in Settings.</>}
      </p>

      {profile.sessionSince > 0 && fresh.length > 0 && (
        <Block icon={Layers} title="Since you last read" note={`${fresh.length} new · last visit ${WHEN.format(new Date(profile.sessionSince))}`}>
          <ul>{fresh.slice(0, 5).map(it => <PickCard key={it.story.id} item={it} />)}</ul>
        </Block>
      )}

      <Block icon={Clock} title="Your edition" note={view === 'picks' ? 'best first' : edition ? `${edition.items.length} stories · ${edition.minutes} of ${view} min` : undefined}>
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="How much time do you have?">
          {VIEWS.map(v => (
            <button
              key={String(v.id)}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => { haptic('select'); setView(v.id) }}
              className="rounded-full active:scale-95 transition-transform"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 500, padding: '6px 14px', background: view === v.id ? 'var(--accent)' : 'var(--surface-2)', color: view === v.id ? 'var(--canvas)' : 'var(--ink-2)' }}
            >
              {v.id === 'picks' ? 'Top picks' : `I have ${v.label}`}
            </button>
          ))}
        </div>
        <ol>
          {(view === 'picks' ? picks : edition?.items ?? []).map((it, i) => <PickCard key={it.story.id} item={it} index={i + 1} />)}
        </ol>
        {view !== 'picks' && edition && edition.items.length === 0 && (
          <p className="font-mono text-[11px] text-ink-3">Nothing fits that window yet.</p>
        )}
      </Block>

      {developing.length > 0 && (
        <Block icon={Sparkles} title="Developing stories" note="running over several days">
          <ul>{developing.map(it => <PickCard key={it.story.id} item={it} />)}</ul>
        </Block>
      )}
    </div>
  )
}
