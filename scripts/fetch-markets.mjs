#!/usr/bin/env node
// Fetches SENSEX, NIFTY, USDINR, BRENT from Yahoo Finance server-side
// (no CORS restrictions) and writes src/data/markets.json.
// Called by the refresh workflow after fetch_stories.py.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUTPUT = join(ROOT, 'src', 'data', 'markets.json')

const SYMBOLS = [
  { display: 'SENSEX', symbol: '^BSESN', decimals: 0 },
  { display: 'NIFTY',  symbol: '^NSEI',  decimals: 0 },
  { display: 'USDINR', symbol: 'INR=X',  decimals: 2 },
  { display: 'BRENT',  symbol: 'BZ=F',   decimals: 2 },
]

async function fetchQuote(display, symbol, decimals) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; DailyBrief/1.0)',
      Accept: 'application/json',
    },
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const json = await r.json()
  const meta = json?.chart?.result?.[0]?.meta
  if (!meta?.regularMarketPrice) throw new Error('No price in response')
  const price     = meta.regularMarketPrice
  const prevClose = meta.chartPreviousClose ?? meta.previousClose
  if (!prevClose) throw new Error('No prevClose')
  return {
    display,
    price,
    prevClose,
    change:    price - prevClose,
    changePct: ((price - prevClose) / prevClose) * 100,
    decimals,
  }
}

async function main() {
  const now = new Date().toISOString()
  const results = await Promise.allSettled(
    SYMBOLS.map(s => fetchQuote(s.display, s.symbol, s.decimals)),
  )

  const quotes = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status === 'fulfilled') {
      quotes.push(r.value)
      console.log(`[fetch-markets] ✓ ${SYMBOLS[i].display} ${r.value.price}`)
    } else {
      console.error(`[fetch-markets] ✗ ${SYMBOLS[i].display}: ${r.reason?.message}`)
    }
  }

  writeFileSync(OUTPUT, JSON.stringify({ updatedAt: now, quotes }, null, 2) + '\n')
  console.log(`[fetch-markets] wrote ${quotes.length}/${SYMBOLS.length} quotes → src/data/markets.json`)
}

main().catch(err => { console.error('[fetch-markets] fatal:', err); process.exit(1) })
