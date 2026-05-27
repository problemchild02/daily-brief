import type { CategoryKey } from './types'

export const CATEGORIES: Record<
  CategoryKey,
  { label: string; colorVar: string; order: number }
> = {
  legal:    { label: 'Legal & Regulatory', colorVar: '--cat-legal',    order: 1 },
  business: { label: 'Business',           colorVar: '--cat-business', order: 2 },
  reliance: { label: 'Reliance / Jio',     colorVar: '--cat-reliance', order: 3 },
  retail:   { label: 'Retail',             colorVar: '--cat-retail',   order: 4 },
  tech:     { label: 'Tech',               colorVar: '--cat-tech',     order: 5 },
  world:    { label: 'World',              colorVar: '--cat-world',    order: 6 },
  sports:   { label: 'Sports',             colorVar: '--cat-sports',   order: 7 },
  opinion:  { label: 'Opinion',            colorVar: '--cat-opinion',  order: 8 },
}
