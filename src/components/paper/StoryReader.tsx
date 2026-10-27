import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { X, ChevronLeft, ChevronRight, ExternalLink, Bookmark, BookmarkCheck } from 'lucide-react'
import { FlipBook, type FlipBookHandle } from './FlipBook'
import { PageShell } from './PaperPages'
import { WhyItMatters } from '../cards/WhyItMatters'
import { ArticleNote } from '../cards/ArticleNote'
import { useAppContext } from '../../contexts/AppContext'
import { usePreferences } from '../../hooks/usePreferences'
import { CATEGORIES } from '../../lib/categories'
import { readingTime } from '../../lib/readingTime'
import { relativeTime } from '../../lib/dateFormat'
import { storyDek, storyBrief } from '../../lib/storyText'
import type { Story } from '../../lib/types'

function ReaderImage({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return null
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      className="ink mb-4 w-full aspect-[16/9] rounded-sm object-cover bg-surface-2 select-none"
    />
  )
}

function StoryHead({ story }: { story: Story }) {
  const cat = CATEGORIES[story.section]
  const mins = readingTime(story.wordCount ?? 0)
  return (
    <>
      <p className="ink type-kicker" style={{ color: `var(${cat.colorVar})` }}>
        {cat.label}{story.kicker && <span className="opacity-70"> · {story.kicker}</span>}
      </p>
      <h2
        className="ink mt-2 font-display font-bold text-ink leading-[1.1] tracking-[-0.015em]"
        style={{ fontSize: 'calc(clamp(24px, 3.4vw, 34px) * var(--reading-scale))' }}
      >
        {story.headline}
      </h2>
      <p className="ink mt-3 mb-4 border-b border-rule pb-3 font-mono text-[11px] text-ink-3">
        {story.source} · {mins} min read
        {story.publishedAt && <> · <time dateTime={story.publishedAt}>{relativeTime(story.publishedAt)}</time></>}
      </p>
    </>
  )
}

function StoryBody({ story }: { story: Story }) {
  const dek = storyDek(story)
  return (
    <>
      <ReaderImage src={story.imageUrl} />
      {dek ? (
        <p className="ink reading-body text-ink-2 first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:font-display first-letter:text-[3.1em] first-letter:font-bold first-letter:leading-[0.8] first-letter:text-ink">
          {dek}
        </p>
      ) : (
        <p className="ink reading-body text-ink-3 italic">No summary for this one yet — the source has the full story.</p>
      )}
    </>
  )
}

function StoryActions({ story }: { story: Story }) {
  const { isBookmarked, toggleBookmark } = useAppContext()
  const saved = isBookmarked(story.sourceUrl)
  return (
    <div className="ink mt-5 flex flex-wrap gap-2">
      <a
        href={story.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 font-mono text-[12px] font-medium text-canvas hover:opacity-90 transition-opacity"
      >
        Read at {story.source} <ExternalLink size={12} />
      </a>
      <button
        type="button"
        onClick={() => toggleBookmark(story)}
        aria-pressed={saved}
        className="inline-flex items-center gap-1.5 rounded-full border border-rule px-4 py-2 font-mono text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
      >
        {saved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
        {saved ? 'Saved' : 'Save'}
      </button>
    </div>
  )
}

function StoryAnalysis({ story }: { story: Story }) {
  const brief = storyBrief(story)
  return (
    <>
      {brief && <div className="ink"><WhyItMatters text={brief} size="large" /></div>}
      <StoryActions story={story} />
      <div className="ink mt-5 border-t border-rule pt-4">
        <ArticleNote storyId={story.id} sourceUrl={story.sourceUrl} storyTitle={story.headline} />
      </div>
    </>
  )
}

interface StoryReaderProps {
  stories: Story[]
  story: Story
  onClose: () => void
}

export function StoryReader({ stories, story, onClose }: StoryReaderProps) {
  const { pageSound } = usePreferences()
  const bookRef = useRef<FlipBookHandle>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null)

  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setStage(prev => {
        const w = Math.round(r.width), h = Math.round(r.height)
        return prev && Math.abs(prev.w - w) < 8 && Math.abs(prev.h - h) < 8 ? prev : { w, h }
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const spread = !!stage && stage.w >= 760 && stage.w / stage.h >= 1.15
  const startStory = Math.max(0, stories.findIndex(s => s.id === story.id))
  const [storyIndex, setStoryIndex] = useState(startStory)
  const perStory = spread ? 2 : 1

  const pages = useMemo(() => stories.flatMap((s, i) => {
    const folio = (side: string) => (
      <>
        <span>{CATEGORIES[s.section].label}</span>
        <span>{side}</span>
        <span>{i + 1} / {stories.length}</span>
      </>
    )
    if (spread) {
      return [
        <PageShell key={`${s.id}-l`} folio={folio('')}><StoryHead story={s} /><StoryBody story={s} /></PageShell>,
        <PageShell key={`${s.id}-r`} folio={folio('Analysis')}><StoryAnalysis story={s} /></PageShell>,
      ]
    }
    return [
      <PageShell key={s.id} folio={folio('')}>
        <StoryHead story={s} />
        <StoryBody story={s} />
        <div className="mt-6"><StoryAnalysis story={s} /></div>
      </PageShell>,
    ]
  }), [stories, spread])

  useEffect(() => {
    const t = setTimeout(() => closeRef.current?.focus(), 60)
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey) }
  }, [onClose])

  const current = stories[storyIndex] ?? story
  const cat = CATEGORIES[current.section]

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Reading: ${current.headline}`}
      className="fixed inset-0 z-50 flex flex-col bg-canvas"
      style={{ backgroundImage: 'var(--paper-texture)' }}
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2 sm:px-5"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close story"
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 transition-colors"
        >
          <X size={20} />
        </button>
        <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-ink-3" aria-live="polite">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `var(${cat.colorVar})` }} />
          <span className="truncate uppercase tracking-[0.06em]">{cat.label}</span>
          <span className="tabular-nums">{storyIndex + 1} / {stories.length}</span>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => bookRef.current?.prev()}
            disabled={storyIndex === 0}
            aria-label="Previous story"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={() => bookRef.current?.next()}
            disabled={storyIndex >= stories.length - 1}
            aria-label="Next story"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className="min-h-0 flex-1 px-1 py-3 sm:px-6 sm:py-5"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {stage && (
          <FlipBook
            key={`${spread}`}
            ref={bookRef}
            pages={pages}
            spread={spread}
            startPage={storyIndex * perStory}
            onFlip={i => setStoryIndex(Math.floor(i / perStory))}
            sound={pageSound}
            label="Story reader"
          />
        )}
      </div>
    </motion.div>
  )
}
