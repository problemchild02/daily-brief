import { useState, type CSSProperties } from 'react'
import { CATEGORIES } from '../../lib/categories'
import type { Story } from '../../lib/types'

/**
 * A story's picture — or, when it has none (about one in five from Google News
 * and some publishers), or it fails to load, designed artwork in the section's
 * colour instead of a hole in the page: a tinted gradient with newsprint
 * hatching, the section's initial set large, and the source's name. Every story
 * on a page therefore has a visual, and the layout never depends on whether a
 * photo arrived.
 */
export function StoryArt({ story, className = '', style, variant = 'hero' }: {
  story: Pick<Story, 'imageUrl' | 'section' | 'source' | 'headline'>
  className?: string
  style?: CSSProperties
  /** 'thumb' shows just the initial; 'hero' adds the source line. */
  variant?: 'hero' | 'thumb'
}) {
  const [failed, setFailed] = useState(false)
  if (story.imageUrl && !failed) {
    return (
      <img
        src={story.imageUrl}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setFailed(true)}
        className={['object-cover bg-surface-2 select-none', className].join(' ')}
        style={style}
      />
    )
  }
  return <StoryArtFallback story={story} className={className} style={style} variant={variant} />
}

/** The artwork on its own — also what the measuring pass renders for every image. */
export function StoryArtFallback({ story, className = '', style, variant = 'hero' }: {
  story: Pick<Story, 'section' | 'source'>
  className?: string
  style?: CSSProperties
  variant?: 'hero' | 'thumb'
}) {
  const cat = CATEGORIES[story.section]
  const c = `var(${cat.colorVar})`
  return (
    <div
      aria-hidden
      className={['relative overflow-hidden select-none', className].join(' ')}
      style={{
        background:
          `repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in srgb, ${c} 9%, transparent) 7px 8px),` +
          `linear-gradient(145deg, color-mix(in srgb, ${c} 26%, var(--page)) 0%, color-mix(in srgb, ${c} 10%, var(--page)) 100%)`,
        ...style,
      }}
    >
      <span
        className="absolute font-display font-bold leading-none"
        style={{
          color: `color-mix(in srgb, ${c} 38%, transparent)`,
          fontSize: variant === 'thumb' ? '2.6rem' : '7rem',
          left: variant === 'thumb' ? '50%' : '5%',
          top: variant === 'thumb' ? '50%' : '50%',
          transform: variant === 'thumb' ? 'translate(-50%, -50%)' : 'translateY(-50%)',
        }}
      >
        {cat.label.charAt(0)}
      </span>
      {variant === 'hero' && (
        <span
          className="absolute bottom-2.5 right-3 max-w-[70%] truncate font-mono text-[10px] uppercase tracking-[0.12em]"
          style={{ color: c }}
        >
          {story.source}
        </span>
      )}
    </div>
  )
}
