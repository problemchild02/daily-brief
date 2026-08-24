import { useEffect, useState } from 'react'
import type { CategoryKey, Story, FeedHealthEntry } from '../../lib/types'
import { Card } from '../cards/Card'
import { SkeletonCard, SkeletonListRow } from '../cards/SkeletonCard'
import { ListRow } from '../cards/ListRow'
import { SectionHeader } from './SectionHeader'
import { useAppContext } from '../../contexts/AppContext'

interface SectionDeckProps {
  section: CategoryKey
  stories: Story[]
  loading?: boolean
  feedHealth?: Record<string, FeedHealthEntry | 'ok' | 'error'>
  lastRefreshISO?: string
}

export function SectionDeck({
  section,
  stories,
  loading = false,
  feedHealth,
  lastRefreshISO,
}: SectionDeckProps) {
  const { isBookmarked, toggleBookmark, density, feedsError, retryFeeds } = useAppContext()
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() =>
    density === 'dense' ? 'list' : 'grid',
  )

  useEffect(() => {
    setViewMode(density === 'dense' ? 'list' : 'grid')
  }, [density])

  const isEmpty = !loading && stories.length === 0

  return (
    <section aria-labelledby={`section-${section}`} className="mb-12">
      <SectionHeader
        category={section}
        feedHealth={feedHealth}
        lastRefreshISO={lastRefreshISO}
        viewMode={viewMode}
        onToggleView={() => setViewMode(v => (v === 'grid' ? 'list' : 'grid'))}
      />

      {loading ? (
        viewMode === 'list' ? (
          <div className="flex flex-col">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonListRow key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-[var(--grid-gap)] md:grid-cols-2">
            <SkeletonCard variant="hero" />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )
      ) : feedsError && isEmpty ? (
        <div className="py-8 flex flex-col items-center gap-3 text-center">
          <p
            className="text-ink-3"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
          >
            Failed to load stories.
          </p>
          <button
            type="button"
            onClick={retryFeeds}
            className="px-3 py-1.5 rounded-lg bg-surface-2 text-ink-2 hover:text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
          >
            Retry
          </button>
        </div>
      ) : isEmpty ? (
        <p className="font-mono text-step--1 text-ink-3 py-6">
          Nothing new in this section — check back after the next refresh.
        </p>
      ) : viewMode === 'list' ? (
        <div className="flex flex-col">
          {stories.map(story => (
            <ListRow
              key={story.id}
              story={story}
              isBookmarked={isBookmarked(story.sourceUrl)}
              onBookmark={() => toggleBookmark(story)}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[var(--grid-gap)] md:grid-cols-2">
          {stories.map((story, idx) => (
            <Card
              key={story.id}
              story={story}
              variant={idx === 0 ? 'hero' : 'standard'}
              isBookmarked={isBookmarked(story.sourceUrl)}
              onBookmark={() => toggleBookmark(story)}
              idx={idx}
            />
          ))}
        </div>
      )}
    </section>
  )
}
