#!/usr/bin/env node
// Generates the 5-bullet daily briefing.
// Writes src/data/briefing.json.
// Tries Claude Haiku first (best-tuned prompt, low volume here so cost is
// negligible), then falls back to Gemini, then OpenAI, so one provider being
// out of credit doesn't blank out the briefing — see fetch_stories.py's
// provider chain for the same pattern applied to per-story enrichment.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STORIES_PATH = join(ROOT, 'stories.json')
const BRIEFING_PATH = join(ROOT, 'src', 'data', 'briefing.json')

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const GEMINI_MODEL = 'gemini-2.5-flash'
const OPENAI_MODEL = 'gpt-4o-mini'

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

const BRIEFING_PROMPT = `You are an editor producing a 5-bullet morning briefing for a senior in-house legal counsel at an Indian retail company. Pick the 5 most important stories from the input. For each, write one concise bullet (max 25 words) capturing the substance — the specific fact (who, what, the number or ruling), not a category description of the story. Output JSON only, no markdown fences.

Do not write generic filler like "significant development" or "worth watching" — every bullet must contain a concrete, checkable fact from the input. If a story doesn't have one, don't pick it.

Output schema:
{
  "summary": "<2-sentence editor's note summarising what kind of day it is — legal, market, mixed — naming the specific driver, not just the category>",
  "bullets": [
    { "text": "...", "category": "legal|business|retail|tech|world|opinion|sports|reliance", "url": "..." }
  ]
}

Prioritise: legal judgments, regulatory orders, Reliance/retail earnings, major policy changes. Avoid sports unless nothing else is available.`

function buildPrompt(stories) {
  const input = stories.map(s => ({
    headline: s.headline,
    hook: s.hook ?? s.summary ?? '',
    section: s.section,
    url: s.sourceUrl,
    priority: s.priority,
  }))
  return `${BRIEFING_PROMPT}\n\nInput stories:\n${JSON.stringify(input, null, 2)}`
}

class ProviderExhausted extends Error {}

async function callAnthropic(prompt) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })
    return resp.content[0]?.text ?? ''
  } catch (err) {
    const msg = JSON.stringify(err.error ?? err.message ?? '')
    if (err.status === 400 && /credit balance/i.test(msg)) throw new ProviderExhausted(msg)
    if (err.status === 429) throw new ProviderExhausted(msg)
    throw err
  }
}

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
    }),
  })
  const body = await resp.json()
  if (!resp.ok) {
    if (resp.status === 429 || JSON.stringify(body).includes('RESOURCE_EXHAUSTED')) {
      throw new ProviderExhausted(JSON.stringify(body).slice(0, 200))
    }
    throw new Error(`Gemini HTTP ${resp.status}: ${JSON.stringify(body).slice(0, 200)}`)
  }
  return body.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

async function callOpenAI(prompt) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    }),
  })
  const body = await resp.json()
  if (!resp.ok) {
    if (resp.status === 429 || /insufficient_quota|billing/i.test(JSON.stringify(body))) {
      throw new ProviderExhausted(JSON.stringify(body).slice(0, 200))
    }
    throw new Error(`OpenAI HTTP ${resp.status}: ${JSON.stringify(body).slice(0, 200)}`)
  }
  return body.choices?.[0]?.message?.content ?? ''
}

function parseJsonLoose(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in response')
  return JSON.parse(match[0])
}

const PROVIDERS = [
  { name: 'anthropic', hasKey: () => !!ANTHROPIC_API_KEY, call: callAnthropic },
  { name: 'gemini', hasKey: () => !!GEMINI_API_KEY, call: callGemini },
  { name: 'openai', hasKey: () => !!OPENAI_API_KEY, call: callOpenAI },
]

async function generateBriefing(stories) {
  const prompt = buildPrompt(stories)
  for (const provider of PROVIDERS) {
    if (!provider.hasKey()) continue
    try {
      const text = await provider.call(prompt)
      const parsed = parseJsonLoose(text)
      console.log(`[generate-briefing] ✓ generated via ${provider.name}`)
      return parsed
    } catch (err) {
      console.error(`[generate-briefing] [${provider.name}] failed: ${err.message}`)
      // fall through to next provider
    }
  }
  throw new Error('all providers failed or unconfigured')
}

async function main() {
  const now = new Date().toISOString()

  if (!ANTHROPIC_API_KEY && !GEMINI_API_KEY && !OPENAI_API_KEY) {
    console.log('[generate-briefing] No AI provider keys set — writing empty briefing.json.')
    writeFileSync(BRIEFING_PATH, JSON.stringify({ generatedAt: now, summary: '', bullets: [] }, null, 2) + '\n')
    return
  }

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

  try {
    const briefing = await generateBriefing(stories)
    const output = {
      generatedAt: now,
      summary: briefing.summary ?? '',
      bullets: (briefing.bullets ?? []).slice(0, 5),
    }
    writeFileSync(BRIEFING_PATH, JSON.stringify(output, null, 2) + '\n')
    console.log(`[generate-briefing] ✓ ${output.bullets.length} bullets — "${output.summary.slice(0, 60)}…"`)
  } catch (err) {
    console.error('[generate-briefing] generation failed on all providers:', err.message)
    // Non-fatal — preserve existing briefing.json so the workflow continues
  }
}

main().catch(err => { console.error('[generate-briefing] fatal:', err); process.exit(1) })
