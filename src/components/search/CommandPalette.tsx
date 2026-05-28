import { useEffect, useState, useCallback } from 'react'
import { Command } from 'cmdk'
import { Search, Moon, Sun, RefreshCw, Settings, Clock } from 'lucide-react'
import { clsx } from 'clsx'
import { useTheme } from '../../hooks/useTheme'
import { dispatchWorkflow, readPat } from '../../lib/githubWorkflow'
import { CATEGORIES } from '../../lib/categories'
import { CATEGORY_KEYS } from '../../lib/types'
import type { Story, CategoryKey } from '../../lib/types'

const RECENT_KEY = 'daily-brief:recent-searches'
const MAX_RECENT = 5

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function pushRecent(term: string) {
  if (!term.trim()) return
  const prev = readRecent().filter(t => t !== term)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([term, ...prev].slice(0, MAX_RECENT)))
  } catch { /* ignore */ }
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  stories: Story[]
  onSettingsOpen: () => void
}

export function CommandPalette({ open, onClose, stories, onSettingsOpen }: CommandPaletteProps) {
  const { isDark, toggle: toggleTheme } = useTheme()
  const [recent, setRecent] = useState<string[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (open) {
      setRecent(readRecent())
      setSearch('')
    }
  }, [open])

  const run = useCallback((fn: () => void, term?: string) => {
    if (term) pushRecent(term)
    fn()
    onClose()
  }, [onClose])

  const groupedStories = CATEGORY_KEYS.reduce<Record<CategoryKey, Story[]>>((acc, key) => {
    acc[key] = stories.filter(s => s.section === key)
    return acc
  }, {} as Record<CategoryKey, Story[]>)

  return (
    <Command.Dialog
      open={open}
      onOpenChange={v => { if (!v) onClose() }}
      label="Command palette"
      loop
      overlayClassName="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
      contentClassName={clsx(
        'fixed left-[50%] top-[15%] z-50 -translate-x-[50%]',
        'w-[min(640px,calc(100vw-2rem))]',
        'bg-surface border border-rule rounded-2xl shadow-2xl overflow-hidden',
        'focus:outline-none',
      )}
    >
      {/* Input row */}
      <div className="flex items-center gap-3 px-4 border-b border-rule">
        <Search size={16} className="text-ink-3 shrink-0" aria-hidden />
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Search stories or type a command…"
          className="flex-1 py-4 bg-transparent text-ink text-[15px] placeholder:text-ink-3 outline-none"
          style={{ fontFamily: 'var(--font-sans)' }}
        />
        <kbd
          className="shrink-0 font-mono text-[11px] text-ink-3 bg-surface-2 border border-rule rounded px-1.5 py-0.5"
          aria-label="Press Escape to close"
        >
          esc
        </kbd>
      </div>

      <Command.List className="overflow-y-auto max-h-[min(420px,70vh)] py-2">
        <Command.Empty className="py-10 text-center text-ink-3" style={{ fontFamily: 'var(--font-sans)', fontSize: '14px' }}>
          No results found.
        </Command.Empty>

        {/* Quick actions */}
        <Command.Group heading="Quick actions">
          <PaletteItem
            icon={isDark ? Sun : Moon}
            label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            onSelect={() => run(toggleTheme)}
          />
          <PaletteItem
            icon={RefreshCw}
            label="Refresh feeds"
            onSelect={() => run(() => {
              const pat = readPat()
              if (pat) dispatchWorkflow(pat).catch(() => {})
            })}
          />
          <PaletteItem
            icon={Settings}
            label="Open settings"
            onSelect={() => run(onSettingsOpen)}
          />
        </Command.Group>

        {/* Recent searches — only shown when input is empty */}
        {recent.length > 0 && !search && (
          <Command.Group heading="Recent searches">
            {recent.map(term => (
              <PaletteItem
                key={term}
                icon={Clock}
                label={term}
                onSelect={() => run(() => setSearch(term))}
              />
            ))}
          </Command.Group>
        )}

        {/* Stories grouped by category */}
        {CATEGORY_KEYS.map(key => {
          const items = groupedStories[key]
          if (!items.length) return null
          return (
            <Command.Group key={key} heading={CATEGORIES[key].label}>
              {items.map(story => (
                <Command.Item
                  key={story.id}
                  value={`${story.headline} ${story.hook ?? ''} ${story.source} ${CATEGORIES[key].label}`}
                  onSelect={() => run(
                    () => window.open(story.sourceUrl, '_blank', 'noopener,noreferrer'),
                    story.headline,
                  )}
                  className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-surface-2 aria-selected:bg-surface-2"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0 mt-[6px]"
                    style={{ backgroundColor: `var(${CATEGORIES[key].colorVar})` }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[14px] font-medium text-ink leading-snug line-clamp-1"
                      style={{ fontFamily: 'var(--font-serif)' }}
                    >
                      {story.headline}
                    </p>
                    <p className="text-[11px] text-ink-3 mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
                      {story.source}
                    </p>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )
        })}
      </Command.List>
    </Command.Dialog>
  )
}

function PaletteItem({
  icon: Icon,
  label,
  onSelect,
}: {
  icon: import('lucide-react').LucideIcon
  label: string
  onSelect: () => void
}) {
  return (
    <Command.Item
      value={label}
      onSelect={onSelect}
      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-surface-2 aria-selected:bg-surface-2"
    >
      <Icon size={15} className="text-ink-3 shrink-0" />
      <span className="text-[13px] text-ink" style={{ fontFamily: 'var(--font-sans)' }}>
        {label}
      </span>
    </Command.Item>
  )
}
