// Loading skeleton that exactly mirrors BriefingOfTheDay's content structure.
export function BriefingSkeleton() {
  return (
    <div
      className="col-span-full bg-surface border border-rule rounded-2xl p-6 mb-2"
      aria-hidden
      aria-busy
    >
      {/* Title */}
      <div className="h-8 w-36 bg-surface-2 rounded-lg animate-pulse mb-4" />

      {/* Editor's summary — 2 lines */}
      <div className="h-[15px] bg-surface-2 rounded animate-pulse mb-1.5 w-full" />
      <div className="h-[15px] bg-surface-2 rounded animate-pulse mb-5 w-4/5" />

      {/* 5 bullets */}
      <div className="space-y-3">
        {([90, 82, 76, 88, 70] as const).map((w, i) => (
          <div key={i} className="flex gap-3 items-start">
            <div className="w-2 h-2 rounded-full bg-surface-2 shrink-0 mt-[7px] animate-pulse" />
            <div
              className="h-[17px] bg-surface-2 rounded animate-pulse"
              style={{ width: `${w}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
