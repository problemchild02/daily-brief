import { NavLink } from 'react-router-dom'
import { Home, LayoutGrid, Search, Bookmark, FileText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'
import { motion } from 'motion/react'
import { useAppContext } from '../../contexts/AppContext'

type TabDef =
  | { label: string; icon: LucideIcon; to: string; action?: never }
  | { label: string; icon: LucideIcon; to?: never; action: () => void }

export function TabBar() {
  const { onPaletteOpen } = useAppContext()

  const TABS: TabDef[] = [
    { label: 'Front',    icon: Home,        to: '/' },
    { label: 'Sections', icon: LayoutGrid,  to: '/sections/legal' },
    { label: 'Search',   icon: Search,      action: onPaletteOpen },
    { label: 'Saved',    icon: Bookmark,    to: '/saved' },
    { label: 'Papers',   icon: FileText,    to: '/papers' },
  ]

  const itemBase = clsx(
    'relative',
    'flex flex-1 flex-col items-center justify-center gap-1 py-2',
    'min-h-[44px] min-w-[44px] transition-colors',
  )

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-canvas border-t border-rule print:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary navigation"
    >
      <div className="flex">
        {TABS.map(tab => {
          const Icon = tab.icon
          if (tab.action) {
            return (
              <button
                key={tab.label}
                type="button"
                onClick={tab.action}
                aria-label={tab.label}
                className={clsx(itemBase, 'text-ink-3 hover:text-ink')}
                style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 500 }}
              >
                <Icon size={22} />
                <span>{tab.label}</span>
              </button>
            )
          }
          return (
            <NavLink
              key={tab.label}
              to={tab.to!}
              end={tab.to === '/'}
              aria-label={tab.label}
              className={({ isActive }) => clsx(
                itemBase,
                isActive ? 'text-accent' : 'text-ink-3 hover:text-ink',
              )}
              style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 500 }}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="tabbar-active"
                      className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent"
                      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                    />
                  )}
                  <Icon size={22} />
                  <span>{tab.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
