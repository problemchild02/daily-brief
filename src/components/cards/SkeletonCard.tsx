import Skeleton, { SkeletonTheme } from 'react-loading-skeleton'
import 'react-loading-skeleton/dist/skeleton.css'

interface SkeletonCardProps {
  variant?: 'standard' | 'hero'
}

export function SkeletonCard({ variant = 'standard' }: SkeletonCardProps) {
  const isHero = variant === 'hero'
  return (
    <div
      className={[
        'bg-surface border border-rule rounded-2xl p-4 md:p-6 lg:p-8 flex flex-col gap-3',
        'shadow-[0_1px_2px_rgba(0,0,0,0.03)]',
        isHero ? 'md:col-span-2' : '',
      ].join(' ')}
      aria-hidden
    >
      <SkeletonTheme baseColor="var(--surface-2)" highlightColor="var(--rule)">
        {/* Kicker — 11px */}
        <Skeleton width={80} height={11} />
        {/* Headline — 22px standard / 28px hero */}
        <Skeleton count={2} height={isHero ? 28 : 22} />
        {/* Dek — 15px */}
        <Skeleton count={isHero ? 3 : 2} height={15} />
        {/* WhyItMatters callout */}
        <Skeleton height={64} borderRadius={8} />
        {/* Footer */}
        <div className="flex justify-between mt-auto pt-1">
          <Skeleton width={110} height={11} />
          <Skeleton width={56} height={11} />
        </div>
      </SkeletonTheme>
    </div>
  )
}

export function SkeletonListRow() {
  return (
    <div
      className="flex items-center gap-3 border-b border-rule py-2.5 px-1"
      style={{ minHeight: '52px' }}
      aria-hidden
    >
      <div className="w-[88px] h-[11px] bg-surface-2 rounded animate-pulse shrink-0 hidden sm:block" />
      <div className="h-[16px] bg-surface-2 rounded animate-pulse flex-1" />
      <div className="w-[120px] h-[11px] bg-surface-2 rounded animate-pulse shrink-0 hidden sm:block" />
    </div>
  )
}
