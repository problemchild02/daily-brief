import { useCallback, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import { CATEGORIES } from '../../lib/categories'
import { relativeTime } from '../../lib/dateFormat'
import { readPat, dispatchWorkflow } from '../../lib/githubWorkflow'
import { BriefingSkeleton } from './BriefingSkeleton'
import type { BriefingJson, CategoryKey } from '../../lib/types'

interface BriefingOfTheDayProps {
  briefing: BriefingJson | null
  loading?: boolean
}

function CategoryDot({ category }: { category: CategoryKey }) {
  const cat = CATEGORIES[category]
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: `var(${cat.colorVar})`,
        flexShrink: 0,
        marginTop: 8,
      }}
      aria-hidden
    />
  )
}

type RegenerateStatus = 'idle' | 'running' | 'ok' | 'error'

export function BriefingOfTheDay({ briefing, loading = false }: BriefingOfTheDayProps) {
  const [regenStatus, setRegenStatus] = useState<RegenerateStatus>('idle')
  const [regenError, setRegenError] = useState('')
  const hasPat = Boolean(readPat())
  const hasBullets = briefing && briefing.bullets.length > 0

  const handleRegenerate = useCallback(async () => {
    const pat = readPat()
    if (!pat) return
    setRegenStatus('running')
    setRegenError('')
    const result = await dispatchWorkflow(pat)
    if (result.ok) {
      setRegenStatus('ok')
    } else {
      setRegenStatus('error')
      setRegenError(result.error ?? 'Unknown error')
    }
  }, [])

  if (loading) {
    return <BriefingSkeleton />
  }

  // Empty state — briefing hasn't been generated yet
  if (!hasBullets) {
    return (
      <div className="col-span-full bg-surface border border-rule rounded-2xl p-6 mb-2">
        <div className="flex items-center justify-between mb-1">
          <h2
            className="font-serif font-semibold text-ink"
            style={{ fontSize: '28px', letterSpacing: '-0.02em', lineHeight: 1.1 }}
          >
            Today's Brief
          </h2>
        </div>
        <p className="font-mono text-[12px] text-ink-3 mt-2">
          No briefing yet.{hasPat ? ' Click Regenerate to create one.' : ' Run the refresh workflow to generate today’s briefing.'}
        </p>
        {hasPat && (
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenStatus === 'running'}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 text-ink-2 hover:text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
          >
            <RefreshCw size={12} className={regenStatus === 'running' ? 'animate-spin' : ''} />
            {regenStatus === 'running' ? 'Triggering…' : 'Regenerate'}
          </button>
        )}
      </div>
    )
  }

  const timeAgo = briefing.generatedAt ? relativeTime(briefing.generatedAt) : null

  return (
    <div className="col-span-full bg-surface border border-rule rounded-2xl p-6 mb-2">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <h2
            className="font-serif font-semibold text-ink"
            style={{ fontSize: '28px', letterSpacing: '-0.02em', lineHeight: 1.1 }}
          >
            Today's Brief
          </h2>
          {timeAgo && (
            <time
              dateTime={briefing.generatedAt}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-3)' }}
            >
              {timeAgo}
            </time>
          )}
        </div>

        {hasPat && (
          <div className="flex items-center gap-2 shrink-0">
            {regenStatus === 'ok' && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-3)' }}>
                Triggered ✓
              </span>
            )}
            {regenStatus === 'error' && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#c0392b' }}>
                {regenError || 'Failed'}
              </span>
            )}
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenStatus === 'running'}
              aria-label="Regenerate briefing"
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
                regenStatus === 'running'
                  ? 'bg-surface-2 text-ink-3 cursor-not-allowed'
                  : 'bg-surface-2 text-ink-2 hover:text-ink hover:bg-surface-2',
              )}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
            >
              <RefreshCw size={12} className={regenStatus === 'running' ? 'animate-spin' : ''} />
              Regenerate
            </button>
          </div>
        )}
      </div>

      {/* Editor's summary */}
      {briefing.summary && (
        <p
          className="mb-4 text-ink-2"
          style={{ fontFamily: 'var(--font-serif)', fontSize: '15px', lineHeight: 1.5 }}
        >
          {briefing.summary}
        </p>
      )}

      {/* Bullets */}
      <ol className="space-y-3">
        {briefing.bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-3">
            <CategoryDot category={bullet.category as CategoryKey} />
            <a
              href={bullet.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink hover:text-accent transition-colors leading-snug"
              style={{ fontFamily: 'var(--font-serif)', fontSize: '17px' }}
            >
              <span className="mr-2" style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 600, color: 'var(--accent)', lineHeight: 1 }}>
                {i + 1}.
              </span>
              {bullet.text}
            </a>
          </li>
        ))}
      </ol>
    </div>
  )
}
