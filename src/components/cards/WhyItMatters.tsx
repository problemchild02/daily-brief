import type { ReactNode } from 'react'

interface WhyItMattersProps {
  text: string
  /** Hero/reading-view contexts want a slightly larger, roomier treatment. */
  size?: 'card' | 'large'
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

// fetch_stories.py's prompt asks for "(1) ... (2) ... (3) ..." numbered practical
// implications inline within the analysis paragraph — see IMPLEMENTATION_SPEC.md
// §7.9 and the prompt in fetch_stories.py's ai_enrich_story(). Burying those in a
// run-on paragraph is exactly the "read everything to find the one actionable line"
// problem this product is supposed to solve for a reader who's scanning before
// their day starts. Split them into a real list instead — the intro sentence(s)
// stay as prose (the background a reader needs), each numbered implication becomes
// its own scannable line.
interface ParsedBrief {
  intro: string
  items: string[]
}

function parseBrief(text: string): ParsedBrief {
  const parts = text.split(/\s*\((\d)\)\s*/)
  // split() with a capturing group interleaves: [intro, "1", item1, "2", item2, ...]
  if (parts.length < 3) return { intro: text, items: [] }
  const intro = parts[0].trim()
  const items: string[] = []
  for (let i = 1; i < parts.length; i += 2) {
    const item = parts[i + 1]?.trim()
    if (item) items.push(item.replace(/\s+$/, ''))
  }
  return { intro, items }
}

export function WhyItMatters({ text, size = 'card' }: WhyItMattersProps) {
  const { intro, items } = parseBrief(text)
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
        Why it matters
      </span>

      {intro && (
        <p
          className={large ? 'max-w-prose' : 'md:max-w-prose'}
          style={{
            fontFamily: 'var(--font-reading)',
            fontSize: large ? '16px' : '14px',
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
                  fontSize: large ? '15.5px' : '13.5px',
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
