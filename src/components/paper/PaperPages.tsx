import { createContext, useContext, useRef, type CSSProperties, type ReactNode, type PointerEvent, type KeyboardEvent } from 'react'
import { CATEGORIES } from '../../lib/categories'
import { readingTime } from '../../lib/readingTime'
import { relativeTime } from '../../lib/dateFormat'
import { storyDek, storyBrief, splitImplications } from '../../lib/storyText'
import { MarketsTicker } from '../strips/MarketsTicker'
import { WeatherStrip } from '../strips/WeatherStrip'
import { StoryArt, StoryArtFallback } from './StoryArt'
import type { BriefingJson, CategoryKey, MetaJson, Story } from '../../lib/types'

const IST_DATE = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
})

/**
 * True inside PaperEdition's off-screen measuring copy. Images there render as
 * plain boxes of the same size, so a slow or failed image can't change a
 * measured height (and the copy doesn't download anything).
 */
export const MeasuringContext = createContext(false)

// A tap target that still lets the page curl. It deliberately isn't a <button>:
// FlipBook stops touches that start on buttons/links from reaching the curl, which
// would make the story list — most of a phone page — impossible to swipe. A click
// only counts if the pointer barely moved, so dragging a page corner across a
// story on a laptop turns the page instead of also opening the story.
function Tappable({ onActivate, label, className, measure, measureId, children }: {
  onActivate: () => void
  label?: string
  className?: string
  /** Marks the element for PaperEdition's measuring pass. */
  measure?: string
  measureId?: string
  children: ReactNode
}) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={label}
      data-m={measure}
      data-id={measureId}
      className={['cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md', className].filter(Boolean).join(' ')}
      onPointerDown={(e: PointerEvent) => { start.current = { x: e.clientX, y: e.clientY } }}
      onClick={e => {
        const s = start.current
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) return
        onActivate()
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate() }
      }}
    >
      {children}
    </div>
  )
}

function PaperImage({ story, className, style, variant }: {
  story: Story
  className: string
  style?: CSSProperties
  variant?: 'hero' | 'thumb'
}) {
  const measuring = useContext(MeasuringContext)
  // Every story gets a picture: its photo, or section artwork when it has none.
  // The measuring copy always renders the artwork, a box of the same size, so a
  // slow image can't change a measured height.
  if (measuring) return <StoryArtFallback story={story} className={className} style={style} variant={variant} />
  return <StoryArt story={story} className={className} style={style} variant={variant} />
}

function Kicker({ section, kicker }: { section: CategoryKey; kicker?: string }) {
  const cat = CATEGORIES[section]
  return (
    <p className="type-kicker" style={{ color: `var(${cat.colorVar})` }}>
      {cat.label}{kicker && <span className="opacity-70"> · {kicker}</span>}
    </p>
  )
}

function Meta({ story }: { story: Story }) {
  const mins = readingTime(story.wordCount ?? 0)
  return (
    <p className="font-mono text-[11px] text-ink-3">
      {story.source}
      {mins > 0 && <> · {mins} min</>}
      {story.publishedAt && <> · <time dateTime={story.publishedAt}>{relativeTime(story.publishedAt)}</time></>}
    </p>
  )
}

/** Every page sits inside this: scrollable body + newspaper folio at the foot. */
export function PageShell({ folio, children }: { folio: ReactNode; children: ReactNode }) {
  return (
    <div className="paper-page__inner flex flex-col">
      {/* A size container, so content can respond to the page's width rather
          than the screen's: one side of a laptop spread is phone-narrow. */}
      <div className="@container flex-1 px-5 pt-5 sm:px-7 sm:pt-7">{children}</div>
      <footer className="ink mt-4 flex items-center justify-between border-t border-rule px-5 py-2.5 sm:px-7 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
        {folio}
      </footer>
    </div>
  )
}

export function Folio({ page, section }: { page: number; section: string }) {
  return (
    <>
      <span>The Daily Brief</span>
      <span>{section}</span>
      <span>{page}</span>
    </>
  )
}

// ─── Front page: nameplate, ticker, Today's Brief ────────────────────────────

export function FrontPageContent({ meta, briefing, onBulletOpen, bulletLimit, continuedOn }: {
  meta: MetaJson | null
  briefing: BriefingJson | null
  onBulletOpen: (url: string) => void
  /** How many of the brief's bullets fit on this page (measured by PaperEdition);
      the rest run onto a "continued" page. Omitted = all of them. */
  bulletLimit?: number
  /** Page number the remaining bullets continue on. */
  continuedOn?: number
}) {
  const bullets = briefing?.bullets ?? []
  return (
    <div className="flex flex-col gap-4">
      <header className="ink border-b-2 border-ink pb-3 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
          {meta?.editionNumber ? `Vol. 1 · Edition ${meta.editionNumber}` : 'Your morning paper'}
        </p>
        <h1
          className="mt-2 font-display font-bold leading-none tracking-[-0.025em] text-ink whitespace-nowrap"
          style={{ fontSize: 'clamp(1.9rem, 7.5vw, 3.6rem)' }}
        >
          The Daily Brief
        </h1>
        <p className="mt-2 font-reading italic text-ink-2" style={{ fontSize: 'calc(13px * var(--reading-scale))' }}>
          {IST_DATE.format(new Date())}
        </p>
      </header>

      <div className="ink flex flex-col gap-2 border-b border-rule pb-3">
        <WeatherStrip className="!gap-3 justify-center" />
        {/* Quotes as a tidy grid (four across only on a wide page): the ticker's own "·" separators and wide gaps
            make it wrap one quote per line on a phone-width page. */}
        <MarketsTicker className="!grid grid-cols-2 @2xl:grid-cols-4 !gap-x-4 !gap-y-1 [&>span>span.select-none]:hidden" />
      </div>

      <section className="ink">
        <p className="type-kicker mb-2" style={{ color: 'var(--accent)' }}>Today's Brief</p>
        {briefing?.summary && (
          <p className="reading-body text-ink-2 mb-4" style={{ fontSize: 'calc(15.5px * var(--reading-scale))' }}>
            {briefing.summary}
          </p>
        )}
        <BriefBullets bullets={bullets.slice(0, bulletLimit)} start={0} onOpen={onBulletOpen} />
        {continuedOn !== undefined && (
          <p className="mt-3 text-right font-reading italic text-ink-3" style={{ fontSize: 'calc(13px * var(--reading-scale))' }}>
            Continued on page {continuedOn} →
          </p>
        )}
        {!briefing && <p className="reading-body text-ink-3">Today's brief is being prepared.</p>}
      </section>
    </div>
  )
}

function BriefBullets({ bullets, start, onOpen }: {
  bullets: BriefingJson['bullets']
  start: number
  onOpen: (url: string) => void
}) {
  return (
    <ol className="flex flex-col gap-3">
      {bullets.map((b, i) => {
        const cat = CATEGORIES[b.category as CategoryKey]
        return (
          <li key={start + i} data-bullet>
            <Tappable onActivate={() => onOpen(b.url)} className="flex gap-3 -mx-1 px-1 py-0.5 hover:bg-surface-2/60 transition-colors">
              <span className="font-display font-semibold text-accent leading-tight" style={{ fontSize: 'calc(20px * var(--reading-scale))' }}>
                {start + i + 1}
              </span>
              <span>
                {cat && (
                  <span className="block type-kicker mb-0.5" style={{ color: `var(${cat.colorVar})`, fontSize: '10px' }}>
                    {cat.label}
                  </span>
                )}
                <span className="font-reading text-ink leading-snug" style={{ fontSize: 'calc(15.5px * var(--reading-scale))' }}>
                  {b.text}
                </span>
              </span>
            </Tappable>
          </li>
        )
      })}
    </ol>
  )
}

/** The rest of Today's Brief, when it doesn't all fit under the nameplate. */
export function BriefContinuedContent({ briefing, from, to, onBulletOpen }: {
  briefing: BriefingJson | null
  from: number
  to?: number
  onBulletOpen: (url: string) => void
}) {
  return (
    <section className="ink">
      <p className="type-kicker mb-3 border-b-2 border-ink pb-2" style={{ color: 'var(--accent)' }}>
        Today's Brief <span className="text-ink-3 normal-case tracking-normal font-normal">· continued</span>
      </p>
      <BriefBullets bullets={(briefing?.bullets ?? []).slice(from, to)} start={from} onOpen={onBulletOpen} />
    </section>
  )
}

// ─── Contents: "Inside today's paper" ────────────────────────────────────────

export interface ContentsEntry {
  section: CategoryKey
  page: number
  count: number
  lead?: Story
}

export function ContentsContent({ entries, onGoTo, compact = false, tight = false }: {
  entries: ContentsEntry[]
  onGoTo: (page: number) => void
  /** Two-column, no lead headlines — for when contents shares the front page. */
  compact?: boolean
  /** Lead headlines on one line each, for a page a little too short for two. */
  tight?: boolean
}) {
  if (compact) {
    return (
      <section className="ink">
        <p className="type-kicker mb-2 border-b-2 border-ink pb-2 text-ink-3">Inside today's paper</p>
        <ol className="grid grid-cols-1 @md:grid-cols-2 gap-x-6">
          {entries.map(entry => {
            const cat = CATEGORIES[entry.section]
            return (
              <li key={entry.section} className="border-b border-rule">
                <Tappable
                  onActivate={() => onGoTo(entry.page - 1)}
                  label={`${cat.label}, page ${entry.page}`}
                  className="flex items-center gap-2.5 py-2.5 hover:bg-surface-2/60 transition-colors"
                >
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(${cat.colorVar})` }} />
                  <span className="min-w-0 flex-1 truncate font-display font-semibold text-ink" style={{ fontSize: 'calc(16px * var(--reading-scale))' }}>
                    {cat.label}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">p.{entry.page}</span>
                </Tappable>
              </li>
            )
          })}
        </ol>
      </section>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <header className="ink border-b-2 border-ink pb-3">
        <p className="type-kicker text-ink-3">Inside today's paper</p>
        <h2 className="mt-1 font-display font-semibold text-ink" style={{ fontSize: 'calc(26px * var(--reading-scale))' }}>
          Contents
        </h2>
      </header>
      <ol className="flex flex-col divide-y divide-rule">
        {entries.map(entry => {
          const cat = CATEGORIES[entry.section]
          return (
            <li key={entry.section} className="ink">
              <Tappable
                onActivate={() => onGoTo(entry.page - 1)}
                label={`${cat.label}, page ${entry.page}`}
                className={`flex items-baseline gap-3 ${tight ? 'py-2' : 'py-3'} hover:bg-surface-2/60 transition-colors`}
              >
                <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: `var(${cat.colorVar})` }} />
                <span className="min-w-0 flex-1">
                  <span className="block font-display font-semibold text-ink" style={{ fontSize: 'calc(17px * var(--reading-scale))' }}>
                    {cat.label}
                    <span className="ml-2 font-mono text-[10px] font-normal text-ink-3">{entry.count} stories</span>
                  </span>
                  {entry.lead && (
                    <span className={`mt-0.5 block font-reading text-ink-2 leading-snug ${tight ? 'line-clamp-1' : 'line-clamp-2'}`} style={{ fontSize: 'calc(13.5px * var(--reading-scale))' }}>
                      {entry.lead.headline}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-[12px] text-ink-3 tabular-nums">p.{entry.page}</span>
              </Tappable>
            </li>
          )
        })}
      </ol>
      {!tight && (
        <p className="ink font-mono text-[10px] text-ink-3">
          Swipe or drag a corner to turn pages · tap a story to read it
        </p>
      )}
    </div>
  )
}

// ─── Section pages ──────────────────────────────────────────────────────────

export type LeadFit = 'full' | 'compact' | 'text' | 'minimal'

export function SectionContent({ section, stories, lead, leadFit = 'full', continued, totalInSection, onOpen }: {
  section: CategoryKey
  stories: Story[]
  lead?: Story
  /** How much of the lead a short page has room for: a shorter photo and
      summary, no photo, or (small phone at a large text size) a one-line
      summary and no "why it matters" teaser — still the headline and a summary. */
  leadFit?: LeadFit
  continued: boolean
  totalInSection: number
  onOpen: (story: Story) => void
}) {
  const cat = CATEGORIES[section]
  return (
    <div className="flex flex-col">
      {continued ? (
        <p data-m="cont" className="ink mb-3 border-b border-rule pb-2 type-kicker" style={{ color: `var(${cat.colorVar})` }}>
          {cat.label} <span className="text-ink-3 normal-case tracking-normal font-normal">· continued</span>
        </p>
      ) : (
        <header data-m="head" className="ink mb-4 pb-3" style={{ borderBottom: `3px solid var(${cat.colorVar})` }}>
          <h2 className="font-display font-bold text-ink leading-none tracking-[-0.02em]" style={{ fontSize: 'calc(30px * var(--reading-scale))' }}>
            {cat.label}
          </h2>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
            {totalInSection} {totalInSection === 1 ? 'story' : 'stories'}
          </p>
        </header>
      )}

      {lead && <LeadStory story={lead} fit={leadFit} onOpen={onOpen} />}

      <div data-m="list" className="flex flex-col divide-y divide-rule">
        {stories.map(s => <StoryEntry key={s.id} story={s} onOpen={onOpen} />)}
      </div>
    </div>
  )
}

function LeadStory({ story, fit, onOpen }: { story: Story; fit: LeadFit; onOpen: (s: Story) => void }) {
  const dek = storyDek(story)
  const brief = storyBrief(story)
  // The first numbered implication is the single most useful line of the brief,
  // so the section front teases it right under the lead.
  const firstImplication = brief ? splitImplications(brief).items[0] : undefined
  return (
    <Tappable onActivate={() => onOpen(story)} label={story.headline} measure={`lead-${fit}`} measureId={story.id} className="ink mb-2 block pb-4 border-b border-rule">
      {/* Capped on short pages (a laptop with a small window, iPad landscape)
          so the photo can't crowd the headline and "Why it matters" off the
          section front. */}
      {fit !== 'text' && fit !== 'minimal' && <PaperImage
        story={story}
        className="mb-3 w-full aspect-[16/9] rounded-sm"
        style={{ maxHeight: `calc(var(--paper-page-h, 100vh) * ${fit === 'full' ? 0.36 : 0.22})` }}
      />}
      <h3 className="font-display font-bold text-ink leading-[1.12] tracking-[-0.015em]" style={{ fontSize: 'calc(23px * var(--reading-scale))' }}>
        {story.headline}
      </h3>
      {dek && (
        <p className={`mt-2 font-reading text-ink-2 ${fit === 'full' ? 'line-clamp-4' : fit === 'minimal' ? 'line-clamp-1' : 'line-clamp-2'}`} style={{ fontSize: 'calc(15px * var(--reading-scale))', lineHeight: 1.6 }}>
          {dek}
        </p>
      )}
      {firstImplication && fit !== 'minimal' && (
        <p className="mt-3 border-l-2 pl-3 font-reading text-ink line-clamp-3" style={{ borderColor: 'var(--accent)', fontSize: 'calc(14px * var(--reading-scale))', lineHeight: 1.55 }}>
          <span className="type-kicker mr-1.5" style={{ color: 'var(--accent)', fontSize: '10px' }}>Why it matters</span>
          {firstImplication}
        </p>
      )}
      <div className="mt-2.5"><Meta story={story} /></div>
    </Tappable>
  )
}

function StoryEntry({ story, onOpen }: { story: Story; onOpen: (s: Story) => void }) {
  const dek = storyDek(story)
  return (
    <Tappable onActivate={() => onOpen(story)} label={story.headline} measure="entry" measureId={story.id} className="ink flex gap-3 py-3.5">
      <div className="min-w-0 flex-1">
        <Kicker section={story.section} kicker={story.kicker} />
        <h3 className="mt-1 font-display font-semibold text-ink leading-[1.2]" style={{ fontSize: 'calc(17.5px * var(--reading-scale))' }}>
          {story.headline}
        </h3>
        {dek && (
          <p className="mt-1 font-reading text-ink-2 line-clamp-2" style={{ fontSize: 'calc(13.5px * var(--reading-scale))', lineHeight: 1.5 }}>
            {dek}
          </p>
        )}
        <div className="mt-1.5"><Meta story={story} /></div>
      </div>
      {/* self-start + aspect-square: global.css's unlayered img{height:auto} beats
          a h-16 utility, so without these flexbox stretches the thumbnail to the
          full height of the entry. */}
      <PaperImage story={story} variant="thumb" className="mt-1 w-16 shrink-0 self-start aspect-square rounded-sm" />
    </Tappable>
  )
}
