import { useEffect, useState } from 'react'
import { Moon, Sun, Settings, Search, PanelLeft } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import type { MetaJson } from '../../lib/types'

// Spec §6.1: "Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric',
// month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })"
const IST_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
})

function todayIST(): string {
  return IST_FORMATTER.format(new Date())
}

interface MastheadProps {
  meta?: MetaJson | null
  onSettingsOpen?: () => void
  onSearchOpen?: () => void
  onSidebarToggle?: () => void
}

export function Masthead({ meta, onSettingsOpen, onSearchOpen, onSidebarToggle }: MastheadProps) {
  const { isDark, toggle } = useTheme()
  // Spec §6.1: "On scroll past 200px, masthead sticks to top with reduced height"
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 200)
    window.addEventListener('scroll', onScroll, { passive: true })
    // Initialise in case page loads already scrolled (e.g. browser restore)
    setCompact(window.scrollY > 200)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const editionLine = meta?.editionNumber
    ? `Vol. 1 · Edition ${meta.editionNumber}`
    : null

  return (
    <header
      className={[
        'sticky top-0 z-40 border-b border-rule bg-canvas transition-all',
        compact ? 'py-2' : 'py-5',
      ].join(' ')}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6">

        {/* Left: optional sidebar toggle (desktop only) + wordmark */}
        <div className="flex items-center gap-2 min-w-0">
          {onSidebarToggle && (
            <button
              type="button"
              onClick={onSidebarToggle}
              aria-label="Toggle sidebar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"
            >
              <PanelLeft size={18} />
            </button>
          )}
        {/* Wordmark + date line */}
        <div className="min-w-0">
          {/* Spec §6.1: "48–64px (fluid clamp), weight 700, tracking -0.025em"
              text-step-5 = clamp(3.052rem, 2.78rem + 1.36vw, 4.00rem) ≈ 48–64px
              Compact: "wordmark drops to 24px" */}
          <p
            className={[
              'font-serif font-bold tracking-[-0.025em] text-ink leading-none transition-all',
              compact ? 'text-[24px]' : 'text-step-5',
            ].join(' ')}
          >
            THE DAILY BRIEF
          </p>

          {/* Spec §6.1: "Date line uses Inter 13px Medium, ink-3 colour"
              "Compact: date line hides" */}
          {!compact && (
            <p className="font-sans font-medium text-[13px] text-ink-3 mt-1.5 truncate">
              {todayIST()}
              {editionLine && (
                <span className="ml-2 opacity-70">· {editionLine}</span>
              )}
            </p>
          )}
        </div>
        </div>

        {/* Spec §6.1: "Right side: theme toggle, settings (gear), search (slash) icons.
            All 44×44 touch targets." */}
        <nav aria-label="Display controls" className="flex items-center gap-1 shrink-0 ml-4">
          <button
            type="button"
            onClick={toggle}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <button
            type="button"
            onClick={onSearchOpen}
            aria-label="Search (press /)"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"
          >
            <Search size={18} />
          </button>

          <button
            type="button"
            onClick={onSettingsOpen}
            aria-label="Settings"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"
          >
            <Settings size={18} />
          </button>
        </nav>
      </div>
    </header>
  )
}
