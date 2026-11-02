import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { haptic } from '../../lib/haptics'
import { setFeedback, useVote } from '../../hooks/useProfile'
import { usePreferences } from '../../hooks/usePreferences'
import { useAppContext } from '../../contexts/AppContext'
import type { Story } from '../../lib/types'

/** "Why this is here" plus More / Less like this. Votes stay on this device. */
export function StoryFeedback({ story, compact = false }: { story: Story; compact?: boolean }) {
  const vote = useVote(story.id)
  const { personalise } = usePreferences()
  const { rankedById } = useAppContext()
  const reasons = rankedById.get(story.id)?.reasons ?? []

  const btn = (dir: 1 | -1, label: string, Icon: typeof ThumbsUp) => {
    const on = vote === dir
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => { haptic(on ? 'soft' : 'select'); setFeedback(story, on ? null : dir) }}
        className="inline-flex items-center gap-1.5 rounded-full active:scale-95 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        style={{
          fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 500, padding: compact ? '4px 10px' : '6px 12px',
          background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--canvas)' : 'var(--ink-2)',
          boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--rule)',
        }}
      >
        <Icon size={12} /> {label}
      </button>
    )
  }

  return (
    <div className="ink mt-4 flex flex-col gap-2">
      {personalise && reasons.length > 0 && (
        <p className="font-mono text-[10px] text-ink-3">Here because: {reasons.join(' · ')}</p>
      )}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tell the paper what you think of this story">
        {btn(1, 'More like this', ThumbsUp)}
        {btn(-1, 'Less like this', ThumbsDown)}
      </div>
    </div>
  )
}
