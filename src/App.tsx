import { useEffect, useState } from 'react'
import { Masthead } from './components/layout/Masthead'
import { SettingsSheet } from './components/layout/SettingsSheet'
import { SectionDeck } from './components/sections/SectionDeck'
import { BriefingOfTheDay } from './components/briefing/BriefingOfTheDay'
import { WeatherStrip } from './components/strips/WeatherStrip'
import { MarketsTicker } from './components/strips/MarketsTicker'
import { CATEGORIES } from './lib/categories'
import { CATEGORY_KEYS } from './lib/types'
import { useDensity } from './hooks/useDensity'
import type { FeedsPayload, MetaJson, CategoryKey, BriefingJson } from './lib/types'

const BASE = import.meta.env.BASE_URL

export default function App() {
  const [meta, setMeta] = useState<MetaJson | null>(null)
  const [feeds, setFeeds] = useState<FeedsPayload | null>(null)
  const [briefing, setBriefing] = useState<BriefingJson | null>(null)
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('daily-brief:bookmarks') ?? '[]'))
    } catch {
      return new Set()
    }
  })

  // Apply density class to <html> on mount and whenever it changes.
  useDensity()

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
    fetch(`${BASE}stories.json`)
      .then(r => r.ok ? r.json() : null)
      .then((d: FeedsPayload | null) => { if (d) setFeeds(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function toggleBookmark(id: string) {
    setBookmarks(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      try {
        localStorage.setItem('daily-brief:bookmarks', JSON.stringify([...next]))
      } catch { /* ignore */ }
      return next
    })
  }

  const orderedSections = CATEGORY_KEYS.slice().sort(
    (a, b) => CATEGORIES[a].order - CATEGORIES[b].order,
  )

  return (
    <div className="min-h-screen bg-canvas text-ink font-sans">
      <Masthead
        meta={meta}
        onSettingsOpen={() => setSettingsOpen(true)}
      />

      {/* Info strip — WeatherStrip + MarketsTicker share one row at ≥768px */}
      <div className="border-b border-rule bg-canvas/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:divide-x sm:divide-rule gap-3 sm:gap-0 py-2.5">
            <WeatherStrip className="sm:pr-5" />
            <MarketsTicker className="sm:pl-5" />
          </div>
        </div>
      </div>

      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* BriefingOfTheDay — col-span-full hero block above sections */}
        <div
          className="grid mb-10"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}
        >
          <BriefingOfTheDay briefing={briefing} loading={loading} />
        </div>

        <div className="space-y-14">
          {orderedSections.map((section: CategoryKey) => (
            <SectionDeck
              key={section}
              section={section}
              stories={feeds?.sections[section] ?? []}
              loading={loading}
              bookmarks={bookmarks}
              onBookmark={toggleBookmark}
              feedHealth={meta?.feedHealth}
              lastRefreshISO={meta?.lastRefreshISO}
            />
          ))}
        </div>
      </main>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
