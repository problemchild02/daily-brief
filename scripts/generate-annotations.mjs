#!/usr/bin/env node
// Generates per-story "Why It Matters" practitioner briefs via Claude Haiku.
// Skips stories that already have whyItMatters.
// Migrates contextNote → whyItMatters for stories that only have the legacy field.
// Gated on ANTHROPIC_API_KEY — exits gracefully if not set.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STORIES_PATH = join(ROOT, 'stories.json')

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

// Categories and keywords that warrant annotations
const ALWAYS_ANNOTATE = new Set(['legal', 'reliance'])
const KEYWORD_ANNOTATE_SECTIONS = new Set(['business', 'retail', 'opinion'])
const REGULATION_KEYWORDS = [
  'SEBI', 'RBI', 'CCI', 'NCLT', 'NCLAT', 'IRDAI', 'TRAI', 'MCA',
  'compliance', 'regulation', 'Act', 'Bill', 'Court', 'ruling', 'judgment',
  'penalty', 'fine', 'litigation', 'arbitration', 'insolvency', 'IPO',
]

function needsAnnotation(story) {
  if (story.whyItMatters) return false      // already has new annotation
  if (ALWAYS_ANNOTATE.has(story.section)) return true
  if (!KEYWORD_ANNOTATE_SECTIONS.has(story.section)) return false
  const text = `${story.headline} ${story.hook ?? ''}`
  return REGULATION_KEYWORDS.some(kw => text.includes(kw))
}

const ANNOTATION_PROMPT = `You are writing a "Why It Matters" brief for a senior in-house legal counsel at an Indian retail company. The brief should be 100–180 words.

Explain:
- The specific statute, regulation, or legal framework involved (with section numbers where applicable).
- Relevant case law or precedent (with citation, e.g. "Arun Ferreira (2021)").
- Numbered practical implications for the practitioner (use inline "(1) ... (2) ... (3) ..." style, not bullets).
- Why this matters for corporate compliance, regulatory risk, or counsel practice specifically.

Voice: precise, technical, present-tense, no hedging. Italicise case names with asterisks (*like this*). Output JSON only: { "whyItMatters": "..." }`

async function generateAnnotation(story, client) {
  const storyContext = `Headline: ${story.headline}\nSummary: ${story.hook ?? story.summary ?? ''}\nSource: ${story.source}\nURL: ${story.sourceUrl}`
  const resp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `${ANNOTATION_PROMPT}\n\nStory:\n${storyContext}`,
    }],
  })
  const text = resp.content[0]?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in response')
  const parsed = JSON.parse(match[0])
  return parsed.whyItMatters ?? ''
}

async function main() {
  if (!existsSync(STORIES_PATH)) {
    console.log('[generate-annotations] stories.json not found, skipping.')
    return
  }

  const data = JSON.parse(readFileSync(STORIES_PATH, 'utf8'))
  let migrated = 0
  let generated = 0
  let skipped = 0

  // Pass 1: migrate contextNote → whyItMatters for stories with only the legacy field
  for (const section of Object.values(data.sections ?? {})) {
    for (const story of section) {
      if (!story.whyItMatters && story.contextNote) {
        story.whyItMatters = story.contextNote
        migrated++
      }
    }
  }

  if (!ANTHROPIC_API_KEY) {
    console.log(`[generate-annotations] No ANTHROPIC_API_KEY — migrated ${migrated} contextNote(s), skipping AI generation.`)
    if (migrated > 0) writeFileSync(STORIES_PATH, JSON.stringify(data, null, 2) + '\n')
    return
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  // Collect stories needing annotations (cap at 20 per run for cost control)
  const toAnnotate = []
  for (const section of Object.values(data.sections ?? {})) {
    for (const story of section) {
      if (needsAnnotation(story)) toAnnotate.push(story)
    }
  }
  const batch = toAnnotate.slice(0, 20)

  // Process sequentially to respect rate limits
  for (const story of batch) {
    try {
      story.whyItMatters = await generateAnnotation(story, client)
      generated++
      console.log(`[generate-annotations] ✓ ${story.headline.slice(0, 60)}`)
    } catch (err) {
      console.error(`[generate-annotations] ✗ ${story.headline.slice(0, 60)}: ${err.message}`)
      skipped++
    }
  }

  writeFileSync(STORIES_PATH, JSON.stringify(data, null, 2) + '\n')
  console.log(`[generate-annotations] done — migrated=${migrated} generated=${generated} skipped=${skipped}`)
}

main().catch(err => { console.error('[generate-annotations] fatal:', err); process.exit(1) })
