import { useEffect, useState, useCallback } from 'react'
import { Routes, Route, useNavigate, useLocation, Link } from 'react-router-dom'
import { MotionConfig, AnimatePresence, motion } from 'motion/react'
import { Masthead } from './components/layout/Masthead'
import { Sidebar } from './components/layout/Sidebar'
import { TabBar } from './components/layout/TabBar'
import { SettingsSheet } from './components/layout/SettingsSheet'
import { CommandPalette } from './components/search/CommandPalette'
import { WeatherStrip } from './components/strips/WeatherStrip'
import { MarketsTicker } from './components/strips/MarketsTicker'
import { FrontPage } from './pages/FrontPage'
import { SectionPage } from './pages/SectionPage'
import { SavedPage } from './pages/SavedPage'
import { PapersPage } from './pages/PapersPage'
import { AppContext } from './contexts/AppContext'
import { useDensity } from './hooks/useDensity'
import { useBookmarks } from './hooks/useBookmarks'
import { useIsDesktop, useMediaQuery } from './hooks/useMediaQuery'
import { CATEGORIES } from './lib/categories'
import { CATEGORY_KEYS } from './lib/types'
import type { FeedsPayload, MetaJson, BriefingJson } from './lib/types'
import type { BookmarkMeta } from './hooks/useBookmarks'

const BASE = import.meta.env.BASE_URL

// Aux-rail widget — condensed Today's Brief recap. The hero briefing scrolls out of
// view immediately once you're reading a section, but on laptop the rail is always
// visible, so this keeps the day's 5 headlines one glance away without re-fetching
// anything (same `briefing` data the hero card already has).
function BriefRail({ briefing }: { briefing: BriefingJson | null }) {
  if (!briefing || briefing.bullets.length === 0) return null
  return (
    <div className="pt-6 first:pt-0">
      <p className="type-kicker mb-3 text-ink-3">Today's Brief</p>
      <ol className="space-y-2.5">
        {briefing.bullets.map((bullet, i) => {
          return (
            <li key={i} className="flex items-baseline gap-2">
              <span
                className="shrink-0 font-display font-semibold"
                style={{ fontSize: '13px', color: 'var(--accent)' }}
              >
                {i + 1}
              </span>
              <a
                href={bullet.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-reading text-[13px] leading-snug text-ink-2 hover:text-ink transition-colors"
              >
                {bullet.text}
              </a>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// Aux-rail widget — most recent saved stories, so bookmarking something feels like
// it actually goes somewhere useful instead of vanishing into a page you have to
// navigate to. Hidden entirely when there's nothing saved yet (an empty-state box
// here would just be more of the dead space this rail already had too much of).
function SavedRail({ bookmarksList }: { bookmarksList: BookmarkMeta[] }) {
  if (bookmarksList.length === 0) return null
  const recent = bookmarksList.slice(0, 5)
  return (
    <div className="pt-6 first:pt-0">
      <div className="mb-3 flex items-center justify-between">
        <p className="type-kicker text-ink-3">Saved</p>
        <Link
          to="/saved"
          className="font-mono text-[10px] text-ink-3 hover:text-accent transition-colors"
        >
          View all →
        </Link>
      </div>
      <ul className="space-y-3">
        {recent.map(b => {
          const cat = CATEGORIES[b.category]
          return (
            <li key={b.urlHash} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: cat ? `var(${cat.colorVar})` : 'var(--ink-3)' }}
              />
              <a
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-reading text-[13px] leading-snug text-ink-2 hover:text-ink transition-colors"
              >
                {b.headline}
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function readSidebarCollapsed(): boolean {
  try { return localStorage.getItem('daily-brief:sidebar-collapsed') === 'true' } catch { return false }
}

function SearchRedirect({ onOpen }: { onOpen: () => void }) {
  const navigate = useNavigate()
  useEffect(() => { onOpen(); navigate('/', { replace: true }) }, [])
  return null
}

function SettingsRedirect({ onOpen }: { onOpen: () => void }) {
  const navigate = useNavigate()
  useEffect(() => { onOpen(); navigate('/', { replace: true }) }, [])
  return null
}

export default function App() {
  const [meta,     setMeta]     = useState<MetaJson | null>(null)
  const [feeds,    setFeeds]    = useState<FeedsPayload | null>(null)
  const [briefing, setBriefing] = useState<BriefingJson | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [feedsError, setFeedsError] = useState(false)
  const [fetchKey, setFetchKey] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [paletteOpen,  setPaletteOpen]  = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed)

  const { density } = useDensity()
  const { toggle: toggleBookmark, isBookmarked, bookmarksList } = useBookmarks()
  const isDesktop = useIsDesktop()
  // Laptop breakpoint (≥1024px, matches Tailwind's `lg:`) — at this width the
  // markets/weather strip moves out of the top bar and into a permanent aux rail
  // instead. Gated in JS (not just CSS) so the strip and rail never both mount at
  // once, which would otherwise double the useMarkets/useWeather data fetches.
  const isLaptop = useMediaQuery('(min-width: 1024px)')
  const location = useLocation()

  // ── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${BASE}src/data/meta.json`)
      .then(r => r.ok ? r.json() : null)
      .then((d: MetaJson | null) => { if (d) setMeta(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`${BASE}src/data/briefing.json`)
      .then(r => r.ok ? r.json() : null)
      .then((d: BriefingJson | null) => { if (d) setBriefing(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setFeedsError(false)
    fetch(`${BASE}stories.json`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: FeedsPayload) => { setFeeds(d); setFeedsError(false) })
      .catch(() => setFeedsError(true))
      .finally(() => setLoading(false))
  }, [fetchKey])

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        (e.key === 'k' && (e.metaKey || e.ctrlKey)) ||
        (e.key === '/' &&
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLTextAreaElement))
      ) {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const retryFeeds = useCallback(() => {
    setLoading(true)
    setFeedsError(false)
    setFetchKey(k => k + 1)
  }, [])

  const onSidebarToggle = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('daily-brief:sidebar-collapsed', String(next)) } catch {}
      return next
    })
  }, [])

  const allStories = feeds
    ? CATEGORY_KEYS.flatMap(k => feeds.sections[k] ?? [])
    : []

  return (
    <MotionConfig reducedMotion="user">
    <AppContext.Provider value={{
      feeds, meta, briefing, loading, feedsError, retryFeeds, density,
      bookmarksList, isBookmarked, toggleBookmark,
      onSettingsOpen: () => setSettingsOpen(true),
      onPaletteOpen:  () => setPaletteOpen(true),
      sidebarCollapsed,
      onSidebarToggle,
    }}>
      <div className="min-h-screen bg-canvas text-ink font-sans">
        {isDesktop && <Sidebar />}

        <div className={[
          'flex flex-col min-h-screen transition-[margin-left] duration-300',
          isDesktop ? (sidebarCollapsed ? 'ml-0' : 'ml-[240px]') : 'pb-20',
        ].join(' ')}>

          {/* Masthead hidden in print. `contents` (not a plain block wrapper) is
              deliberate: a plain div here has no explicit height, so it's exactly as
              tall as the Masthead itself — which gives the header's sticky positioning
              zero extra room in its own containing block, and it scrolls away instead
              of sticking (confirmed: header.top was tracking -scrollY exactly, i.e.
              behaving as position:static). `contents` removes this wrapper from the
              layout tree entirely — Masthead renders as if it were a direct child of
              the flex column below, sticking correctly against the whole page's
              scroll — while still being a real DOM node `print:hidden` can target. */}
          <div className="contents print:hidden">
            <Masthead
              meta={meta}
              onSettingsOpen={() => setSettingsOpen(true)}
              onSearchOpen={() => setPaletteOpen(true)}
              onSidebarToggle={isDesktop ? onSidebarToggle : undefined}
            />
          </div>

          {/* Info strip — mobile/tablet only; hidden in print. Below 1024px the
              markets/weather strip scrolls horizontally instead of stacking
              vertically and pushing the news down the fold. */}
          {!isLaptop && (
            <div className="border-b border-rule bg-canvas/80 print:hidden">
              <div className="mx-auto max-w-7xl px-4 md:px-6">
                <div className="flex items-center gap-4 overflow-x-auto whitespace-nowrap py-2.5 [-webkit-overflow-scrolling:touch]">
                  <WeatherStrip className="shrink-0 !flex-nowrap md:pr-5 md:border-r md:border-rule" />
                  <MarketsTicker className="shrink-0 !flex-nowrap md:pl-1" />
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 flex">
            <main id="main-content" className="flex-1 min-w-0">
              {/* Route changes get a soft fade+rise instead of an abrupt swap — the
                  explicit `location` pin on Routes keeps rendering the outgoing page
                  during the exit animation, which is what AnimatePresence needs to
                  animate a route transition instead of just the entrance. */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  <Routes location={location}>
                    <Route path="/"                   element={<FrontPage />} />
                    <Route path="/sections/:category" element={<SectionPage />} />
                    <Route path="/saved"              element={<SavedPage />} />
                    <Route path="/papers"             element={<PapersPage />} />
                    <Route path="/search"             element={<SearchRedirect   onOpen={() => setPaletteOpen(true)} />} />
                    <Route path="/settings"           element={<SettingsRedirect onOpen={() => setSettingsOpen(true)} />} />
                    <Route path="*"                   element={<FrontPage />} />
                  </Routes>
                </motion.div>
              </AnimatePresence>
            </main>

            {/* Laptop-only aux rail — third "column" of the broadsheet layout
                (nav rail | main feed | aux rail), sticky below the masthead.
                Today's Brief + Saved lead (the personalized, highest-value content —
                the hero briefing scrolls out of view the moment you start reading a
                section, so this keeps it one glance away instead of leaving a rail
                that's mostly empty space below two lightweight widgets). Both hide
                themselves when there's nothing to show; divide-y only draws a rule
                between whichever widgets actually rendered, never before the first. */}
            {isLaptop && (
              <aside
                aria-label="Today's brief, saved stories, weather and markets"
                className="w-[260px] shrink-0 border-l border-rule px-6 py-8 self-start sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto print:hidden"
              >
                <div className="flex flex-col divide-y divide-rule">
                  <BriefRail briefing={briefing} />
                  <SavedRail bookmarksList={bookmarksList} />
                  <div className="pt-6 first:pt-0">
                    <p className="type-kicker mb-3 text-ink-3">Weather</p>
                    <WeatherStrip />
                  </div>
                  <div className="pt-6 first:pt-0">
                    <p className="type-kicker mb-3 text-ink-3">Markets</p>
                    <MarketsTicker />
                  </div>
                </div>
              </aside>
            )}
          </div>
        </div>

        {!isDesktop && <TabBar />}

        <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          stories={allStories}
          onSettingsOpen={() => setSettingsOpen(true)}
        />
      </div>
    </AppContext.Provider>
    </MotionConfig>
  )
}
