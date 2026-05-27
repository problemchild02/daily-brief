import { CATEGORIES } from '../../lib/categories'
import { relativeTime } from '../../lib/dateFormat'
import type { CategoryKey, FeedHealthEntry } from '../../lib/types'

interface SectionHeaderProps {
  category: CategoryKey
  lastRefreshISO?: string
  feedHealth?: Record<string, FeedHealthEntry | 'ok' | 'error'>
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

export function SectionHeader({ category, lastRefreshISO, feedHealth }: SectionHeaderProps) {
  const cat = CATEGORIES[category]
  const hasFeedHealth = feedHealth && Object.keys(feedHealth).length > 0
  const { ok, total } = hasFeedHealth ? getHealthSummary(feedHealth!) : { ok: 0, total: 0 }
  const timeAgo = lastRefreshISO ? relativeTime(lastRefreshISO) : null

  return (
    <div className="flex items-baseline justify-between mb-5">
      <h2
        id={`section-${category}`}
        className="type-kicker"
        style={{ color: `var(${cat.colorVar})` }}
      >
        {cat.label}
      </h2>

      {(hasFeedHealth || timeAgo) && (
        <div
          style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}
          className="text-ink-3 flex items-center gap-2 shrink-0 ml-4"
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
    </div>
  )
}
