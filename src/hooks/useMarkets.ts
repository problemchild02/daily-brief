import { useEffect, useRef, useState } from 'react'

export interface MarketQuote {
  display: string
  price: number
  prevClose: number
  change: number
  changePct: number
  decimals: number
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
  if (day === 0 || day === 6) return false
  const istMinutes = now.getUTCHours() * 60 + now.getUTCMinutes() + 5 * 60 + 30
  const t = istMinutes % (24 * 60)
  return t >= 9 * 60 + 15 && t <= 15 * 60 + 30
}

async function tryFetch(url: string): Promise<Response | null> {
  try {
    const r = await fetch(url)
    return r.ok ? r : null
  } catch {
    return null
  }
}

async function fetchQuote(symbol: string, decimals: number): Promise<MarketQuote | null> {
  // Yahoo Finance requires literal ^ and = characters in the path — do NOT use encodeURIComponent.
  const yahooUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`
  // CORS proxy fallback for browsers/shields that block cross-origin Yahoo Finance requests.
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`

  for (const url of [yahooUrl, proxyUrl]) {
    const r = await tryFetch(url)
    if (!r) continue
    try {
      const json = await r.json()
      const meta = json?.chart?.result?.[0]?.meta
      if (!meta?.regularMarketPrice) continue
      const price     = meta.regularMarketPrice as number
      const prevClose = (meta.chartPreviousClose ?? meta.previousClose) as number
      if (!prevClose) continue
      const change    = price - prevClose
      const changePct = (change / prevClose) * 100
      const display   = SYMBOLS.find(s => s.symbol === symbol)?.display ?? symbol
      return { display, price, prevClose, change, changePct, decimals }
    } catch {
      continue
    }
  }
  return null
}

async function fetchAll(): Promise<(MarketQuote | null)[]> {
  const results = await Promise.allSettled(
    SYMBOLS.map(s => fetchQuote(s.symbol, s.decimals)),
  )
  return results.map(r => (r.status === 'fulfilled' ? r.value : null))
}

export function useMarkets() {
  // Initialise with placeholder shape so ticker always renders labels.
  const [quotes, setQuotes] = useState<(MarketQuote | null)[]>(
    SYMBOLS.map(s => ({ display: s.display, price: 0, prevClose: 0, change: 0, changePct: 0, decimals: s.decimals })),
  )
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    fetchAll().then(q => { setQuotes(q); setLoading(false) })

    intervalRef.current = setInterval(() => {
      if (isNseOpen()) fetchAll().then(setQuotes)
    }, 5 * 60 * 1000)

    return () => clearInterval(intervalRef.current)
  }, [])

  return { quotes, loading, isMarketOpen: isNseOpen() }
}
