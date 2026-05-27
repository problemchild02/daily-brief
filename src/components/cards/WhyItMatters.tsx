import type { ReactNode } from 'react'

interface WhyItMattersProps {
  text: string
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

// Spec §7.9 — per-story practitioner brief.
// Border and kicker use --accent so this block reads as editorial annotation,
// not as a category-coded element (category colour lives in the kicker above).
export function WhyItMatters({ text }: WhyItMattersProps) {
  return (
    <aside
      style={{
        borderLeft: '3px solid var(--accent)',
        background: 'var(--surface-2)',
        padding: '18px 20px 18px 22px',
      }}
      className="rounded-r-lg"
    >
      <span
        className="block mb-2"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
          lineHeight: 1,
        }}
      >
        Why it matters
      </span>
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '14px',
          fontStyle: 'italic',
          lineHeight: 1.6,
          color: 'var(--ink-2)',
          margin: 0,
        }}
      >
        {renderItalics(text)}
      </p>
    </aside>
  )
}
