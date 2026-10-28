import type { ReactNode } from 'react'
import { splitImplications } from '../../lib/storyText'

interface WhyItMattersProps {
  text: string
  /** Hero/reading-view contexts want a slightly larger, roomier treatment. */
  size?: 'card' | 'large'
  /** Heading. "Key points" for notes extracted from the article rather than analysed. */
  label?: string
}

// Converts *case names* → <em>case names</em> inline, preserving surrounding text.
function renderItalics(text: string): ReactNode {
  const parts = text.split(/(\*[^*]+\*)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('*') && part.endsWith('*') && part.length > 2
          ? <em key={i}>{part.slice(1, -1)}</em>
          : part
      )}
    </>
  )
}

// The numbered implications are split into a real list — see splitImplications()
// in lib/storyText.ts for the rules and why burying them in a run-on paragraph
// defeats the point of a brief someone scans before their day starts.
export function WhyItMatters({ text, size = 'card', label = 'Why it matters' }: WhyItMattersProps) {
  const { intro, items } = splitImplications(text)
  const large = size === 'large'

  return (
    <aside
      style={{ borderLeft: `3px solid var(--accent)`, background: 'var(--surface-2)' }}
      className={large ? 'rounded-r-xl p-6' : 'rounded-r-lg p-4 md:p-5'}
    >
      <span
        className="block mb-2.5"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: large ? '12px' : '11px',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
          lineHeight: 1,
        }}
      >
        {label}
      </span>

      {intro && (
        <p
          className={large ? 'max-w-prose' : 'md:max-w-prose'}
          style={{
            fontFamily: 'var(--font-reading)',
            fontSize: `calc(${large ? 16 : 14}px * var(--reading-scale, 1))`,
            lineHeight: 1.7,
            color: 'var(--ink-2)',
            margin: items.length ? '0 0 10px' : 0,
          }}
        >
          {renderItalics(intro)}
        </p>
      )}

      {items.length > 0 && (
        <ol className="flex flex-col gap-2" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {items.map((item, i) => (
            <li key={i} className="flex gap-2.5 items-baseline">
              <span
                aria-hidden
                className="shrink-0 flex items-center justify-center rounded-full"
                style={{
                  width: large ? '20px' : '18px',
                  height: large ? '20px' : '18px',
                  background: 'var(--accent)',
                  color: 'var(--canvas)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: large ? '11px' : '10px',
                  fontWeight: 600,
                  lineHeight: 1,
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-reading)',
                  fontSize: `calc(${large ? 15.5 : 13.5}px * var(--reading-scale, 1))`,
                  lineHeight: 1.55,
                  color: 'var(--ink)',
                }}
              >
                {renderItalics(item)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
