import { useState } from 'react'
import { Bookmark, BookmarkCheck, ExternalLink } from 'lucide-react'
import { clsx } from 'clsx'
import { motion, AnimatePresence } from 'motion/react'
import { CATEGORIES } from '../../lib/categories'
import { readingTime } from '../../lib/readingTime'
import { relativeTime } from '../../lib/dateFormat'
import { useAppContext } from '../../contexts/AppContext'
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
//
// Deliberately a supporting element, not a hero, on standard cards: a story's real
// differentiated value is the Why It Matters analysis below, not a scraped stock/og
// photo of inconsistent quality. A small, fixed-size thumbnail beside the headline —
// at every breakpoint, mobile included — reads as "here's an exhibit" rather than
// "here's the point," so the eye lands on the headline and analysis first. The hero
// card (the single lead story of a section) is the one deliberate exception: it keeps
// a wider, more present crop, because it's earned that attention by actually being
// the top story — see the isHero branch below.
function CardImage({ imageUrl, isHero, onFail }: { imageUrl?: string; isHero: boolean; onFail: () => void }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  if (!imageUrl || failed) return null
  return (
    <motion.img
      src={imageUrl}
      alt=""
      loading="lazy"
      onLoad={() => setLoaded(true)}
      onError={() => { setFailed(true); onFail() }}
      initial={false}
      animate={{ opacity: loaded ? 1 : 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={clsx(
        'shrink-0 object-cover bg-surface-2 rounded-lg',
        isHero
          ? [
              // Hero keeps the wider, more present crop it's earned — edge-to-edge
              // bleed out of the card's own padding (the negative margins cancel
              // p-4/lg:p-8 exactly so the image lands flush with the card border).
              'w-full aspect-[21/9] rounded-t-2xl rounded-b-none',
              '-mx-4 -mt-4 w-[calc(100%+2rem)]',
              'md:mx-0 md:mt-0 md:w-full md:rounded-2xl',
              'lg:-mx-8 lg:-mt-8 lg:w-[calc(100%+4rem)] lg:rounded-t-2xl',
              'shadow-[0_6px_10px_-6px_rgba(0,0,0,0.35)]',
            ]
          : [
              // Standard cards: a small square "exhibit" thumbnail, same size and
              // position (beside the headline) at every breakpoint — no mobile bleed.
              'w-20 h-20 aspect-square',
            ],
      )}
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
  const [imageFailed, setImageFailed] = useState(false)

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

  // A card with no image, no real dek, and no practitioner brief is just a headline —
  // give it a purposeful CTA instead of leaving a blank gap that reads as broken.
  const isThinCard = (!imageUrl || imageFailed) && hookIsDuplicateHeadline && !practitionerBrief

  if (variant === 'list') {
    return <ListRow story={story} isBookmarked={isBookmarked} onBookmark={onBookmark} />
  }

  const isHero = variant === 'hero'
  const { onStoryOpen } = useAppContext()

  // Whole-card tap opens the story in-app (ArticleSheet) instead of redirecting to
  // the source site — redirecting on every tap was the actual complaint this design
  // fixes. The footer's small external-link icon and the thin-card CTA are the only
  // things that still go straight to the source: both are small, clearly-labeled,
  // deliberate actions rather than "I tapped the card and got yanked out of the app."
  // Every other clickable element inside the card (bookmark button, note textarea)
  // still stops the click from bubbling here, so nothing double-fires.
  const openSheet = () => onStoryOpen(story)
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <motion.article
      onClick={openSheet}
      className={clsx(
        'bg-surface border border-rule rounded-2xl flex flex-col gap-3 cursor-pointer',
        'p-4 md:p-6 lg:p-8',
        'shadow-[0_1px_2px_rgba(0,0,0,0.03)]',
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
      // A large positive rootMargin — not the -40px "trigger a bit early" margin this
      // used to have — means a card only stays un-animated if a scroll genuinely
      // skipped clean over an 800px-tall band around the viewport. Browser back/
      // forward, scroll restoration, and Ctrl+F can all jump the scroll position in
      // one frame with no intermediate paint, so the IntersectionObserver this is
      // built on never fires for anything it skipped over — once:true then leaves
      // that card at opacity 0 forever. global.css's scroll-behavior:smooth covers
      // in-app anchor jumps (the section nav pills); this margin is the fallback for
      // the jumps that smooth-scroll can't reach.
      viewport={{ once: true, margin: '800px 0px 800px 0px' }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1], delay: Math.min(idx, 4) * 0.04 }}
      whileHover={{ y: -3, transition: { type: 'spring', stiffness: 400, damping: 28 } }}
      whileTap={{ scale: 0.985, transition: { type: 'spring', stiffness: 500, damping: 30 } }}
    >
      {/* Image + kicker/headline/dek. Standard cards are row-layout (small image beside
          text) at every breakpoint, mobile included — see CardImage's comment for why.
          Hero stays column-layout throughout since its image is full-width. */}
      <div
        className={clsx(
          'flex gap-3',
          isHero ? 'flex-col' : 'flex-row items-start',
        )}
      >
        <CardImage imageUrl={imageUrl} isHero={isHero} onFail={() => setImageFailed(true)} />

        <div className="min-w-0 flex flex-1 flex-col gap-3">
          {/* Kicker — spec §7.2: "Inter 11px UPPERCASE, +0.08em, category colour" */}
          <KickerLabel category={category} kicker={kicker} />

          {/* Headline — spec §7.2:
              standard: 22px weight 600 leading-[1.15] tracking-[-0.015em]
              hero:     28px (text-step-2 ≈ 25–28px) */}
          <h3
            className={clsx(
              'font-display font-semibold leading-[1.15] tracking-[-0.015em] text-ink',
              isHero ? 'text-step-2' : 'text-[22px]',
            )}
          >
            <button
              type="button"
              onClick={e => { stop(e); openSheet() }}
              className="text-left hover:text-accent transition-colors"
            >
              {headline}
            </button>
          </h3>

          {/* Dek — reading stack, fluid line-height 1.7, capped to a comfortable
              measure at tablet+ (~65-75 characters per line).
              Use summary as primary (real content); hook is fallback for annotated editions. */}
          {!hookIsDuplicateHeadline && (
            <p
              className={clsx(
                'font-reading text-[15px] leading-[1.7] text-ink-2 md:max-w-prose',
                isHero && 'first-letter:font-display first-letter:text-[2.75rem] first-letter:font-semibold first-letter:leading-[0.8] first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:text-ink',
              )}
            >
              {dek}
            </p>
          )}

          {isThinCard && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={stop}
              className="inline-flex w-fit items-center gap-1.5 rounded-full border border-rule px-3 py-1.5 font-mono text-[12px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
            >
              Read full story at {source}
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>

      {/* Editorial caption — hero only; standard cards' thumbnail is too small
          beside the headline for a caption line to read as attached to it. */}
      {isHero && imageUrl && !imageFailed && (
        <p className="hidden lg:block -mt-2 font-reading text-[12px] italic text-ink-3">
          Photo via {source}
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
            onClick={stop}
            aria-label={`Open ${headline} in new tab`}
            className="hover:text-ink transition-colors"
          >
            <ExternalLink size={13} />
          </a>
          {onBookmark && (
            <motion.button
              type="button"
              onClick={e => { stop(e); onBookmark() }}
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

      {/* Spec §7.10 ArticleNote — visible on standard + hero, never on list.
          Wrapped so clicking/typing into the note field doesn't trigger openStory. */}
      <div onClick={stop}>
        <ArticleNote
          storyId={id}
          sourceUrl={sourceUrl}
          storyTitle={headline}
        />
      </div>
    </motion.article>
  )
}
