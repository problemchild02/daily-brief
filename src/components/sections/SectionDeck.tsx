import type { CategoryKey, Story, FeedHealthEntry } from '../../lib/types'
import { Card } from '../cards/Card'
import { SkeletonCard } from '../cards/SkeletonCard'
import { SectionHeader } from './SectionHeader'

interface SectionDeckProps {
  section: CategoryKey
  stories: Story[]
  loading?: boolean
  bookmarks?: Set<string>
  onBookmark?: (id: string) => void
  feedHealth?: Record<string, FeedHealthEntry | 'ok' | 'error'>
  lastRefreshISO?: string
}

// Spec §7.6 — auto-fit grid, one SectionDeck per category.
export function SectionDeck({
  section,
  stories,
  loading = false,
  bookmarks,
  onBookmark,
  feedHealth,
  lastRefreshISO,
}: SectionDeckProps) {
  return (
    <section aria-labelledby={`section-${section}`} className="mb-12">
      <SectionHeader
        category={section}
        feedHealth={feedHealth}
        lastRefreshISO={lastRefreshISO}
      />

      {/* Spec §7.6: "repeat(auto-fit, minmax(320px, 1fr))" — one declaration,
          no media queries — gives 1 col at 375px, 2 at 768px, 3 at 1024px+ */}
      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}
      >
        {loading ? (
          <>
            <SkeletonCard variant="hero" />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : stories.length === 0 ? (
          <p className="font-mono text-step--1 text-ink-3 col-span-full py-6">
            Nothing new in this section — check back after the next refresh.
          </p>
        ) : (
          stories.map((story, idx) => (
            <Card
              key={story.id}
              story={story}
              variant={idx === 0 ? 'hero' : 'standard'}
              isBookmarked={bookmarks?.has(story.id)}
              onBookmark={onBookmark}
            />
          ))
        )}
      </div>
    </section>
  )
}
