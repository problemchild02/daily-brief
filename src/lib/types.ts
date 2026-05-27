export const CATEGORY_KEYS = [
  'legal',
  'business',
  'reliance',
  'retail',
  'tech',
  'world',
  'sports',
  'opinion',
] as const

export type CategoryKey = (typeof CATEGORY_KEYS)[number]

export interface Story {
  id: string
  section: CategoryKey
  headline: string
  hook: string
  summary: string
  contextNote?: string    // legacy field name in stories.json
  whyItMatters?: string   // spec §7.9 field name (used by future workflow)
  kicker?: string
  source: string
  sourceUrl: string
  dateLabel: string
  publishedAt: string
  wordCount: number
  tags: string[]
  priority: 'high' | 'medium' | 'low'
  fromPaper?: boolean
}

export interface FeedsPayload {
  editionDate: string
  heroStoryId: string
  sections: Record<CategoryKey, Story[]>
}

export interface FeedHealthEntry {
  status: 'ok' | 'stale' | 'error'
  lastSuccess: string  // ISO datetime
}

export interface MetaJson {
  editionNumber: number
  lastRefreshIST: string
  lastRefreshISO?: string
  feedHealth: Record<string, FeedHealthEntry | 'ok' | 'error'>
}

export interface SourceEntry {
  url: string
  section: CategoryKey
  displayName: string
  tags: string[]
  priority: 'high' | 'medium' | 'low'
}

export interface BriefingBullet {
  text: string
  category: CategoryKey
  url: string
}

export interface BriefingJson {
  generatedAt: string
  summary: string
  bullets: BriefingBullet[]
}
