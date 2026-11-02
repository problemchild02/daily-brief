import type { Story } from './types'

// A small, stable vocabulary of what a story is *about*. It's what the paper learns
// from ("you read a lot on SEBI") and what the Retail/Reliance emphasis is built on,
// so it's deliberately coarse: a few dozen topics, not every word.
const TOPIC_RULES: [string, RegExp][] = [
  // Case-sensitive on purpose: "reliance on forecasts" is not Reliance Industries.
  ['Reliance & Jio',            /\bReliance\b(?!\s+(?:on|upon)\b)|\b(?:Jio\w*|Ambani|Network18|Swadesh|RJIL)\b/],
  ['Retail & e-commerce',       /\b(retail|e-?commerce|quick commerce|marketplace|jiomart|dmart|bigbasket|flipkart|amazon india|zepto|blinkit|swiggy|zomato|kirana|omnichannel|d2c|shelf|consumer brand)\b/i],
  ['Consumer protection',       /\b(consumer (protection|court|commission|forum|rights)|ccpa|ncdrc|misleading ad|dark pattern|refund|legal metrology|product liability|unfair trade)\b/i],
  ['FMCG & food safety',        /\b(fmcg|fssai|food safety|packaged food|dairy|beverage|snack|grocery|edible oil)\b/i],
  ['FDI & foreign exchange',    /\b(fdi|foreign direct investment|fema|foreign exchange|press note|overseas investment|external commercial borrowing)\b/i],
  ['Insolvency',                /\b(insolvency|ibc|nclt|nclat|bankruptcy|resolution (plan|professional)|liquidation|ibbi|corporate debtor)\b/i],
  ['Securities (SEBI)',         /\b(sebi|insider trading|lodr|ipo|takeover code|mutual fund|stock exchange|disclosure norms|listing)\b/i],
  ['Banking & payments (RBI)',  /\b(rbi|reserve bank|repo rate|nbfc|digital lending|kyc|upi|npci|payment aggregator)\b/i],
  ['Competition (CCI)',         /\b(competition commission|cci|antitrust|cartel|abuse of dominance|merger control)\b/i],
  ['Data protection',           /\b(dpdp|data protection|privacy|data breach|meity|cert-in|surveillance)\b/i],
  ['Tax & GST',                 /\b(gst|income tax|itat|cbdt|cbic|taxation|tds|customs duty|cestat|transfer pricing)\b/i],
  ['Arbitration',               /\b(arbitrat\w*|mediation|conciliation|aiac)\b/i],
  ['Intellectual property',     /\b(trade ?mark|patent|copyright|passing off|intellectual property|geographical indication)\b/i],
  ['Companies Act & M&A',       /\b(companies act|ministry of corporate affairs|merger|acquisition|m&a|takeover|demerger|board of directors)\b/i],
  ['Labour & employment',       /\b(labou?r code|labou?r law|employment|epfo|gratuity|posh act|minimum wage|industrial dispute)\b/i],
  ['Real estate',               /\b(rera|real estate|tenanc|landlord|stamp duty|property dispute)\b/i],
  ['Telecom & tech regulation', /\b(trai|telecom|spectrum|satcom|it rules|intermediar(y|ies)|ai regulation)\b/i],
  ['Criminal law',              /\b(fir|bail|ipc|bns|bnss|crpc|murder|conviction|pocso|cheque bounce)\b/i],
  ['Constitutional law',        /\b(article \d+|constitution bench|fundamental right|writ petition|public interest litigation)\b/i],
  ['Supreme Court',             /\bsupreme court\b/i],
  ['High Courts',               /\bhigh court\b/i],
]

/** The topics a story is about, plus named companies the engine found. */
export function topicsOf(story: Pick<Story, 'headline' | 'summary' | 'tags' | 'facts' | 'section'>): string[] {
  const facts = story.facts ?? []
  const text = [story.headline, story.summary, (story.tags ?? []).join(' '), facts.map(f => f.value).join(' ')].join(' ')
  const out: string[] = []
  for (const [name, re] of TOPIC_RULES) if (re.test(text)) out.push(name)
  for (const f of facts) if (f.label === 'Company') out.push(`co:${f.value.toLowerCase()}`)
  return out.slice(0, 8)
}

/** Topic ids are shown to the reader, except company markers, which read as "Company". */
export const topicLabel = (t: string) => (t.startsWith('co:') ? t.slice(3).replace(/\b\w/g, c => c.toUpperCase()) : t)
