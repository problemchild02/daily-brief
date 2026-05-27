import { useEffect, useState } from 'react'
import { Masthead } from './components/layout/Masthead'
import type { MetaJson } from './lib/types'

export default function App() {
  const [meta, setMeta] = useState<MetaJson | null>(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}src/data/meta.json`)
      .then(r => r.ok ? r.json() : null)
      .then((data: MetaJson | null) => { if (data) setMeta(data) })
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-canvas text-ink font-sans">
      <Masthead meta={meta} />

      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <p className="font-mono text-step--1 text-ink-3">
          Stories load in PR 1.4 — Card component.
        </p>
      </main>
    </div>
  )
}
