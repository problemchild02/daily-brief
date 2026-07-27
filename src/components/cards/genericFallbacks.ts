// Verbatim fallback sentences from CONTEXT_TEMPLATES in fetch_stories.py (repo root).
// Keep this Set in sync if that dict's wording ever changes.
// When AI enrichment fails (e.g. billing outage), the backend fills contextNote/
// whyItMatters with one of these generic, section-wide boilerplate strings instead
// of real per-story analysis. The frontend should treat that as "no brief available"
// rather than render it as bespoke analysis.
const GENERIC_WHY_IT_MATTERS = new Set<string>([
  'This ruling or regulatory action may affect litigation strategy, compliance obligations, or precedent applicable to your practice — verify the full order via the source link.',
  'Corporate developments like this can trigger due diligence, disclosure obligations, or restructuring considerations relevant to transactional and advisory work.',
  'Reliance group moves often signal shifts in regulatory posture, M&A activity, or sector-wide compliance trends worth tracking for corporate and commercial practice.',
  'Retail sector changes can implicate FDI rules, consumer protection law, and e-commerce policy — areas of growing regulatory activity in India.',
  'Technology and data regulation is evolving rapidly in India (DPDP, MeitY, IT Rules) — this development may have compliance or advisory implications.',
  'International developments affecting trade, sanctions, or cross-border investment can directly impact Indian law practice and client advisories.',
  'Sports governance and media rights increasingly involve contract, IP, and regulatory disputes — worth tracking for sports law and entertainment practice.',
  'Editorial perspective — useful for understanding the direction of regulatory discourse and anticipating legislative or policy shifts.',
])

/** True when `text` is exactly one of the hardcoded per-section fallback sentences. */
export function isGenericWhyItMatters(text: string | undefined | null): boolean {
  if (!text) return false
  return GENERIC_WHY_IT_MATTERS.has(text.trim())
}
