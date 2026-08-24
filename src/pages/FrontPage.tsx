import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { clsx } from 'clsx'
import { BriefingOfTheDay } from '../components/briefing/BriefingOfTheDay'
import { SectionDeck } from '../components/sections/SectionDeck'
import { CATEGORIES } from '../lib/categories'
import { CATEGORY_KEYS } from '../lib/types'
import { useAppContext } from '../contexts/AppContext'
import type { CategoryKey } from '../lib/types'

export function FrontPage() {
  const { feeds, meta, briefing, loading } = useAppContext()
  const [activeSection, setActiveSection] = useState<CategoryKey | null>(null)

  const orderedSections = (CATEGORY_KEYS as readonly CategoryKey[])
    .slice()
    .sort((a, b) => CATEGORIES[a].order - CATEGORIES[b].order)

  // Scroll-spy: highlight whichever section the reader is actually at, so the pill
  // nav tracks reading position instead of sitting static — section headers exist in
  // the DOM as soon as SectionDeck mounts (even mid-load), so this doesn't need to
  // wait on `feeds`.
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length === 0) return
        const topMost = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
        )
        setActiveSection(topMost.target.id.replace('section-', '') as CategoryKey)
      },
      { rootMargin: '-120px 0px -70% 0px', threshold: 0 },
    )
    orderedSections.forEach(section => {
      const el = document.getElementById(`section-${section}`)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
      {/* Briefing hero */}
      <div
        className="grid mb-10"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}
      >
        <BriefingOfTheDay briefing={briefing} loading={loading} />
      </div>

      {/* Jump nav — Apple News-style pill chips; the active pill (by scroll position)
          slides between chips via a shared layoutId instead of just swapping color. */}
      <nav
        aria-label="Jump to section"
        className="sticky top-14 z-30 -mx-4 md:-mx-6 lg:-mx-8 mb-8 flex gap-2 overflow-x-auto whitespace-nowrap border-b border-rule bg-canvas/90 px-4 py-2.5 backdrop-blur md:px-6 lg:px-8"
      >
        {orderedSections.map(section => {
          const cat = CATEGORIES[section]
          const isActive = activeSection === section
          return (
            <a
              key={section}
              href={`#section-${section}`}
              className={clsx(
                'relative shrink-0 rounded-full px-3 py-1.5 transition-colors',
                isActive ? 'text-white' : 'text-ink-2 hover:text-ink',
              )}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {isActive && (
                <motion.span
                  layoutId="section-pill-active"
                  className="absolute inset-0 rounded-full"
                  style={{ background: `var(${cat.colorVar})` }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {!isActive && (
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
                )}
                {cat.label}
              </span>
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
