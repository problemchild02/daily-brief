import { TrendingUp, TrendingDown } from 'lucide-react'
import { clsx } from 'clsx'
import { useMarkets } from '../../hooks/useMarkets'
import type { MarketQuote } from '../../hooks/useMarkets'

function formatPrice(price: number, decimals: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(price)
}

function QuoteChip({ quote, loading }: { quote: MarketQuote; loading: boolean }) {
  const hasData = quote.price > 0

  if (loading || !hasData) {
    return (
      <span className="flex items-center gap-1 shrink-0">
        <span className="text-ink-3">{quote.display}</span>
        <span className="text-ink-2 tabular-nums">—</span>
      </span>
    )
  }

  const up  = quote.changePct >= 0
  const pct = `${up ? '+' : ''}${quote.changePct.toFixed(2)}%`

  return (
    <span className="flex items-center gap-1 shrink-0">
      <span className="text-ink-3">{quote.display}</span>
      <span className="text-ink font-medium tabular-nums">
        {formatPrice(quote.price, quote.decimals)}
      </span>
      <span
        className={clsx(
          'flex items-center gap-0.5 tabular-nums',
          up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
        )}
      >
        {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
        {pct}
      </span>
    </span>
  )
}

interface MarketsTickerProps {
  className?: string
}

export function MarketsTicker({ className = '' }: MarketsTickerProps) {
  const { quotes, loading } = useMarkets()

  return (
    <div
      className={clsx('flex items-center gap-4 flex-wrap', className)}
      style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
      aria-label="Market indices"
    >
      {quotes.map((q, i) => (
        <span key={q?.display ?? i} className="flex items-center gap-4">
          {i > 0 && <span className="text-rule select-none" aria-hidden>·</span>}
          {q ? (
            <QuoteChip quote={q} loading={loading} />
          ) : (
            <span className="text-ink-3">—</span>
          )}
        </span>
      ))}
    </div>
  )
}
