import Skeleton from 'react-loading-skeleton'
import 'react-loading-skeleton/dist/skeleton.css'

interface SkeletonCardProps {
  variant?: 'standard' | 'hero'
}

export function SkeletonCard({ variant = 'standard' }: SkeletonCardProps) {
  return (
    <div
      className={[
        'bg-surface border border-rule rounded-2xl p-6 flex flex-col gap-3',
        variant === 'hero' ? 'md:col-span-2' : '',
      ].join(' ')}
      aria-hidden
    >
      {/* Kicker */}
      <Skeleton width={80} height={10} />
      {/* Headline */}
      <Skeleton count={variant === 'hero' ? 2.5 : 2} height={22} />
      {/* Dek */}
      <Skeleton count={2} height={16} />
      {/* Footer */}
      <div className="flex justify-between mt-auto pt-1">
        <Skeleton width={100} height={11} />
        <Skeleton width={60} height={11} />
      </div>
    </div>
  )
}
