import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Home, ChevronDown, ChevronRight,
  Search, Bookmark, FileText, Settings,
} from 'lucide-react'
import { clsx } from 'clsx'
import { CATEGORIES } from '../../lib/categories'
import { CATEGORY_KEYS } from '../../lib/types'
import { useAppContext } from '../../contexts/AppContext'
import type { CategoryKey } from '../../lib/types'



const navItem = (active: boolean) => clsx(
  'flex items-center gap-3 px-3 py-2.5 rounded-lg w-full transition-colors',
  active
    ? 'bg-accent/10 text-accent'
    : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
)

const NAV_STYLE = { fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 } as const

export function Sidebar() {
  const { onPaletteOpen, onSettingsOpen, sidebarCollapsed } = useAppContext()
  const [sectionsOpen, setSectionsOpen] = useState(true)

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 h-full w-[240px] z-30 bg-canvas border-r border-rule flex flex-col overflow-y-auto print:hidden',
        'transition-transform duration-300',
        sidebarCollapsed ? '-translate-x-full' : 'translate-x-0',
      )}
      aria-label="Primary navigation"
      aria-hidden={sidebarCollapsed}
    >
      {/* Logo */}
      <div className="px-4 py-5 border-b border-rule shrink-0">
        <p className="font-display font-bold text-[15px] tracking-[-0.01em] text-ink leading-tight">
          THE DAILY BRIEF
        </p>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {/* Front */}
        <NavLink
          to="/"
          end
          className={({ isActive }) => navItem(isActive)}
          style={NAV_STYLE}
        >
          <Home size={16} />
          Front
        </NavLink>

        {/* Sections with sub-items */}
        <div>
          <button
            type="button"
            onClick={() => setSectionsOpen(v => !v)}
            className="flex items-center justify-between px-3 py-2.5 rounded-lg w-full text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
            style={NAV_STYLE}
          >
            <span>Sections</span>
            {sectionsOpen
              ? <ChevronDown size={14} className="text-ink-3" />
              : <ChevronRight size={14} className="text-ink-3" />}
          </button>

          {sectionsOpen && (
            <div className="ml-4 pl-3 border-l border-rule space-y-0.5 mt-0.5">
              {(CATEGORY_KEYS as readonly CategoryKey[]).map(key => (
                <NavLink
                  key={key}
                  to={`/sections/${key}`}
                  className={({ isActive }) => clsx(
                    'flex items-center gap-2 px-2.5 py-2 rounded-md w-full transition-colors',
                    isActive ? 'text-accent' : 'text-ink-3 hover:text-ink',
                  )}
                  style={{ fontFamily: 'var(--font-sans)', fontSize: '12px' }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: `var(${CATEGORIES[key].colorVar})` }}
                  />
                  {CATEGORIES[key].label}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        {/* Search */}
        <button
          type="button"
          onClick={onPaletteOpen}
          className={navItem(false)}
          style={NAV_STYLE}
        >
          <Search size={16} />
          <span className="flex-1 text-left">Search</span>
          <kbd
            className="font-mono text-[10px] text-ink-3 bg-surface-2 border border-rule rounded px-1.5 py-0.5"
            aria-label="Keyboard shortcut Command K"
          >
            ⌘K
          </kbd>
        </button>

        {/* Saved */}
        <NavLink
          to="/saved"
          className={({ isActive }) => navItem(isActive)}
          style={NAV_STYLE}
        >
          <Bookmark size={16} />
          Saved
        </NavLink>

        {/* Papers */}
        <NavLink
          to="/papers"
          className={({ isActive }) => navItem(isActive)}
          style={NAV_STYLE}
        >
          <FileText size={16} />
          Papers
        </NavLink>
      </nav>

      {/* Settings pinned to bottom */}
      <div className="px-2 py-3 border-t border-rule shrink-0">
        <button
          type="button"
          onClick={onSettingsOpen}
          className={navItem(false)}
          style={NAV_STYLE}
        >
          <Settings size={16} />
          Settings
        </button>
      </div>
    </aside>
  )
}
