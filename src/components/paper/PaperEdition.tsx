import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ListOrdered } from 'lucide-react'
import { FlipBook, type FlipBookHandle } from './FlipBook'
import {
  PageShell, Folio, FrontPageContent, BriefContinuedContent, ContentsContent, SectionContent,
  MeasuringContext, type LeadFit,
  type ContentsEntry,
} from './PaperPages'
import { useAppContext } from '../../contexts/AppContext'
import { usePreferences } from '../../hooks/usePreferences'
import { CATEGORIES } from '../../lib/categories'
import { CATEGORY_KEYS } from '../../lib/types'
import type { CategoryKey, Story } from '../../lib/types'

type PageDesc =
  | { kind: 'front'; withContents: boolean; bulletLimit?: number }
  | { kind: 'brief'; from: number; to: number; contents?: ContentsDensity }
  | { kind: 'contents'; density: ContentsDensity }
  | { kind: 'section'; section: CategoryKey; stories: Story[]; lead?: Story; leadFit?: LeadFit; continued: boolean }

const ORDERED_SECTIONS = (CATEGORY_KEYS as readonly CategoryKey[])
  .slice()
  .sort((a, b) => CATEGORIES[a].order - CATEGORIES[b].order)

/**
 * Everything pagination needs, measured from an off-screen copy of the pages at
 * the real page size, fonts and text size, rather than estimated: headline
 * length, photo, summary, the brief and the weather all change how tall things
 * are, and an estimate that comes up short leaves a page that scrolls with its
 * folio cut off.
 */
interface Layout {
  /** Bullets that fit under the nameplate; the rest continue overleaf. */
  bullets: number
  totalBullets: number
  /** Height of each bullet (with the gap after it), and of the "continued"
      page's heading. */
  bulletH: number[]
  briefHead: number
  /** The whole brief plus a compact contents list fit on one page. */
  merged: boolean
  /** The roomiest contents layout that fits on its own page. */
  contents: ContentsDensity
  /** Height of the contents list in each layout, to see whether it fits under
      the end of the brief. */
  contentsH: Record<ContentsDensity, number>
  /** Usable height of a page body, between the top padding and the folio. */
  body: number
  /** Heights (including spacing) of each section's front header and
      "continued" header, of each lead story and each listed story. */
  head: Partial<Record<CategoryKey, number>>
  cont: Partial<Record<CategoryKey, number>>
  lead: Record<LeadFit, Record<string, number>>
  entry: Record<string, number>
}

function buildPages(sections: Record<CategoryKey, Story[]> | undefined, layout: Layout): PageDesc[] {
  const pages: PageDesc[] = []
  if (layout.merged) {
    pages.push({ kind: 'front', withContents: true })
  } else if (layout.bullets < layout.totalBullets) {
    pages.push({ kind: 'front', withContents: false, bulletLimit: layout.bullets })
    // The rest of the brief, as many pages as it takes (rarely more than one).
    let used = 0
    for (let from = layout.bullets; from < layout.totalBullets;) {
      let to = from
      used = layout.briefHead
      while (to < layout.totalBullets && (to === from || used + layout.bulletH[to] <= layout.body)) used += layout.bulletH[to++]
      pages.push({ kind: 'brief', from, to })
      from = to
    }
    // The contents share the last of those pages when they fit, rather than
    // leaving it mostly blank.
    const density = CONTENTS_DENSITIES.find(d => used + CONTENTS_GAP + layout.contentsH[d] <= layout.body)
    const last = pages[pages.length - 1]
    if (density && last.kind === 'brief') last.contents = density
  } else {
    pages.push({ kind: 'front', withContents: false })
  }
  const contentsPlaced = pages.some(p => p.kind === 'brief' && p.contents)
  if (!layout.merged && !contentsPlaced) pages.push({ kind: 'contents', density: layout.contents })
  if (!sections) return pages

  for (const section of ORDERED_SECTIONS) {
    const stories = sections[section] ?? []
    if (stories.length === 0) continue
    const [lead, ...rest] = stories
    const head = layout.head[section] ?? 0
    // A page too short for the full lead gets a shorter one.
    const leadFit = LEAD_FITS.find(f => head + (layout.lead[f][lead.id] ?? 0) <= layout.body) ?? 'text'
    let page: Story[] = []
    let used = head + (layout.lead[leadFit][lead.id] ?? 0)
    let first = true
    const flush = () => {
      pages.push(first
        ? { kind: 'section', section, lead, leadFit, stories: page, continued: false }
        : { kind: 'section', section, stories: page, continued: true })
      first = false
      page = []
      used = layout.cont[section] ?? 0
    }
    for (const story of rest) {
      const h = layout.entry[story.id] ?? 0
      // A section front may end with just its lead. A continuation page always
      // takes at least one story, even an over-tall one — it'll scroll rather
      // than flush empty pages forever.
      if (used + h > layout.body && (first || page.length > 0)) flush()
      page.push(story)
      used += h
    }
    if (first || page.length > 0) flush()
  }
  return pages
}

/** Contents with two-line lead headlines, one-line, or just section names. */
type ContentsDensity = 'full' | 'tight' | 'compact'

const CONTENTS_DENSITIES: ContentsDensity[] = ['full', 'tight', 'compact']
/** The mt-6 between the end of the brief and the contents. */
const CONTENTS_GAP = 24

const LEAD_FITS: LeadFit[] = ['full', 'compact', 'text']

function labelOf(p?: PageDesc): string {
  if (!p) return ''
  if (p.kind === 'front' || p.kind === 'brief') return 'Front page'
  if (p.kind === 'contents') return 'Contents'
  return CATEGORIES[p.section].label
}

/** Room the "Continued on page N" line needs when the brief is split. */
const CONTINUED_LINE = 34

function measureLayout(root: HTMLElement): Layout | null {
  const inner = (k: string) => root.querySelector<HTMLElement>(`[data-measure="${k}"] .paper-page__inner`)
  const front = inner('front'), merged = inner('merged'), contents = inner('contents'), tight = inner('contents-tight')
  const compactCopy = inner('contents-compact')
  if (!front || !contents || !tight || !compactCopy) return null
  // Height of what a page renders, not of the page: the first child of its
  // content area.
  const contentH = (el: HTMLElement) => Math.ceil(el.firstElementChild?.firstElementChild?.getBoundingClientRect().height ?? 0)
  const overflows = (el: HTMLElement) => el.scrollHeight > el.clientHeight + 1
  const top = (el: Element) => el.getBoundingClientRect().top
  const bottom = (el: Element) => el.getBoundingClientRect().bottom

  // The folio sits at the foot of every page, after a 16px margin.
  const footer = front.querySelector('footer')
  const padTop = parseFloat(getComputedStyle(front.firstElementChild!).paddingTop) || 0
  const body = front.clientHeight - padTop - 16 - (footer?.offsetHeight ?? 0)
  const limit = top(front) + front.clientHeight - 16 - (footer?.offsetHeight ?? 0)

  const items = [...front.querySelectorAll('[data-bullet]')]
  const fitting = (edge: number) => {
    let n = 0
    for (const li of items) { if (bottom(li) <= edge) n++; else break }
    return n
  }
  let bullets = overflows(front) ? fitting(limit) : items.length
  if (bullets < items.length) bullets = fitting(limit - CONTINUED_LINE)

  const briefCopy = inner('brief')
  const briefItems = briefCopy ? [...briefCopy.querySelectorAll('[data-bullet]')] : []
  const briefStart = briefCopy?.firstElementChild?.firstElementChild
  const layout: Layout = {
    bullets,
    totalBullets: items.length,
    bulletH: briefItems.map((li, i) => Math.ceil((briefItems[i + 1] ? top(briefItems[i + 1]) : bottom(li) + 12) - top(li))),
    briefHead: briefItems[0] && briefStart ? Math.ceil(top(briefItems[0]) - top(briefStart)) : 0,
    merged: !!merged && !overflows(merged),
    contents: !overflows(contents) ? 'full' : !overflows(tight) ? 'tight' : 'compact',
    contentsH: { full: contentH(contents), tight: contentH(tight), compact: contentH(compactCopy) },
    body: Math.floor(body) - 2,
    head: {}, cont: {}, lead: { full: {}, compact: {}, text: {} }, entry: {},
  }
  // Each height runs from an element's top to the next one's, so margins and
  // dividers between stories are counted too.
  root.querySelectorAll<HTMLElement>('[data-measure-section]').forEach(el => {
    const section = el.dataset.measureSection as CategoryKey
    const [frontCopy, contCopy, ...leadCopies] = el.querySelectorAll('[data-copy]')
    const head = frontCopy?.querySelector('[data-m="head"]')
    const lead = frontCopy?.querySelector<HTMLElement>('[data-m="lead-full"]')
    const list = frontCopy?.querySelector('[data-m="list"]')
    if (!head || !lead || !list) return
    layout.head[section] = Math.ceil(top(lead) - top(head))
    layout.lead.full[lead.dataset.id!] = Math.ceil(top(list) - top(lead))
    const entries = [...list.querySelectorAll<HTMLElement>('[data-m="entry"]')]
    entries.forEach((entry, i) => {
      const next = entries[i + 1]
      layout.entry[entry.dataset.id!] = Math.ceil((next ? top(next) : bottom(list)) - top(entry))
    })
    for (const copy of leadCopies) {
      const variant = copy.querySelector<HTMLElement>('[data-m^="lead-"]')
      const variantList = copy.querySelector('[data-m="list"]')
      if (!variant || !variantList) continue
      const fit = variant.dataset.m!.slice(5) as LeadFit
      layout.lead[fit][variant.dataset.id!] = Math.ceil(top(variantList) - top(variant))
    }
    const cont = contCopy?.querySelector('[data-m="cont"]')
    const contList = contCopy?.querySelector('[data-m="list"]')
    if (cont && contList) layout.cont[section] = Math.ceil(top(contList) - top(cont))
  })
  return layout
}

export function PaperEdition() {
  const { feeds, meta, briefing, onStoryOpen } = useAppContext()
  const { pageSound, textSize, font } = usePreferences()
  const { category } = useParams<{ category?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const bookRef = useRef<FlipBookHandle>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null)

  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setStage(prev => {
        const w = Math.round(r.width), h = Math.round(r.height)
        return prev && Math.abs(prev.w - w) < 8 && Math.abs(prev.h - h) < 8 ? prev : { w, h }
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Two facing pages when there's room for two readable columns and the space is
  // landscape-shaped (iPad landscape, laptop); one page on phones and iPad portrait.
  const spread = !!stage && stage.w >= 760 && stage.w / stage.h >= 1.15
  // The page size the book reports once it has measured its own space (the page
  // edges and padding take some of the stage). Pagination waits for it.
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null)
  const onPageSize = useCallback((w: number, h: number) => {
    setPageSize(prev => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
  }, [])
  const pageW = pageSize?.w ?? 0
  const pageH = pageSize?.h ?? 0

  // A tall single page (iPad portrait) may have room for the contents under
  // Today's Brief; a phone page or one side of a spread never does.
  const mergeCandidate = !spread && pageH >= 900 && pageW >= 600
  const [layout, setLayout] = useState<Layout | null>(null)
  const measureRef = useRef<HTMLDivElement>(null)

  const pages = useMemo(
    () => (pageSize && layout ? buildPages(feeds?.sections, layout) : []),
    [feeds, pageSize, layout],
  )

  const sectionStart = useMemo(() => {
    const map = new Map<CategoryKey, number>()
    pages.forEach((p, i) => { if (p.kind === 'section' && !p.continued) map.set(p.section, i) })
    return map
  }, [pages])

  const allStories = useMemo(
    () => ORDERED_SECTIONS.flatMap(s => feeds?.sections[s] ?? []),
    [feeds],
  )

  const [current, setCurrent] = useState(0)
  const currentRef = useRef(0)

  // Open on the section the URL asks for (sidebar / tab bar / shared link), and
  // follow later URL changes. Ignored when that section is already on screen, so
  // the URL update below doesn't bounce the reader back to the section front.
  const initialPage = category && sectionStart.has(category as CategoryKey)
    ? sectionStart.get(category as CategoryKey)!
    : 0
  useEffect(() => {
    if (!category) return
    const target = sectionStart.get(category as CategoryKey)
    if (target === undefined) return
    // Either page of a spread counts as already showing the section.
    const showing = spread ? [currentRef.current, currentRef.current + 1] : [currentRef.current]
    if (showing.some(i => { const p = pages[i]; return p?.kind === 'section' && p.section === category })) return
    bookRef.current?.goTo(target)
  }, [category, sectionStart, pages, spread])

  const contentsIndex = pages.findIndex(p =>
    p.kind === 'contents' || (p.kind === 'front' && p.withContents) || (p.kind === 'brief' && !!p.contents))

  const onFlip = (index: number, initial: boolean) => {
    currentRef.current = index
    setCurrent(index)
    // Only pages the reader turns to move the URL. The book's report of where it
    // opened mustn't: on first load it opens on page 1 before stories arrive, and
    // syncing that would overwrite a /sections/... link before it's honoured.
    if (initial || !feeds) return
    // Leave the URL alone while its section is still on screen — on a spread
    // that may be the right-hand page.
    const showing = (spread ? [index, index + 1] : [index]).map(i => pages[i])
    if (showing.some(p => p?.kind === 'section' && location.pathname === `/sections/${p.section}`)) return
    const page = showing.find(p => p?.kind === 'section') ?? pages[index]
    const want = page?.kind === 'section' ? `/sections/${page.section}` : '/'
    if (location.pathname !== want) navigate(want, { replace: true })
  }

  const contents: ContentsEntry[] = ORDERED_SECTIONS
    .filter(s => sectionStart.has(s))
    .map(s => ({
      section: s,
      page: sectionStart.get(s)! + 1,
      count: feeds?.sections[s]?.length ?? 0,
      lead: feeds?.sections[s]?.[0],
    }))

  // The measuring copy lists every section with stories. Its page numbers are
  // placeholders (only height matters), so measuring never depends on the pages
  // it decides.
  const measureEntries: ContentsEntry[] = useMemo(
    () => ORDERED_SECTIONS
      .filter(s => (feeds?.sections[s]?.length ?? 0) > 0)
      .map(s => ({ section: s, page: 10, count: feeds!.sections[s].length, lead: feeds!.sections[s][0] })),
    [feeds],
  )

  // Re-measure whenever the off-screen copies change size: fonts arriving,
  // weather loading, a new text size or page size.
  useLayoutEffect(() => {
    const root = measureRef.current
    if (!root || !pageSize) return
    const measure = () => {
      const next = measureLayout(root)
      if (!next) return
      // Only a real change re-paginates (and so rebuilds the book).
      setLayout(prev => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    root.querySelectorAll('.paper-page__inner > div').forEach(el => ro.observe(el))
    return () => ro.disconnect()
  }, [pageSize, mergeCandidate, briefing, meta, measureEntries, feeds, textSize, font])

  const openBullet = (url: string) => {
    const story = allStories.find(s => s.sourceUrl === url)
    if (story) onStoryOpen(story)
    else window.open(url, '_blank', 'noopener,noreferrer')
  }

  const nodes = pages.map((p, i) => {
    return (
      <PageShell key={i} folio={<Folio page={i + 1} section={labelOf(p)} />}>
        {p.kind === 'front' && (
          <>
            <FrontPageContent
              meta={meta}
              briefing={briefing}
              onBulletOpen={openBullet}
              bulletLimit={p.bulletLimit}
              continuedOn={p.bulletLimit !== undefined ? i + 2 : undefined}
            />
            {p.withContents && (
              <div className="mt-6">
                <ContentsContent compact entries={contents} onGoTo={pg => bookRef.current?.goTo(pg)} />
              </div>
            )}
          </>
        )}
        {p.kind === 'brief' && (
          <>
            <BriefContinuedContent briefing={briefing} from={p.from} to={p.to} onBulletOpen={openBullet} />
            {p.contents && (
              <div className="mt-6">
                <ContentsContent
                  compact={p.contents === 'compact'}
                  tight={p.contents === 'tight'}
                  entries={contents}
                  onGoTo={pg => bookRef.current?.goTo(pg)}
                />
              </div>
            )}
          </>
        )}
        {p.kind === 'contents' && (
          <ContentsContent
            compact={p.density === 'compact'}
            tight={p.density === 'tight'}
            entries={contents}
            onGoTo={pg => bookRef.current?.goTo(pg)}
          />
        )}
        {p.kind === 'section' && (
          <SectionContent
            section={p.section}
            stories={p.stories}
            lead={p.lead}
            leadFit={p.leadFit}
            continued={p.continued}
            totalInSection={feeds?.sections[p.section]?.length ?? 0}
            onOpen={onStoryOpen}
          />
        )}
      </PageShell>
    )
  })

  const here = pages[current]
  // On a spread whose two pages belong to different sections (one ending, the
  // next starting on the right-hand page), name both.
  const facing = spread ? pages[current + 1] : undefined
  const hereLabel = facing && labelOf(facing) !== labelOf(here)
    ? `${labelOf(here)} · ${labelOf(facing)}`
    : labelOf(here)
  const lastVisible = spread ? Math.min(current + 2, pages.length) : current + 1

  return (
    <div className="flex h-full flex-col" style={{ ['--paper-page-h' as string]: pageH ? `${pageH}px` : undefined }}>
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 sm:px-5 print:hidden">
        <button
          type="button"
          onClick={() => bookRef.current?.prev()}
          disabled={current === 0}
          aria-label="Previous page"
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-ink-3" aria-live="polite">
          {here?.kind === 'section' && (
            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: `var(${CATEGORIES[here.section].colorVar})` }} />
          )}
          <span className="truncate uppercase tracking-[0.06em]">{hereLabel}</span>
          <span className="tabular-nums">
            {pages.length > 0 && (spread && lastVisible - current === 2 ? `${current + 1}–${lastVisible}` : current + 1)} / {pages.length}
          </span>
          <button
            type="button"
            onClick={() => bookRef.current?.goTo(Math.max(0, contentsIndex))}
            aria-label="Contents"
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-2 hover:text-ink transition-colors"
          >
            <ListOrdered size={15} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => bookRef.current?.next()}
          disabled={current >= pages.length - (spread ? 2 : 1)}
          aria-label="Next page"
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 disabled:opacity-30 transition-colors"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {pageSize && (
        <div
          ref={measureRef}
          aria-hidden
          className="pointer-events-none fixed left-[-10000px] top-0 invisible"
        >
          {(['front', 'merged', 'contents', 'contents-tight', 'contents-compact', 'brief'] as const)
            .filter(k => k !== 'merged' || mergeCandidate)
            .map(k => (
              <div key={k} data-measure={k} className="paper-page" style={{ width: pageW, height: pageH }}>
                <PageShell folio={<Folio page={1} section="Front page" />}>
                  {(k === 'front' || k === 'merged') && <FrontPageContent meta={meta} briefing={briefing} onBulletOpen={() => {}} />}
                  {k === 'merged' && (
                    <div className="mt-6"><ContentsContent compact entries={measureEntries} onGoTo={() => {}} /></div>
                  )}
                  {k === 'contents' && <ContentsContent entries={measureEntries} onGoTo={() => {}} />}
                  {k === 'contents-tight' && <ContentsContent tight entries={measureEntries} onGoTo={() => {}} />}
                  {k === 'contents-compact' && <ContentsContent compact entries={measureEntries} onGoTo={() => {}} />}
                  {k === 'brief' && <BriefContinuedContent briefing={briefing} from={0} onBulletOpen={() => {}} />}
                </PageShell>
              </div>
            ))}
          {/* Every section as a section front (header, lead, the rest listed)
              and an empty "continued" page, at full height, so each piece can
              be measured. */}
          <MeasuringContext.Provider value={true}>
            {ORDERED_SECTIONS.map(section => {
              const stories = feeds?.sections[section] ?? []
              if (stories.length === 0) return null
              const [lead, ...rest] = stories
              return (
                <div key={section} data-measure-section={section} className="paper-page" style={{ width: pageW }}>
                  <div data-copy>
                    <PageShell folio={null}>
                      <SectionContent section={section} lead={lead} stories={rest} continued={false} totalInSection={stories.length} onOpen={() => {}} />
                    </PageShell>
                  </div>
                  <div data-copy>
                    <PageShell folio={null}>
                      <SectionContent section={section} stories={[]} continued totalInSection={stories.length} onOpen={() => {}} />
                    </PageShell>
                  </div>
                  {(['compact', 'text'] as const).map(f => (
                    <div key={f} data-copy>
                      <PageShell folio={null}>
                        <SectionContent section={section} lead={lead} leadFit={f} stories={[]} continued={false} totalInSection={stories.length} onOpen={() => {}} />
                      </PageShell>
                    </div>
                  ))}
                </div>
              )
            })}
          </MeasuringContext.Provider>
        </div>
      )}

      <div ref={stageRef} className="min-h-0 flex-1 px-1 pb-3 sm:px-4 sm:pb-5">
        {stage && (
          <FlipBook
            // A new page count or layout means a different book; rebuild it,
            // reopening on the same section rather than the same page number.
            key={`${pages.length}-${spread}`}
            ref={bookRef}
            pages={nodes}
            spread={spread}
            startPage={initialPage || currentRef.current}
            onFlip={onFlip}
            onPageSize={onPageSize}
            sound={pageSound}
            label="Today's paper"
          />
        )}
      </div>
    </div>
  )
}
