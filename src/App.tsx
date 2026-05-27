import { useEffect, useState } from 'react'
import { Masthead } from './components/layout/Masthead'
import { SectionDeck } from './components/sections/SectionDeck'
import { CATEGORIES } from './lib/categories'
import { CATEGORY_KEYS } from './lib/types'
import type { FeedsPayload, MetaJson, CategoryKey } from './lib/types'

const BASE = import.meta.env.BASE_URL

export default function App() {
  const [meta, setMeta] = useState<MetaJson | null>(null)
  const [feeds, setFeeds] = useState<FeedsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('daily-brief:bookmarks') ?? '[]'))
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    fetch(`${BASE}src/data/meta.json`)
      .then(r => r.ok ? r.json() : null)
      .then((d: MetaJson | null) => { if (d) setMeta(d) })
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
      <Masthead meta={meta} />

      <main id="main-content" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 space-y-14">
        {orderedSections.map((section: CategoryKey) => (
          <SectionDeck
            key={section}
            section={section}
            stories={feeds?.sections[section] ?? []}
            loading={loading}
            bookmarks={bookmarks}
            onBookmark={toggleBookmark}
          />
        ))}
      </main>
    </div>
  )
}
