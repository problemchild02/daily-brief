#!/usr/bin/env node
// Generates the 5-bullet daily briefing via Claude Haiku.
// Writes src/data/briefing.json.
// Gated on ANTHROPIC_API_KEY — writes an empty briefing.json if not set.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STORIES_PATH = join(ROOT, 'stories.json')
const BRIEFING_PATH = join(ROOT, 'src', 'data', 'briefing.json')

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

// Priority categories for story selection
const PRIORITY_SECTIONS = ['legal', 'business', 'retail', 'reliance', 'tech']

function pickInputStories(data) {
  const stories = []
  for (const section of PRIORITY_SECTIONS) {
    const sectionStories = data.sections?.[section] ?? []
    // Top 3 per priority section — high priority first
    const sorted = [...sectionStories].sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 }
      return (order[a.priority] ?? 2) - (order[b.priority] ?? 2)
    })
    stories.push(...sorted.slice(0, 3))
  }
  // Also include top 2 from remaining sections
  for (const section of Object.keys(data.sections ?? {})) {
    if (PRIORITY_SECTIONS.includes(section)) continue
    const sectionStories = data.sections[section] ?? []
    stories.push(...sectionStories.slice(0, 2))
  }
  return stories
}

const BRIEFING_PROMPT = `You are an editor producing a 5-bullet morning briefing for a senior in-house legal counsel at an Indian retail company. Pick the 5 most important stories from the input. For each, write one concise bullet (max 25 words) capturing the substance. Output JSON only.

Output schema:
{
  "summary": "<2-sentence editor's note summarising what kind of day it is — legal, market, mixed>",
  "bullets": [
    { "text": "...", "category": "legal|business|retail|tech|world|opinion|sports|reliance", "url": "..." }
  ]
}

Prioritise: legal judgments, regulatory orders, Reliance/retail earnings, major policy changes. Avoid sports unless nothing else is available.`

async function generateBriefing(stories, client) {
  const input = stories.map(s => ({
    headline: s.headline,
    hook: s.hook ?? s.summary ?? '',
    section: s.section,
    url: s.sourceUrl,
    priority: s.priority,
  }))

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `${BRIEFING_PROMPT}\n\nInput stories:\n${JSON.stringify(input, null, 2)}`,
    }],
  })

  const text = resp.content[0]?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in response')
  return JSON.parse(match[0])
}

async function main() {
  const now = new Date().toISOString()

  if (!ANTHROPIC_API_KEY) {
    console.log('[generate-briefing] No ANTHROPIC_API_KEY — writing empty briefing.json.')
    writeFileSync(BRIEFING_PATH, JSON.stringify({ generatedAt: now, summary: '', bullets: [] }, null, 2) + '\n')
    return
  }

  console.log(`[generate-briefing] API key: ${ANTHROPIC_API_KEY.slice(0, 10)}…`)

  if (!existsSync(STORIES_PATH)) {
    console.log('[generate-briefing] stories.json not found, skipping.')
    return
  }

  const data = JSON.parse(readFileSync(STORIES_PATH, 'utf8'))
  const stories = pickInputStories(data)

  if (stories.length === 0) {
    console.log('[generate-briefing] No stories found, writing empty briefing.json.')
    writeFileSync(BRIEFING_PATH, JSON.stringify({ generatedAt: now, summary: '', bullets: [] }, null, 2) + '\n')
    return
  }

  console.log(`[generate-briefing] Generating briefing from ${stories.length} stories…`)

  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  try {
    const briefing = await generateBriefing(stories, client)
    const output = {
      generatedAt: now,
      summary: briefing.summary ?? '',
      bullets: (briefing.bullets ?? []).slice(0, 5),
    }
    writeFileSync(BRIEFING_PATH, JSON.stringify(output, null, 2) + '\n')
    console.log(`[generate-briefing] ✓ ${output.bullets.length} bullets — "${output.summary.slice(0, 60)}…"`)
  } catch (err) {
    console.error('[generate-briefing] generation failed:', err.message)
    console.error('[generate-briefing] status:', err.status, '| type:', err.constructor?.name)
    if (err.error) console.error('[generate-briefing] API error body:', JSON.stringify(err.error))
    // Non-fatal — preserve existing briefing.json so the workflow continues
  }
}

main().catch(err => { console.error('[generate-briefing] fatal:', err); process.exit(1) })
