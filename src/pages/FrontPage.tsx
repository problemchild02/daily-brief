import { BriefingOfTheDay } from '../components/briefing/BriefingOfTheDay'
import { SectionDeck } from '../components/sections/SectionDeck'
import { CATEGORIES } from '../lib/categories'
import { CATEGORY_KEYS } from '../lib/types'
import { useAppContext } from '../contexts/AppContext'
import type { CategoryKey } from '../lib/types'

export function FrontPage() {
  const { feeds, meta, briefing, loading } = useAppContext()

  const orderedSections = (CATEGORY_KEYS as readonly CategoryKey[])
    .slice()
    .sort((a, b) => CATEGORIES[a].order - CATEGORIES[b].order)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Briefing hero */}
      <div
        className="grid mb-10"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}
      >
        <BriefingOfTheDay briefing={briefing} loading={loading} />
      </div>

      {/* Jump nav */}
      <nav
        aria-label="Jump to section"
        className="sticky top-14 z-30 -mx-4 sm:-mx-6 mb-8 flex gap-4 overflow-x-auto whitespace-nowrap border-b border-rule bg-canvas/90 px-4 py-2.5 backdrop-blur sm:px-6"
      >
        {orderedSections.map(section => {
          const cat = CATEGORIES[section]
          return (
            <a
              key={section}
              href={`#section-${section}`}
              className="flex items-center gap-1.5 shrink-0 text-ink-2 hover:text-ink transition-colors"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: `var(${cat.colorVar})`,
                }}
              />
              {cat.label}
            </a>
          )
        })}
      </nav>

      {/* All section decks */}
      <div className="space-y-14">
        {orderedSections.map((section: CategoryKey) => (
          <SectionDeck
            key={section}
            section={section}
            stories={feeds?.sections[section] ?? []}
            loading={loading}
            feedHealth={meta?.feedHealth}
            lastRefreshISO={meta?.lastRefreshISO}
          />
        ))}
      </div>
    </div>
  )
}
