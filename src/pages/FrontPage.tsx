import { BriefingOfTheDay } from '../components/briefing/BriefingOfTheDay'
import { SectionDeck } from '../components/sections/SectionDeck'
import { CATEGORIES } from '../lib/categories'
import { CATEGORY_KEYS } from '../lib/types'
import { useAppContext } from '../contexts/AppContext'
import type { CategoryKey } from '../lib/types'

export function FrontPage() {
  const { feeds, meta, briefing, loading, bookmarks, toggleBookmark } = useAppContext()

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

      {/* All section decks */}
      <div className="space-y-14">
        {orderedSections.map((section: CategoryKey) => (
          <SectionDeck
            key={section}
            section={section}
            stories={feeds?.sections[section] ?? []}
            loading={loading}
            bookmarks={bookmarks}
            onBookmark={toggleBookmark}
            feedHealth={meta?.feedHealth}
            lastRefreshISO={meta?.lastRefreshISO}
          />
        ))}
      </div>
    </div>
  )
}
