import { useState } from 'react'
import { Bookmark, BookmarkCheck, ExternalLink } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { CATEGORIES } from '../../lib/categories'
import { relativeTime } from '../../lib/dateFormat'
import type { CategoryKey, Story } from '../../lib/types'

// Spec §7.2 list variant: single row, 52 px tall, headline + source + time + bookmark inline.
// Rendered by SectionDeck when viewMode = 'list' (global density = 'dense' or per-section toggle).

interface ListRowProps {
  story: Story
  isBookmarked?: boolean
  onBookmark?: () => void  // pre-curried at the call site
}

// Same silently-collapse-on-failure behavior as CardImage in Card.tsx — most stories
// have no image (RSS rarely provides one), so this is an optional accent, not a fixture.
function RowThumbnail({ imageUrl }: { imageUrl?: string }) {
  const [failed, setFailed] = useState(false)
  if (!imageUrl || failed) return null
  return (
    <img
      src={imageUrl}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-9 w-9 shrink-0 rounded object-cover hidden sm:block"
    />
  )
}

export function ListRow({ story, isBookmarked, onBookmark }: ListRowProps) {
  const { section, headline, source, sourceUrl, publishedAt, imageUrl } = story
  const cat = CATEGORIES[section as CategoryKey]
  const timeAgo = relativeTime(publishedAt)

  return (
    <article
      className="flex items-center gap-3 border-b border-rule py-2.5 hover:bg-surface-2 pl-2 pr-1 md:pl-3 lg:pl-4 -mx-1 rounded transition-colors"
      style={{ minHeight: '52px', borderLeftColor: `var(${cat.colorVar})`, borderLeftWidth: '3px' }}
      aria-label={headline}
    >
      {/* Category kicker */}
      <span
        className="type-kicker shrink-0 w-[5.5rem] text-right hidden sm:block"
        style={{ color: `var(${cat.colorVar})` }}
      >
        {cat.label}
      </span>

      <RowThumbnail imageUrl={imageUrl} />

      {/* Headline */}
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 font-serif text-step-0 font-semibold text-ink hover:text-accent visited:text-ink-2 leading-snug"
      >
        {headline}
      </a>

      {/* Meta */}
      <div className="font-mono text-[11px] text-ink-3 shrink-0 hidden sm:flex items-center gap-2">
        <span>{source}</span>
        {timeAgo && (
          <>
            <span aria-hidden>·</span>
            <time dateTime={publishedAt}>{timeAgo}</time>
          </>
        )}
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open in new tab`}
          className="hover:text-ink transition-colors"
        >
          <ExternalLink size={12} />
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
                {isBookmarked ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        )}
      </div>
    </article>
  )
}
