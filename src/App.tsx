import { useEffect, useState, useCallback } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
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
import { useIsDesktop } from './hooks/useMediaQuery'
import { CATEGORY_KEYS } from './lib/types'
import type { FeedsPayload, MetaJson, BriefingJson } from './lib/types'

const BASE = import.meta.env.BASE_URL

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

  const { density } = useDensity()
  const { toggle: toggleBookmark, isBookmarked, bookmarksList } = useBookmarks()
  const isDesktop = useIsDesktop()

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

  const allStories = feeds
    ? CATEGORY_KEYS.flatMap(k => feeds.sections[k] ?? [])
    : []

  return (
    <AppContext.Provider value={{
      feeds, meta, briefing, loading, feedsError, retryFeeds, density,
      bookmarksList, isBookmarked, toggleBookmark,
      onSettingsOpen: () => setSettingsOpen(true),
      onPaletteOpen:  () => setPaletteOpen(true),
    }}>
      <div className="min-h-screen bg-canvas text-ink font-sans">
        {isDesktop && <Sidebar />}

        <div className={[
          'flex flex-col min-h-screen',
          isDesktop ? 'ml-[240px]' : 'pb-20',
        ].join(' ')}>

          {/* Masthead hidden in print */}
          <div className="print:hidden">
            <Masthead
              meta={meta}
              onSettingsOpen={() => setSettingsOpen(true)}
              onSearchOpen={() => setPaletteOpen(true)}
            />
          </div>

          {/* Info strip hidden in print */}
          <div className="border-b border-rule bg-canvas/80 print:hidden">
            <div className="mx-auto max-w-7xl px-4 sm:px-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:divide-x sm:divide-rule gap-3 sm:gap-0 py-2.5">
                <WeatherStrip className="sm:pr-5" />
                <MarketsTicker className="sm:pl-5" />
              </div>
            </div>
          </div>

          <main id="main-content" className="flex-1">
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
  )
}
