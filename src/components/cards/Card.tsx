import { useState } from 'react'
import { Bookmark, BookmarkCheck, ExternalLink } from 'lucide-react'
import { clsx } from 'clsx'
import { motion, AnimatePresence } from 'motion/react'
import { CATEGORIES } from '../../lib/categories'
import { readingTime } from '../../lib/readingTime'
import { relativeTime } from '../../lib/dateFormat'
import type { CategoryKey, Story } from '../../lib/types'
import { WhyItMatters } from './WhyItMatters'
import { ArticleNote } from './ArticleNote'
import { ListRow } from './ListRow'
import { isGenericWhyItMatters } from './genericFallbacks'

interface CardProps {
  story: Story
  variant?: 'standard' | 'hero' | 'list'
  isBookmarked?: boolean
  onBookmark?: () => void  // pre-curried at the call site
  idx?: number
}

function KickerLabel({ category, kicker }: { category: CategoryKey; kicker?: string }) {
  const cat = CATEGORIES[category]
  return (
    <div className="type-kicker mb-2.5" style={{ color: `var(${cat.colorVar})` }}>
      {cat.label}
      {kicker && <span className="opacity-70"> · {kicker}</span>}
    </div>
  )
}

// Not every story has an image — RSS feeds (especially Google News) often don't provide
// one, and og:image scraping is best-effort. Silently collapse the slot on load failure
// rather than showing a broken-image icon.
function CardImage({ imageUrl, isHero }: { imageUrl?: string; isHero: boolean }) {
  const [failed, setFailed] = useState(false)
  if (!imageUrl || failed) return null
  return (
    <img
      src={imageUrl}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={clsx('w-full rounded-xl object-cover', isHero ? 'aspect-[21/9]' : 'aspect-[16/9]')}
    />
  )
}

export function Card({ story, variant = 'standard', isBookmarked, onBookmark, idx = 0 }: CardProps) {
  const {
    id, section, headline, hook, summary,
    contextNote, whyItMatters, imageUrl,
    source, sourceUrl, publishedAt, wordCount, kicker,
  } = story
  const category = section as CategoryKey
  const cat = CATEGORIES[category]
  const mins = readingTime(wordCount ?? 0)
  const timeAgo = relativeTime(publishedAt)

  // Use whyItMatters (spec §7.9 name) with contextNote as fallback (existing data field).
  // When AI enrichment fails, the backend fills this with a generic, section-wide
  // boilerplate sentence (see CONTEXT_TEMPLATES in scripts/fetch_stories.py) rather
  // than real per-story analysis — treat that the same as no brief at all.
  const rawPractitionerBrief = whyItMatters ?? contextNote
  const practitionerBrief = isGenericWhyItMatters(rawPractitionerBrief)
    ? undefined
    : rawPractitionerBrief

  // Summary/hook fallback: skip rendering if there's no real dek content — i.e. summary
  // is empty and hook is either empty or just the headline (common with RSS feeds,
  // especially Google News, whose <title> is "<headline> <source name>" with no body).
  const dek = summary?.trim() ? summary : hook
  const hookTrimmed = hook?.trim() ?? ''
  const headlineTrimmed = headline.trim()
  const hookIsDuplicateHeadline = !summary?.trim() && (
    !hookTrimmed || hookTrimmed.toLowerCase().startsWith(headlineTrimmed.toLowerCase())
  )

  if (variant === 'list') {
    return <ListRow story={story} isBookmarked={isBookmarked} onBookmark={onBookmark} />
  }

  const isHero = variant === 'hero'

  return (
    <motion.article
      className={clsx(
        'bg-surface border border-rule rounded-2xl p-6 flex flex-col gap-3',
        'hover:border-ink-3/40 transition-colors',
        isHero && 'md:col-span-2',
      )}
      style={{
        borderLeftColor: `var(${cat.colorVar})`,
        borderLeftWidth: isHero ? '5px' : '3px',
        ...(isHero ? { backgroundColor: `color-mix(in srgb, var(${cat.colorVar}) 4%, var(--surface))` } : {}),
      }}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1], delay: Math.min(idx, 4) * 0.04 }}
    >
      <CardImage imageUrl={imageUrl} isHero={isHero} />

      {/* Kicker — spec §7.2: "Inter 11px UPPERCASE, +0.08em, category colour" */}
      <KickerLabel category={category} kicker={kicker} />

      {/* Headline — spec §7.2:
          standard: 22px weight 600 leading-[1.15] tracking-[-0.015em]
          hero:     28px (text-step-2 ≈ 25–28px) */}
      <h3
        className={clsx(
          'font-serif font-semibold leading-[1.15] tracking-[-0.015em] text-ink',
          isHero ? 'text-step-2' : 'text-[22px]',
        )}
      >
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-accent visited:text-ink-3 transition-colors"
        >
          {headline}
        </a>
      </h3>

      {/* Dek — spec §7.2: "Newsreader Text 15px, line-height 1.45, ink-2"
          Use summary as primary (real content); hook is fallback for annotated editions. */}
      {!hookIsDuplicateHeadline && (
        <p
          className={clsx(
            'font-serif text-[15px] leading-[1.45] text-ink-2',
            isHero && 'first-letter:font-serif first-letter:text-[2.75rem] first-letter:font-semibold first-letter:leading-[0.8] first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:text-ink',
          )}
        >
          {dek}
        </p>
      )}

      {/* Spec §7.9 WhyItMatters — visible on standard + hero, never on list */}
      {practitionerBrief && <WhyItMatters text={practitionerBrief} />}

      {/* Meta row — spec §7.2: "JetBrains Mono 11px, ink-3" */}
      <footer className="font-mono text-[11px] text-ink-3 flex items-center justify-between mt-auto pt-1">
        <span>
          {source}
          {mins > 0 && <span aria-label={`${mins} minute read`}> · {mins} min</span>}
        </span>

        <div className="flex items-center gap-2">
          {publishedAt && <time dateTime={publishedAt}>{timeAgo}</time>}
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${headline} in new tab`}
            className="hover:text-ink transition-colors"
          >
            <ExternalLink size={13} />
          </a>
          {onBookmark && (
            <motion.button
              type="button"
              onClick={onBookmark}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this story'}
              aria-pressed={isBookmarked}
              className="hover:text-accent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded"
              whileTap={{ scale: 0.85 }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={String(isBookmarked)}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="inline-flex"
                >
                  {isBookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          )}
        </div>
      </footer>

      {/* Spec §7.10 ArticleNote — visible on standard + hero, never on list */}
      <ArticleNote
        storyId={id}
        sourceUrl={sourceUrl}
        storyTitle={headline}
      />
    </motion.article>
  )
}
