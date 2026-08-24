import { useEffect, useState, useCallback } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
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
import { CATEGORY_KEYS } from './lib/types'
import type { FeedsPayload, MetaJson, BriefingJson } from './lib/types'

const BASE = import.meta.env.BASE_URL

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

          {/* Masthead hidden in print */}
          <div className="print:hidden">
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
              <Routes>
                <Route path="/"                   element={<FrontPage />} />
                <Route path="/sections/:category" element={<SectionPage />} />
                <Route path="/saved"              element={<SavedPage />} />
                <Route path="/papers"             element={<PapersPage />} />
                <Route path="/search"             element={<SearchRedirect   onOpen={() => setPaletteOpen(true)} />} />
                <Route path="/settings"           element={<SettingsRedirect onOpen={() => setSettingsOpen(true)} />} />
                <Route path="*"                   element={<FrontPage />} />
              </Routes>
            </main>

            {/* Laptop-only aux rail — third "column" of the broadsheet layout
                (nav rail | main feed | aux rail), sticky below the masthead. */}
            {isLaptop && (
              <aside
                aria-label="Markets and weather"
                className="w-[260px] shrink-0 border-l border-rule px-6 py-8 self-start sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto print:hidden"
              >
                <div className="flex flex-col gap-6">
                  <div>
                    <p className="type-kicker mb-3 text-ink-3">Weather</p>
                    <WeatherStrip />
                  </div>
                  <div className="border-t border-rule pt-6">
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
