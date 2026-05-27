import { Bookmark, BookmarkCheck, ExternalLink } from 'lucide-react'
import { clsx } from 'clsx'
import { CATEGORIES } from '../../lib/categories'
import { readingTime } from '../../lib/readingTime'
import { relativeTime } from '../../lib/dateFormat'
import type { CategoryKey, Story } from '../../lib/types'
import { WhyItMatters } from './WhyItMatters'
import { ArticleNote } from './ArticleNote'

interface CardProps {
  story: Story
  variant?: 'standard' | 'hero' | 'list'
  isBookmarked?: boolean
  onBookmark?: (id: string) => void
}

function KickerLabel({ category, kicker }: { category: CategoryKey; kicker?: string }) {
  const cat = CATEGORIES[category]
  return (
    // Spec §7.2: "Inter 11px UPPERCASE, +0.08em, category colour"
    <div className="type-kicker mb-2.5" style={{ color: `var(${cat.colorVar})` }}>
      {cat.label}
      {kicker && <span className="opacity-70"> · {kicker}</span>}
    </div>
  )
}

// Spec §7.2 list variant: "single row 52px tall, headline + source + time + bookmark inline"
function ListRow({ story, isBookmarked, onBookmark }: {
  story: Story
  isBookmarked?: boolean
  onBookmark?: (id: string) => void
}) {
  const { id, section, headline, source, sourceUrl, publishedAt } = story
  const cat = CATEGORIES[section as CategoryKey]
  const timeAgo = relativeTime(publishedAt)

  return (
    <article
      className="flex items-center gap-3 border-b border-rule py-2.5 hover:bg-surface-2 px-1 -mx-1 rounded transition-colors"
      style={{ minHeight: '52px' }}
      aria-label={headline}
    >
      <div
        className="type-kicker shrink-0 w-20 text-right hidden sm:block"
        style={{ color: `var(${cat.colorVar})` }}
      >
        {cat.label}
      </div>

      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 font-serif text-step-0 font-semibold text-ink hover:text-accent leading-snug"
      >
        {headline}
      </a>

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
          aria-label={`Open ${headline} in new tab`}
          className="hover:text-ink transition-colors"
        >
          <ExternalLink size={12} />
        </a>
        {onBookmark && (
          <button
            type="button"
            onClick={() => onBookmark(id)}
            aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this story'}
            aria-pressed={isBookmarked}
            className="hover:text-accent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded"
          >
            {isBookmarked ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
          </button>
        )}
      </div>
    </article>
  )
}

export function Card({ story, variant = 'standard', isBookmarked, onBookmark }: CardProps) {
  const {
    id, section, headline, hook, summary,
    contextNote, whyItMatters,
    source, sourceUrl, publishedAt, wordCount, kicker,
  } = story
  const category = section as CategoryKey
  const cat = CATEGORIES[category]
  const mins = readingTime(wordCount ?? 0)
  const timeAgo = relativeTime(publishedAt)

  // Use whyItMatters (spec §7.9 name) with contextNote as fallback (existing data field).
  const practitionerBrief = whyItMatters ?? contextNote

  if (variant === 'list') {
    return <ListRow story={story} isBookmarked={isBookmarked} onBookmark={onBookmark} />
  }

  const isHero = variant === 'hero'

  return (
    <article
      className={clsx(
        'bg-surface border border-rule rounded-2xl p-6 flex flex-col gap-3',
        'hover:border-ink-3/40 transition-colors',
        isHero && 'md:col-span-2',
      )}
      style={{
        borderLeftColor: `var(${cat.colorVar})`,
        borderLeftWidth: '3px',
      }}
    >
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
          className="hover:text-accent transition-colors"
        >
          {headline}
        </a>
      </h3>

      {/* Dek — spec §7.2: "Newsreader Text 15px, line-height 1.45, ink-2" */}
      {hook && (
        <p className="font-serif text-[15px] leading-[1.45] text-ink-2 line-clamp-3">
          {hook}
        </p>
      )}

      {/* Hero: also show summary if it differs from hook */}
      {isHero && summary && summary !== hook && (
        <p className="font-serif text-[15px] leading-[1.45] text-ink-2 line-clamp-4">
          {summary}
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
            <button
              type="button"
              onClick={() => onBookmark(id)}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this story'}
              aria-pressed={isBookmarked}
              className="hover:text-accent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded"
            >
              {isBookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
            </button>
          )}
        </div>
      </footer>

      {/* Spec §7.10 ArticleNote — visible on standard + hero, never on list */}
      <ArticleNote
        storyId={id}
        sourceUrl={sourceUrl}
        storyTitle={headline}
      />
    </article>
  )
}
