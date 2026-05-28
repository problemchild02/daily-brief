import { useEffect, useState } from 'react'

export interface MarketQuote {
  display: string
  price: number
  prevClose: number
  change: number
  changePct: number
  decimals: number
}

interface MarketsJson {
  updatedAt: string
  quotes: MarketQuote[]
}

// Placeholder labels shown while the static file loads.
const PLACEHOLDERS: MarketQuote[] = [
  { display: 'SENSEX', price: 0, prevClose: 0, change: 0, changePct: 0, decimals: 0 },
  { display: 'NIFTY',  price: 0, prevClose: 0, change: 0, changePct: 0, decimals: 0 },
  { display: 'USDINR', price: 0, prevClose: 0, change: 0, changePct: 0, decimals: 2 },
  { display: 'BRENT',  price: 0, prevClose: 0, change: 0, changePct: 0, decimals: 2 },
]

const BASE = import.meta.env.BASE_URL

export function useMarkets() {
  const [quotes, setQuotes] = useState<MarketQuote[]>(PLACEHOLDERS)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState('')

  useEffect(() => {
    fetch(`${BASE}src/data/markets.json`)
      .then(r => r.ok ? r.json() : null)
      .then((d: MarketsJson | null) => {
        if (d?.quotes?.length) {
          // Preserve display order (SENSEX, NIFTY, USDINR, BRENT).
          const ordered = PLACEHOLDERS.map(p =>
            d.quotes.find(q => q.display === p.display) ?? p,
          )
          setQuotes(ordered)
          setUpdatedAt(d.updatedAt)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return { quotes, loading, updatedAt }
}
