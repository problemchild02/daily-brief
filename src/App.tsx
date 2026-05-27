export default function App() {
  return (
    <div className="min-h-screen bg-canvas text-ink font-sans">
      <header className="border-b border-rule px-6 py-8">
        <h1 className="font-serif text-step-4 font-bold tracking-tight">
          The Daily Brief
        </h1>
        <p className="font-mono text-step--1 text-ink-3 mt-2">
          React scaffold — components coming in subsequent PRs
        </p>
      </header>

      <main className="px-6 py-12 max-w-measure mx-auto">
        <section className="space-y-4">
          <h2 className="type-kicker text-cat-legal">Design token check</h2>
          <div className="grid gap-3 font-mono text-step--1">
            <div className="flex gap-3 items-center">
              <span className="w-5 h-5 rounded bg-canvas border border-rule inline-block shrink-0" />
              <span className="text-ink-2">bg-canvas</span>
            </div>
            <div className="flex gap-3 items-center">
              <span className="w-5 h-5 rounded bg-surface border border-rule inline-block shrink-0" />
              <span className="text-ink-2">bg-surface</span>
            </div>
            <div className="flex gap-3 items-center">
              <span className="w-5 h-5 rounded bg-accent inline-block shrink-0" />
              <span className="text-ink-2">bg-accent</span>
            </div>
            <div className="flex gap-3 items-center">
              <span className="w-5 h-5 rounded bg-cat-legal inline-block shrink-0" />
              <span className="text-ink-2">bg-cat-legal</span>
            </div>
            <div className="flex gap-3 items-center">
              <span className="w-5 h-5 rounded bg-cat-business inline-block shrink-0" />
              <span className="text-ink-2">bg-cat-business</span>
            </div>
            <div className="flex gap-3 items-center">
              <span className="w-5 h-5 rounded bg-cat-tech inline-block shrink-0" />
              <span className="text-ink-2">bg-cat-tech</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
