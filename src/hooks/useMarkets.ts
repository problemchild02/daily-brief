import { useEffect, useRef, useState } from 'react'

export interface MarketQuote {
  display: string
  price: number
  prevClose: number
  change: number        // absolute
  changePct: number     // percentage
  decimals: number
  error?: boolean
}

const SYMBOLS = [
  { display: 'SENSEX', symbol: '^BSESN', decimals: 0 },
  { display: 'NIFTY',  symbol: '^NSEI',  decimals: 0 },
  { display: 'USDINR', symbol: 'INR=X',  decimals: 2 },
  { display: 'BRENT',  symbol: 'BZ=F',   decimals: 2 },
] as const

function isNseOpen(): boolean {
  const now = new Date()
  const day = now.getUTCDay()
  if (day === 0 || day === 6) return false  // weekend

  // IST = UTC + 5:30
  const istTotalMinutes =
    now.getUTCHours() * 60 + now.getUTCMinutes() + 5 * 60 + 30
  const normalized = istTotalMinutes % (24 * 60)
  const open  = 9 * 60 + 15   // 09:15
  const close = 15 * 60 + 30  // 15:30
  return normalized >= open && normalized <= close
}

async function fetchQuote(symbol: string, decimals: number): Promise<MarketQuote | null> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const json = await r.json()
    const meta = json?.chart?.result?.[0]?.meta
    if (!meta) return null
    const price     = meta.regularMarketPrice as number
    const prevClose = (meta.chartPreviousClose ?? meta.previousClose) as number
    const change    = price - prevClose
    const changePct = (change / prevClose) * 100
    const display   = SYMBOLS.find(s => s.symbol === symbol)?.display ?? symbol
    return { display, price, prevClose, change, changePct, decimals, error: false }
  } catch {
    return null
  }
}

async function fetchAll(): Promise<(MarketQuote | null)[]> {
  return Promise.allSettled(
    SYMBOLS.map(s => fetchQuote(s.symbol, s.decimals)),
  ).then(results =>
    results.map(r => (r.status === 'fulfilled' ? r.value : null)),
  )
}

export function useMarkets() {
  const [quotes, setQuotes] = useState<(MarketQuote | null)[] | null>(null)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    fetchAll().then(q => { setQuotes(q); setLoading(false) })

    // 5-min polling only during NSE hours
    intervalRef.current = setInterval(() => {
      if (isNseOpen()) fetchAll().then(setQuotes)
    }, 5 * 60 * 1000)

    return () => clearInterval(intervalRef.current)
  }, [])

  return { quotes, loading, isMarketOpen: isNseOpen() }
}
