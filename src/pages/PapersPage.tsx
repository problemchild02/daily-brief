import { FileText } from 'lucide-react'
import { Card } from '../components/cards/Card'
import { CATEGORY_KEYS } from '../lib/types'
import { useAppContext } from '../contexts/AppContext'
import type { CategoryKey, Story } from '../lib/types'

export function PapersPage() {
  const { feeds, bookmarks, toggleBookmark, onSettingsOpen } = useAppContext()

  const paperStories: Story[] = feeds
    ? (CATEGORY_KEYS as readonly CategoryKey[]).flatMap(k => feeds.sections[k] ?? []).filter(s => s.fromPaper)
    : []

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-step-3 font-semibold text-ink tracking-[-0.015em]">
            Papers
          </h1>
          <p className="text-[13px] text-ink-3 mt-1" style={{ fontFamily: 'var(--font-sans)' }}>
            Stories extracted from uploaded PDFs
          </p>
        </div>
        <button
          type="button"
          onClick={onSettingsOpen}
          className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-2 text-ink-2 hover:text-ink hover:bg-rule transition-colors"
          style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}
        >
          <FileText size={14} />
          Upload PDF
        </button>
      </div>

      {paperStories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <FileText size={40} className="text-ink-3" strokeWidth={1.5} />
          <p className="font-serif text-step-1 text-ink-2">No papers yet</p>
          <p className="text-[14px] text-ink-3 max-w-xs" style={{ fontFamily: 'var(--font-sans)' }}>
            Upload a PDF in Settings → Papers to extract and read its stories here.
          </p>
          <button
            type="button"
            onClick={onSettingsOpen}
            className="mt-2 px-5 py-2.5 rounded-lg bg-accent text-canvas text-[13px] font-medium hover:opacity-90 transition-opacity"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Open Settings
          </button>
        </div>
      ) : (
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}
        >
          {paperStories.map(story => (
            <Card
              key={story.id}
              story={story}
              isBookmarked={bookmarks.has(story.id)}
              onBookmark={toggleBookmark}
            />
          ))}
        </div>
      )}
    </div>
  )
}
