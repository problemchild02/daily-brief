import { useEffect, useState } from 'react'
import { Moon, Sun, Settings, Search, PanelLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { useTheme } from '../../hooks/useTheme'
import type { MetaJson } from '../../lib/types'

// Shared tactile tap feedback for the icon buttons below — Apple-style spring
// compress rather than a linear fade, consistent with the card/bookmark taps.
const ICON_TAP = { scale: 0.88, transition: { type: 'spring' as const, stiffness: 500, damping: 30 } }

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
            <motion.button
              type="button"
              onClick={onSidebarToggle}
              aria-label="Toggle sidebar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"
              whileTap={ICON_TAP}
            >
              <PanelLeft size={18} />
            </motion.button>
          )}
        {/* Wordmark + date line */}
        <div className="min-w-0">
          {/* Spec §6.1: "48–64px (fluid clamp), weight 700, tracking -0.025em"
              text-step-5 = clamp(3.052rem, 2.78rem + 1.36vw, 4.00rem) ≈ 48–64px
              Compact: "wordmark drops to 24px" */}
          <p
            className={[
              'font-display font-bold tracking-[-0.025em] text-ink leading-none transition-all',
              compact ? 'text-[24px]' : 'text-step-5',
            ].join(' ')}
          >
            THE DAILY BRIEF
          </p>

          {/* Spec §6.1: "Date line uses Inter 13px Medium, ink-3 colour"
              "Compact: date line hides" — animated collapse (height+opacity)
              instead of an instant unmount, so it doesn't just pop out of existence. */}
          <AnimatePresence initial={false}>
            {!compact && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                className="overflow-hidden"
              >
                <p className="font-sans font-medium text-[13px] text-ink-3 mt-1.5 truncate">
                  {todayIST()}
                  {editionLine && (
                    <span className="ml-2 opacity-70">· {editionLine}</span>
                  )}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </div>

        {/* Spec §6.1: "Right side: theme toggle, settings (gear), search (slash) icons.
            All 44×44 touch targets." */}
        <nav aria-label="Display controls" className="flex items-center gap-1 shrink-0 ml-4">
          <motion.button
            type="button"
            onClick={toggle}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"
            whileTap={ICON_TAP}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={String(isDark)}
                initial={{ scale: 0.5, opacity: 0, rotate: -30 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.5, opacity: 0, rotate: 30 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="inline-flex"
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </motion.span>
            </AnimatePresence>
          </motion.button>

          <motion.button
            type="button"
            onClick={onSearchOpen}
            aria-label="Search (press /)"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"
            whileTap={ICON_TAP}
          >
            <Search size={18} />
          </motion.button>

          <motion.button
            type="button"
            onClick={onSettingsOpen}
            aria-label="Settings"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"
            whileTap={ICON_TAP}
          >
            <Settings size={18} />
          </motion.button>
        </nav>
      </div>
      <div className="h-px bg-ink/15" aria-hidden />
    </header>
  )
}
