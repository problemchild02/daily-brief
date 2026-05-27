import { useEffect, useRef, useState } from 'react'
import { Moon, Sun, Settings, Search } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import type { MetaJson } from '../../lib/types'

const IST_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
})

function todayIST() {
  return IST_FORMATTER.format(new Date())
}

interface MastheadProps {
  meta?: MetaJson | null
  onSettingsOpen?: () => void
  onSearchOpen?: () => void
}

export function Masthead({ meta, onSettingsOpen, onSearchOpen }: MastheadProps) {
  const { isDark, toggle } = useTheme()
  const [compact, setCompact] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => setCompact(!entry.isIntersecting),
      { threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  const editionLine = meta?.editionNumber
    ? `Vol. 1 · Edition ${meta.editionNumber}`
    : null

  return (
    <>
      {/* Intersection sentinel — sits just above the masthead */}
      <div ref={sentinelRef} aria-hidden className="h-px" />

      <header
        className={[
          'sticky top-0 z-40 border-b border-rule bg-canvas transition-all',
          compact ? 'py-2' : 'py-5',
        ].join(' ')}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Wordmark */}
          <div className="min-w-0">
            <p
              className={[
                'font-serif font-bold tracking-[-0.025em] text-ink leading-none transition-all',
                compact ? 'text-step-1' : 'text-step-4',
              ].join(' ')}
            >
              THE DAILY BRIEF
            </p>

            {!compact && (
              <p className="font-mono text-step--1 text-ink-3 mt-1.5 truncate">
                {todayIST()}
                {editionLine && (
                  <span className="ml-2 opacity-70">· {editionLine}</span>
                )}
              </p>
            )}
          </div>

          {/* Action icons */}
          <nav aria-label="Display controls" className="flex items-center gap-1 shrink-0 ml-4">
            <button
              type="button"
              onClick={toggle}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {onSearchOpen && (
              <button
                type="button"
                onClick={onSearchOpen}
                aria-label="Search (press /)"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"
              >
                <Search size={18} />
              </button>
            )}

            {onSettingsOpen && (
              <button
                type="button"
                onClick={onSettingsOpen}
                aria-label="Settings"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"
              >
                <Settings size={18} />
              </button>
            )}
          </nav>
        </div>
      </header>
    </>
  )
}
