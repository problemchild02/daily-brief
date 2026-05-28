import { useParams, Navigate } from 'react-router-dom'
import { SectionDeck } from '../components/sections/SectionDeck'
import { CATEGORIES } from '../lib/categories'
import { CATEGORY_KEYS } from '../lib/types'
import { useAppContext } from '../contexts/AppContext'
import type { CategoryKey } from '../lib/types'

export function SectionPage() {
  const { category } = useParams<{ category: string }>()
  const { feeds, meta, loading, bookmarks, toggleBookmark } = useAppContext()

  if (!category || !(CATEGORY_KEYS as readonly string[]).includes(category)) {
    return <Navigate to="/" replace />
  }

  const catKey = category as CategoryKey

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Back-link / breadcrumb */}
      <p
        className="text-[11px] text-ink-3 mb-6 uppercase tracking-[0.06em]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <span style={{ color: `var(${CATEGORIES[catKey].colorVar})` }}>
          {CATEGORIES[catKey].label}
        </span>
      </p>

      <SectionDeck
        section={catKey}
        stories={feeds?.sections[catKey] ?? []}
        loading={loading}
        bookmarks={bookmarks}
        onBookmark={toggleBookmark}
        feedHealth={meta?.feedHealth}
        lastRefreshISO={meta?.lastRefreshISO}
      />
    </div>
  )
}
