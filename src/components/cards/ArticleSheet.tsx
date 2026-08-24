import { useEffect, useRef, useState } from 'react'
import { X, ExternalLink, Bookmark, BookmarkCheck } from 'lucide-react'
import { clsx } from 'clsx'
import { motion, AnimatePresence } from 'motion/react'
import { CATEGORIES } from '../../lib/categories'
import { readingTime } from '../../lib/readingTime'
import { relativeTime } from '../../lib/dateFormat'
import type { CategoryKey, Story } from '../../lib/types'
import { WhyItMatters } from './WhyItMatters'
import { ArticleNote } from './ArticleNote'
import { isGenericWhyItMatters } from './genericFallbacks'

interface ArticleSheetProps {
  story: Story | null
  onClose: () => void
  isBookmarked?: boolean
  onBookmark?: () => void
}

// Same silently-collapse-on-failure image behavior as Card.tsx's CardImage.
function SheetImage({ imageUrl }: { imageUrl?: string }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  if (!imageUrl || failed) return null
  return (
    <motion.img
      src={imageUrl}
      alt=""
      loading="lazy"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      initial={false}
      animate={{ opacity: loaded ? 1 : 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="w-full rounded-xl object-cover aspect-video bg-surface-2 shadow-[0_6px_10px_-6px_rgba(0,0,0,0.35)]"
    />
  )
}

// In-app reading view — tapping a card opens this instead of redirecting straight
// to the source site (see App.tsx / Card.tsx / ListRow.tsx). It shows the same
// summary and Why It Matters content the card already carries, just in a focused,
// distraction-free layout, with one clearly-labeled button for when you actually do
// want to leave the app. Same sheet chrome/a11y pattern as SettingsSheet.
export function ArticleSheet({ story, onClose, isBookmarked, onBookmark }: ArticleSheetProps) {
  const open = story !== null
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => closeRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const el = panelRef.current
      if (!el) return
      const focusable = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!story) return null

  const {
    section, headline, hook, summary, contextNote, whyItMatters,
    imageUrl, source, sourceUrl, publishedAt, wordCount, kicker,
  } = story
  const category = section as CategoryKey
  const cat = CATEGORIES[category]
  const mins = readingTime(wordCount ?? 0)
  const timeAgo = relativeTime(publishedAt)

  const rawPractitionerBrief = whyItMatters ?? contextNote
  const practitionerBrief = isGenericWhyItMatters(rawPractitionerBrief) ? undefined : rawPractitionerBrief

  const dek = summary?.trim() ? summary : hook
  const hookTrimmed = hook?.trim() ?? ''
  const dekIsDuplicateHeadline = !summary?.trim() && (
    !hookTrimmed || hookTrimmed.toLowerCase().startsWith(headline.trim().toLowerCase())
  )

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex items-end sm:items-center justify-center',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      aria-hidden={!open}
    >
      <div
        className={clsx(
          'absolute inset-0 bg-black/40 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={headline}
        className={clsx(
          'relative z-10 bg-canvas border border-rule shadow-2xl',
          'w-full sm:max-w-xl',
          'rounded-t-2xl sm:rounded-2xl',
          'max-h-[90vh] overflow-y-auto',
          'transition-all duration-300',
          open ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0',
        )}
        style={{
          borderTopColor: `var(${cat.colorVar})`,
          borderTopWidth: '4px',
        }}
      >
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-rule" />
        </div>

        <div className="flex items-center justify-between px-6 pt-4 pb-2 sm:pt-5">
          <div className="type-kicker" style={{ color: `var(${cat.colorVar})` }}>
            {cat.label}
            {kicker && <span className="opacity-70"> · {kicker}</span>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close article"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 pb-8 flex flex-col gap-4">
          <SheetImage imageUrl={imageUrl} />

          <h2 className="font-display font-semibold leading-[1.15] tracking-[-0.015em] text-ink text-step-2">
            {headline}
          </h2>

          <footer className="font-mono text-[11px] text-ink-3 flex items-center gap-3">
            <span>{source}</span>
            {mins > 0 && <span>{mins} min read</span>}
            {publishedAt && <time dateTime={publishedAt}>{timeAgo}</time>}
          </footer>

          {!dekIsDuplicateHeadline && (
            <p className="font-reading text-[16px] leading-[1.7] text-ink-2">
              {dek}
            </p>
          )}

          {practitionerBrief && <WhyItMatters text={practitionerBrief} />}

          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-accent text-canvas font-mono text-[13px] font-medium py-3 hover:opacity-90 transition-opacity"
          >
            Read full story at {source}
            <ExternalLink size={14} />
          </a>

          {onBookmark && (
            <motion.button
              type="button"
              onClick={onBookmark}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this story'}
              aria-pressed={isBookmarked}
              className="flex items-center justify-center gap-2 rounded-xl border border-rule text-ink-2 font-mono text-[13px] font-medium py-2.5 hover:bg-surface-2 hover:text-ink transition-colors"
              whileTap={{ scale: 0.97 }}
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
              {isBookmarked ? 'Saved' : 'Save for later'}
            </motion.button>
          )}

          <div className="border-t border-rule pt-4">
            <ArticleNote
              storyId={story.id}
              sourceUrl={sourceUrl}
              storyTitle={headline}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
