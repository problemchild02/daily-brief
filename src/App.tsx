import { useEffect, useState } from 'react'
import { Masthead } from './components/layout/Masthead'
import { Card } from './components/cards/Card'
import { SkeletonCard } from './components/cards/SkeletonCard'
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
        {orderedSections.map((section: CategoryKey) => {
          const stories = feeds?.sections[section] ?? []
          const cat = CATEGORIES[section]

          return (
            <section key={section} aria-labelledby={`section-${section}`}>
              <h2
                id={`section-${section}`}
                className="type-kicker mb-5"
                style={{ color: `var(${cat.colorVar})` }}
              >
                {cat.label}
              </h2>

              <div
                className="grid gap-5"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}
              >
                {loading
                  ? Array.from({ length: 3 }, (_, i) => (
                      <SkeletonCard key={i} variant={i === 0 ? 'hero' : 'standard'} />
                    ))
                  : stories.length === 0
                    ? (
                      <p className="font-mono text-step--1 text-ink-3 col-span-full py-6">
                        Nothing new in this section — check back after the next refresh.
                      </p>
                    )
                    : stories.map((story, idx) => (
                      <Card
                        key={story.id}
                        story={story}
                        variant={idx === 0 ? 'hero' : 'standard'}
                        isBookmarked={bookmarks.has(story.id)}
                        onBookmark={toggleBookmark}
                      />
                    ))
                }
              </div>
            </section>
          )
        })}
      </main>
    </div>
  )
}
