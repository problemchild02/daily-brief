import { LayoutGrid, List } from 'lucide-react'
import { CATEGORIES } from '../../lib/categories'
import { relativeTime } from '../../lib/dateFormat'
import type { CategoryKey, FeedHealthEntry } from '../../lib/types'

interface SectionHeaderProps {
  category: CategoryKey
  lastRefreshISO?: string
  feedHealth?: Record<string, FeedHealthEntry | 'ok' | 'error'>
  viewMode?: 'grid' | 'list'
  onToggleView?: () => void
}

function getHealthSummary(
  feedHealth: Record<string, FeedHealthEntry | 'ok' | 'error'>,
): { ok: number; total: number } {
  const entries = Object.values(feedHealth)
  const total = entries.length
  const ok = entries.filter(e =>
    typeof e === 'string' ? e === 'ok' : e.status === 'ok',
  ).length
  return { ok, total }
}

export function SectionHeader({
  category,
  lastRefreshISO,
  feedHealth,
  viewMode,
  onToggleView,
}: SectionHeaderProps) {
  const cat = CATEGORIES[category]
  const hasFeedHealth = feedHealth && Object.keys(feedHealth).length > 0
  const { ok, total } = hasFeedHealth ? getHealthSummary(feedHealth!) : { ok: 0, total: 0 }
  const timeAgo = lastRefreshISO ? relativeTime(lastRefreshISO) : null

  return (
    <div className="mb-5">
      <div className="flex items-center">
        <h2
          id={`section-${category}`}
          className="type-kicker shrink-0"
          style={{ color: `var(${cat.colorVar})`, fontFamily: 'var(--font-display)' }}
        >
          {cat.label}
        </h2>

        <div className="flex-1 border-t border-rule mx-3" aria-hidden />

        <div className="flex items-center gap-3 shrink-0">
          {(hasFeedHealth || timeAgo) && (
            <div
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}
              className="text-ink-3 flex items-center gap-2"
            >
              {hasFeedHealth && (
                <span
                  className={
                    ok < total
                      ? 'text-amber-500 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }
                >
                  {ok}/{total} sources
                </span>
              )}
              {timeAgo && (
                <>
                  {hasFeedHealth && <span aria-hidden>·</span>}
                  <time dateTime={lastRefreshISO}>{timeAgo}</time>
                </>
              )}
            </div>
          )}

          {onToggleView && viewMode && (
            <button
              type="button"
              onClick={onToggleView}
              aria-label={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
              className="text-ink-3 hover:text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded"
            >
              {viewMode === 'grid' ? <List size={14} /> : <LayoutGrid size={14} />}
            </button>
          )}
        </div>
      </div>

      <div
        className="mt-2 h-[2px] rounded-full"
        style={{ backgroundColor: `var(${cat.colorVar})`, opacity: 0.35 }}
        aria-hidden
      />
    </div>
  )
}
