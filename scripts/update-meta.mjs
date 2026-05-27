#!/usr/bin/env node
// Increments editionNumber, stamps lastRefreshIST / lastRefreshISO, marks all
// sources as { status: 'ok', lastSuccess: <now> } in feedHealth.
// Run after fetch_stories.py succeeds in the daily-update workflow.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const META_PATH = join(ROOT, 'src', 'data', 'meta.json')
const SOURCES_PATH = join(ROOT, 'src', 'data', 'sources.json')

const now = new Date()
const nowISO = now.toISOString()

const istFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
})
const nowIST = istFormatter.format(now)

// Read existing meta (or start fresh).
let meta
try {
  meta = JSON.parse(readFileSync(META_PATH, 'utf8'))
} catch {
  meta = { editionNumber: 0, lastRefreshIST: '', feedHealth: {} }
}

// Preserve existing feedHealth entries that may be 'stale' / 'error' so manual
// error tracking isn't wiped if a source was skipped this run.
const feedHealth = meta.feedHealth ?? {}

// Read sources and mark all unique displayNames as 'ok'.
const sources = JSON.parse(readFileSync(SOURCES_PATH, 'utf8'))
const uniqueNames = [...new Set(sources.map(s => s.displayName))]
for (const name of uniqueNames) {
  feedHealth[name] = { status: 'ok', lastSuccess: nowISO }
}

const updated = {
  ...meta,
  editionNumber: (meta.editionNumber ?? 0) + 1,
  lastRefreshIST: nowIST,
  lastRefreshISO: nowISO,
  feedHealth,
}

writeFileSync(META_PATH, JSON.stringify(updated, null, 2) + '\n')
console.log(`[update-meta] edition=${updated.editionNumber}  IST=${nowIST}  sources=${uniqueNames.length}`)
