import { Bookmark } from 'lucide-react'
import { Card } from '../components/cards/Card'
import { CATEGORIES } from '../lib/categories'
import { CATEGORY_KEYS } from '../lib/types'
import { useAppContext } from '../contexts/AppContext'
import type { CategoryKey, Story } from '../lib/types'

export function SavedPage() {
  const { feeds, bookmarks, toggleBookmark } = useAppContext()

  const savedStories: Story[] = feeds
    ? (CATEGORY_KEYS as readonly CategoryKey[]).flatMap(k => feeds.sections[k] ?? []).filter(s => bookmarks.has(s.id))
    : []

  const grouped = CATEGORY_KEYS.reduce<Record<CategoryKey, Story[]>>((acc, key) => {
    acc[key] = savedStories.filter(s => s.section === key)
    return acc
  }, {} as Record<CategoryKey, Story[]>)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="font-serif text-step-3 font-semibold text-ink tracking-[-0.015em]">
          Saved
        </h1>
        {savedStories.length > 0 && (
          <p className="text-[13px] text-ink-3 mt-1" style={{ fontFamily: 'var(--font-sans)' }}>
            {savedStories.length} {savedStories.length === 1 ? 'story' : 'stories'} bookmarked
          </p>
        )}
      </div>

      {savedStories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <Bookmark size={40} className="text-ink-3" strokeWidth={1.5} />
          <p className="font-serif text-step-1 text-ink-2">No saved stories yet</p>
          <p className="text-[14px] text-ink-3 max-w-xs" style={{ fontFamily: 'var(--font-sans)' }}>
            Tap the bookmark icon on any story card to save it here.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {(CATEGORY_KEYS as readonly CategoryKey[]).map(key => {
            const stories = grouped[key]
            if (!stories.length) return null
            return (
              <section key={key} aria-label={CATEGORIES[key].label}>
                <h2
                  className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-4"
                  style={{ color: `var(${CATEGORIES[key].colorVar})`, fontFamily: 'var(--font-mono)' }}
                >
                  {CATEGORIES[key].label}
                </h2>
                <div
                  className="grid gap-5"
                  style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}
                >
                  {stories.map(story => (
                    <Card
                      key={story.id}
                      story={story}
                      isBookmarked={bookmarks.has(story.id)}
                      onBookmark={toggleBookmark}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
