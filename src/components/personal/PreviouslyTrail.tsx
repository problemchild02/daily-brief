import { ExternalLink } from 'lucide-react'
import { useAppContext } from '../../contexts/AppContext'
import { CATEGORIES } from '../../lib/categories'
import type { CategoryKey, Story } from '../../lib/types'

const DAY = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
const fmt = (iso: string) => DAY.format(new Date(`${iso}T12:00:00+05:30`))

/** "Previously…" — earlier reports of the same running story, oldest first. */
export function PreviouslyTrail({ story }: { story: Story }) {
  const { threads } = useAppContext()
  const items = threads[story.id]
  if (!items || items.length === 0) return null
  return (
    <aside className="ink mt-4 rounded-lg border border-rule bg-surface px-4 py-3" aria-label="Earlier coverage of this story">
      <p className="type-kicker text-ink-3">
        Developing · {items.length} earlier {items.length === 1 ? 'report' : 'reports'}
      </p>
      <ol className="mt-2 flex flex-col gap-2.5">
        {items.map(it => {
          const cat = CATEGORIES[it.section as CategoryKey]
          return (
            <li key={`${it.id}-${it.date}`} className="flex gap-3">
              <span className="w-12 shrink-0 pt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">{fmt(it.date)}</span>
              <span className="min-w-0 flex-1">
                <a
                  href={it.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-reading text-ink-2 hover:text-ink leading-snug"
                  style={{ fontSize: 'calc(13.5px * var(--reading-scale))' }}
                >
                  {it.headline} <ExternalLink size={10} className="inline align-baseline opacity-60" />
                </a>
                <span className="block font-mono text-[10px] text-ink-3">
                  {it.source}{cat ? ` · ${cat.label}` : ''}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
