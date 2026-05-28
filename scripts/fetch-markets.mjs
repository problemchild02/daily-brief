#!/usr/bin/env node
// Fetches SENSEX, NIFTY, USDINR, BRENT from Yahoo Finance server-side
// and writes src/data/markets.json.
// Strategy: v7 batch endpoint (most permissive), falls back to v8 per-symbol.
// If all fetches fail, the existing file is preserved unchanged.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
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

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
}

// Try Yahoo Finance v7 batch endpoint (all symbols in one request)
async function fetchBatch() {
  const symbolList = SYMBOLS.map(s => s.symbol).join(',')
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolList)}&fields=regularMarketPrice,regularMarketPreviousClose`
  const r = await fetch(url, { headers: HEADERS })
  if (!r.ok) throw new Error(`v7 HTTP ${r.status}`)
  const json = await r.json()
  const results = json?.quoteResponse?.result
  if (!Array.isArray(results) || results.length === 0) throw new Error('v7 empty result')

  return SYMBOLS.map(({ display, symbol, decimals }) => {
    const q = results.find(r => r.symbol === symbol)
    if (!q?.regularMarketPrice) return null
    const price     = q.regularMarketPrice
    const prevClose = q.regularMarketPreviousClose ?? price
    return {
      display,
      price,
      prevClose,
      change:    price - prevClose,
      changePct: ((price - prevClose) / prevClose) * 100,
      decimals,
    }
  }).filter(Boolean)
}

// Fallback: Yahoo Finance v8 chart per-symbol
async function fetchSingle(display, symbol, decimals) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`
  const r = await fetch(url, { headers: HEADERS })
  if (!r.ok) throw new Error(`v8 HTTP ${r.status}`)
  const json = await r.json()
  const meta = json?.chart?.result?.[0]?.meta
  if (!meta?.regularMarketPrice) throw new Error('No price in v8 response')
  const price     = meta.regularMarketPrice
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price
  return { display, price, prevClose, change: price - prevClose, changePct: ((price - prevClose) / prevClose) * 100, decimals }
}

async function main() {
  const now = new Date().toISOString()
  let quotes = []

  // Try batch first
  try {
    quotes = await fetchBatch()
    console.log(`[fetch-markets] v7 batch: ${quotes.length}/${SYMBOLS.length} quotes`)
  } catch (batchErr) {
    console.warn(`[fetch-markets] v7 batch failed (${batchErr.message}), trying v8 per-symbol…`)
    const results = await Promise.allSettled(SYMBOLS.map(s => fetchSingle(s.display, s.symbol, s.decimals)))
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        quotes.push(results[i].value)
        console.log(`[fetch-markets] v8 ✓ ${SYMBOLS[i].display} ${results[i].value.price}`)
      } else {
        console.error(`[fetch-markets] v8 ✗ ${SYMBOLS[i].display}: ${results[i].reason?.message}`)
      }
    }
  }

  if (quotes.length === 0) {
    // Don't clobber the file with empty data — preserve last known good
    console.warn('[fetch-markets] all sources failed — preserving existing markets.json')
    return
  }

  writeFileSync(OUTPUT, JSON.stringify({ updatedAt: now, quotes }, null, 2) + '\n')
  console.log(`[fetch-markets] wrote ${quotes.length}/${SYMBOLS.length} quotes → src/data/markets.json`)
}

main().catch(err => { console.error('[fetch-markets] fatal:', err); process.exit(1) })
