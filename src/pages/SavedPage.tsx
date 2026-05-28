import { Bookmark, BookmarkCheck, ExternalLink } from 'lucide-react'
import { CATEGORIES } from '../lib/categories'
import { useAppContext } from '../contexts/AppContext'
import type { BookmarkMeta } from '../hooks/useBookmarks'

const BUCKETS = ['Today', 'This week', 'Earlier this month', 'Older'] as const
type Bucket = (typeof BUCKETS)[number]

function timeBucket(savedAt: string): Bucket {
  const diffDays = (Date.now() - new Date(savedAt).getTime()) / 86_400_000
  if (diffDays < 1)  return 'Today'
  if (diffDays < 7)  return 'This week'
  if (diffDays < 30) return 'Earlier this month'
  return 'Older'
}

export function SavedPage() {
  const { bookmarksList, toggleBookmark } = useAppContext()

  const grouped = bookmarksList.reduce<Record<Bucket, BookmarkMeta[]>>(
    (acc, bm) => { acc[timeBucket(bm.savedAt)].push(bm); return acc },
    { Today: [], 'This week': [], 'Earlier this month': [], Older: [] },
  )

  function handleRemove(bm: BookmarkMeta) {
    // toggleBookmark only reads sourceUrl when removing an existing bookmark
    toggleBookmark({
      id: bm.urlHash,
      section: bm.category,
      headline: bm.headline,
      hook: '',
      summary: '',
      source: bm.source,
      sourceUrl: bm.url,
      dateLabel: '',
      publishedAt: bm.savedAt,
      wordCount: 0,
      tags: [],
      priority: 'medium',
    })
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="font-serif text-step-3 font-semibold text-ink tracking-[-0.015em]">
          Saved
        </h1>
        {bookmarksList.length > 0 && (
          <p className="text-[13px] text-ink-3 mt-1" style={{ fontFamily: 'var(--font-sans)' }}>
            {bookmarksList.length} {bookmarksList.length === 1 ? 'story' : 'stories'} bookmarked
          </p>
        )}
      </div>

      {bookmarksList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <Bookmark size={40} className="text-ink-3" strokeWidth={1.5} />
          <p className="font-serif text-step-1 text-ink-2">No saved stories yet</p>
          <p className="text-[14px] text-ink-3 max-w-xs" style={{ fontFamily: 'var(--font-sans)' }}>
            Tap the bookmark icon on any story card to save it here.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {BUCKETS.map(bucket => {
            const items = grouped[bucket]
            if (!items.length) return null
            return (
              <section key={bucket} aria-label={bucket}>
                <h2
                  className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-3"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}
                >
                  {bucket}
                </h2>
                <div className="flex flex-col">
                  {items.map(bm => (
                    <article
                      key={bm.urlHash}
                      className="flex items-center gap-3 border-b border-rule py-2.5 hover:bg-surface-2 px-1 -mx-1 rounded transition-colors"
                      style={{ minHeight: '52px' }}
                      aria-label={bm.headline}
                    >
                      <span
                        className="type-kicker shrink-0 w-[5.5rem] text-right hidden sm:block"
                        style={{ color: `var(${CATEGORIES[bm.category].colorVar})` }}
                      >
                        {CATEGORIES[bm.category].label}
                      </span>
                      <a
                        href={bm.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 font-serif text-step-0 font-semibold text-ink hover:text-accent leading-snug"
                      >
                        {bm.headline}
                      </a>
                      <div className="font-mono text-[11px] text-ink-3 shrink-0 hidden sm:flex items-center gap-2">
                        <span>{bm.source}</span>
                        <a
                          href={bm.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Open in new tab"
                          className="hover:text-ink transition-colors"
                        >
                          <ExternalLink size={12} />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRemove(bm)}
                          aria-label="Remove bookmark"
                          aria-pressed
                          className="hover:text-accent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded"
                        >
                          <BookmarkCheck size={13} />
                        </button>
                      </div>
                    </article>
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
