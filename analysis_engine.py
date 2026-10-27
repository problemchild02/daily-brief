"""
Native story analysis — no LLM, no API, no tokens.

What it does for each story, using only the text we already have (RSS excerpt,
plus the article page's own description when the pipeline fetched the page):

  1. summary   — an extractive summary: the most informative sentences of the
                 excerpt, in their original order. It never invents anything; if
                 there is nothing beyond the headline it returns None rather
                 than restating the headline as a "summary".
  2. facts     — the concrete things in the text: courts, regulators, statutes
                 (with section numbers), amounts, percentages, deadlines and
                 company names, as short labelled chips.
  3. why it matters — a practitioner brief, only when a legal-domain rule fires
                 (a regulator or statute regime is actually present in the text).
                 Each rule writes its implications around the entities it found.
                 If no rule fires it returns None and the pipeline asks an AI
                 provider for just that one field; it never emits one canned
                 sentence per section (the failure this pipeline was rebuilt to
                 prevent — see CLAUDE.md).

Stdlib only. Everything here is deterministic, so re-running is free and a
change to a rule shows up on the next refresh without spending a token.
"""
import hashlib
import re
from html import unescape

# ── text utilities ───────────────────────────────────────────────────────────

_WS = re.compile(r"\s+")
_ABBREV = ("Rs", "Mr", "Mrs", "Ms", "Dr", "No", "Sec", "vs", "Ltd", "Pvt", "Inc", "Co", "St", "Hon", "Adv", "Smt", "Shri", "Jr", "Sr", "Corp")
_SENT_SPLIT = re.compile(r"(?<=[.!?])[\"'”’)]*\s+(?=[\"'“‘(]?[A-Z0-9₹$])")
_BOILERPLATE = re.compile(
    r"(click here|subscribe|sign up|read more|read also|follow us|download the app|all rights reserved|"
    r"copyright|advertisement|newsletter|whatsapp|telegram|cookie|terms of use|privacy policy|"
    r"comprehensive, up-to-date news|google news|^\s*image:|photo:|file photo|\(pti\)|\(ani\)\s*$)",
    re.IGNORECASE,
)


def clean(text):
    if not text:
        return ""
    text = unescape(re.sub(r"<[^>]+>", " ", str(text)))
    return _WS.sub(" ", text).strip()


def _tokens(text):
    return set(re.findall(r"[a-z0-9]+", text.lower())) - {"the", "a", "an", "of", "in", "on", "to", "for", "and", "is", "at", "by", "as", "with"}


def split_sentences(text):
    text = clean(text)
    if not text:
        return []
    # Protect abbreviations like "Rs. 10" and "Mr. Rao" from the sentence splitter.
    protected = text
    for ab in _ABBREV:
        protected = re.sub(rf"\b{ab}\.", f"{ab}\u0001", protected)
    parts = _SENT_SPLIT.split(protected)
    return [p.replace("\u0001", ".").strip() for p in parts if p.strip()]


def content_hash(*parts):
    """Stable fingerprint of a story's raw inputs: if it hasn't changed since the
    last run, last run's enrichment is still valid and costs nothing to reuse."""
    h = hashlib.sha1()
    for p in parts:
        h.update(clean(p).lower().encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()[:16]


# ── page text (reuses the HTML the image pass already downloads) ─────────────

_META_DESC = re.compile(
    r'<meta[^>]+(?:property|name)=["\'](?:og:description|twitter:description|description)["\'][^>]+content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)
_META_DESC_REV = re.compile(
    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:description|twitter:description|description)["\']',
    re.IGNORECASE,
)
_PARA = re.compile(r"<p[^>]*>(.*?)</p>", re.IGNORECASE | re.DOTALL)


def extract_page_excerpt(raw_html, max_chars=1600):
    """The article page's own description plus its first real paragraphs. Returns
    "" when the page has nothing usable (a consent wall, a JS shell, boilerplate)."""
    if not raw_html:
        return ""
    chunks = []
    m = _META_DESC.search(raw_html) or _META_DESC_REV.search(raw_html)
    if m:
        chunks.append(clean(m.group(1)))
    body = re.sub(r"<(script|style|nav|footer|aside|header)[^>]*>.*?</\1>", " ", raw_html, flags=re.IGNORECASE | re.DOTALL)
    for p in _PARA.findall(body):
        t = clean(p)
        if len(t.split()) >= 12 and not _BOILERPLATE.search(t):
            chunks.append(t)
        if sum(len(c) for c in chunks) >= max_chars:
            break
    out = " ".join(c for c in chunks if c and not _BOILERPLATE.search(c))
    return out[:max_chars].rsplit(" ", 1)[0] if len(out) > max_chars else out


# ── facts: the concrete things in the text ───────────────────────────────────

_REGULATORS = {
    "SEBI": r"\bSEBI\b|Securities and Exchange Board",
    "RBI": r"\bRBI\b|Reserve Bank of India",
    "CCI": r"\bCCI\b|Competition Commission",
    "IRDAI": r"\bIRDAI\b",
    "TRAI": r"\bTRAI\b",
    "MeitY": r"\bMeitY\b|Ministry of Electronics",
    "CERT-In": r"\bCERT-In\b",
    "CBIC": r"\bCBIC\b",
    "CBDT": r"\bCBDT\b",
    "ED": r"Enforcement Directorate|\bED\b(?= (?:has|said|raid|attach|summon|arrest|file))",
    "CBI": r"\bCBI\b",
    "MCA": r"Ministry of Corporate Affairs|\bMCA\b",
    "IBBI": r"\bIBBI\b",
    "DPIIT": r"\bDPIIT\b",
    "CCPA": r"\bCCPA\b|Central Consumer Protection Authority",
    "ASCI": r"\bASCI\b|Advertising Standards Council",
    "DoT": r"Department of Telecommunications",
    "NPCI": r"\bNPCI\b",
}
_COURTS = re.compile(
    r"\b(Supreme Court|High Court of [A-Z][a-z]+(?: [A-Z][a-z]+)?|(?:[A-Z][a-z]+ )?(?:[A-Z][a-z]+ )?High Court|"
    r"NCLAT|NCLT|NGT|ITAT|CESTAT|TDSAT|APTEL|NCDRC|Debts Recovery Tribunal|Delhi HC|Bombay HC|Madras HC)\b"
)
_STATUTE_NAME = re.compile(
    r"\b((?:[A-Z][\w&\-]*)(?:\s+(?:of|and|the|for|on|&)\s+[A-Z][\w&\-]*|\s+[A-Z][\w&\-]*){0,7}\s+"
    r"(?:Act|Code)(?:,?\s*(?:19|20)\d{2})?)\b"
)
_SECTION_REF = re.compile(
    r"\b(?:Sections?|Sec\.?|s\.)\s*(\d+[A-Z]{0,2}(?:\(\d+\))?(?:\([a-z]\))?(?:\s*(?:and|,|&|/|to)\s*\d+[A-Z]{0,2}(?:\(\d+\))?)*)"
    r"(?:\s+of(?:\s+the)?\s+([A-Z][\w&\-]*(?:\s+(?:of|and|the)?\s*[A-Z][\w&\-]*){0,6}\s+(?:Act|Code)(?:,?\s*(?:19|20)\d{2})?))?"
)
_AMOUNT = re.compile(
    r"(?<![A-Za-z])(?:₹|Rs\.?|INR|US\$|USD|\$|€|£)\s?\d[\d,]*(?:\.\d+)?\s?(?:lakh crore|crore|lakh|million|billion|trillion|bn|mn|tn|cr|k)?\b"
    r"|\b\d[\d,]*(?:\.\d+)?\s?(?:lakh crore|crore|billion|million|trillion)\b(?:\s(?:rupees|dollars))?",
    re.IGNORECASE,
)
_PERCENT = re.compile(r"\b\d+(?:\.\d+)?\s?(?:%|per cent|percent)")
_DEADLINE = re.compile(
    r"\b(?:within\s+\d+\s+(?:days?|weeks?|months?)|"
    r"(?:by|before|until|till|from|effective|w\.e\.f\.?|deadline of|on)\s+\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:,?\s+\d{4})?)",
    re.IGNORECASE,
)
_ORG = re.compile(
    r"\b((?:[A-Z][A-Za-z&\.\-]+\s){1,4}(?:Ltd\.?|Limited|Industries|Bank|Corporation|Corp\.?|Inc\.?|Group|Holdings|"
    r"Technologies|Finance|Financial|Retail|Jio|Platforms|Telecom|Airlines|Motors|Pharma|Capital|Energy|Power|Foods|Ventures))\b"
)


def _dedupe(seq, limit):
    seen, out = set(), []
    for item in seq:
        key = item.lower().strip(" .,")
        if key and key not in seen:
            seen.add(key)
            out.append(item.strip(" .,"))
        if len(out) >= limit:
            break
    return out


def extract_signals(text):
    """Structured facts found in `text`. Every value is a substring of the input."""
    text = clean(text)
    regulators = [name for name, pat in _REGULATORS.items() if re.search(pat, text)]
    courts = _dedupe((m.group(1) for m in _COURTS.finditer(text)), 3)
    statutes = _dedupe(
        (re.sub(r"^(?:The|A)\s+", "", m.group(1)) for m in _STATUTE_NAME.finditer(text)),
        4,
    )
    sections = []
    for m in _SECTION_REF.finditer(text):
        ref = f"s.{m.group(1)}"
        if m.group(2):
            ref += " " + re.sub(r"^The\s+", "", m.group(2))
        sections.append(ref)
    return {
        "regulators": regulators[:4],
        "courts": courts,
        "statutes": statutes,
        "sections": _dedupe(sections, 3),
        "amounts": _dedupe((m.group(0) for m in _AMOUNT.finditer(text)), 3),
        "percents": _dedupe((m.group(0) for m in _PERCENT.finditer(text)), 2),
        "deadlines": _dedupe((m.group(0) for m in _DEADLINE.finditer(text)), 2),
        "orgs": _dedupe((m.group(1) for m in _ORG.finditer(text)), 3),
    }


def facts_from_signals(sig, limit=6):
    """The signals as short label/value chips for the card — only the ones that carry meaning."""
    order = [
        ("Court", sig["courts"][:1]), ("Regulator", sig["regulators"][:2]),
        ("Law", (sig["sections"] or sig["statutes"])[:2]), ("Amount", sig["amounts"][:2]),
        ("Change", sig["percents"][:1]), ("Timeline", sig["deadlines"][:1]), ("Company", sig["orgs"][:1]),
    ]
    out = []
    for label, values in order:
        for v in values:
            out.append({"label": label, "value": v})
    return out[:limit]


# ── summary ──────────────────────────────────────────────────────────────────

def native_summary(headline, excerpts, max_words=110):
    """Extractive summary of what the article reports. Returns (text, quality) where
    quality is 'good', 'thin' or None — None means there was nothing beyond the headline."""
    head_tokens = _tokens(headline)
    sentences, seen = [], set()
    for ex in excerpts:
        for s in split_sentences(ex):
            key = re.sub(r"\W+", "", s.lower())[:60]
            if key in seen or _BOILERPLATE.search(s):
                continue
            seen.add(key)
            words = len(s.split())
            if words < 6 or words > 70:
                continue
            toks = _tokens(s)
            # A sentence that only repeats the headline (Google News "headline - source"):
            # it covers most of the headline and adds at most a couple of words.
            if head_tokens and toks and len(toks & head_tokens) / len(head_tokens) >= 0.7 and len(toks - head_tokens) <= 3:
                continue
            sentences.append(s)
    if not sentences:
        return None, None

    scored = []
    for i, s in enumerate(sentences):
        sig = extract_signals(s)
        score = 1.0 / (1 + 0.4 * i)
        score += 0.5 if re.search(r"\d", s) else 0
        score += 0.25 * min(3, sum(1 for k in ("courts", "regulators", "statutes", "sections", "amounts", "orgs") if sig[k]))
        score += 0.2 if re.search(r"\b(said|ordered|held|directed|announced|approved|filed|issued|rejected|allowed|dismissed|stayed)\b", s, re.I) else 0
        scored.append((score, i, s))

    chosen, words = [], 0
    for score, i, s in sorted(scored, reverse=True):
        n = len(s.split())
        if chosen and words + n > max_words:
            continue
        chosen.append((i, s))
        words += n
        if words >= max_words * 0.8:
            break
    text = " ".join(s for _, s in sorted(chosen))
    quality = "good" if (len(chosen) >= 2 and words >= 25) or words >= 30 else "thin"
    return text, quality


# ── why it matters: domain rules ─────────────────────────────────────────────

def _join(items, conj="and"):
    items = [i for i in items if i]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + f" {conj} " + items[-1]


def _lead(sig):
    """Names what the story engages, using only what the text itself cited."""
    cited = sig["sections"] or sig["statutes"]
    return f" The report cites {_join(cited[:2])}." if cited else ""


def _who(sig, headline):
    return (sig["orgs"] or [None])[0]


def _rule_insolvency(h, t, sig, sec):
    org = _who(sig, h)
    name = f" {org}" if org else " the corporate debtor"
    return (
        f"This is an Insolvency and Bankruptcy Code, 2016 matter{(' before ' + sig['courts'][0]) if sig['courts'] else ''}.{_lead(sig)} "
        f"(1) If any client is a creditor of{name}, confirm its claim is on file with the resolution professional before the claims window closes. "
        f"(2) A prospective resolution applicant must clear the s.29A eligibility bar — screen connected-person exposure before bidding. "
        f"(3) The s.14 moratorium bars suits and recoveries against the debtor, so pause enforcement steps against it."
    )


def _rule_sebi(h, t, sig, sec):
    amt = f" involving {sig['amounts'][0]}" if sig["amounts"] else ""
    return (
        f"A SEBI action{amt} that changes obligations for listed entities and their intermediaries.{_lead(sig)} "
        f"(1) For listed-entity clients, check whether it touches continuous disclosure under Reg. 30 of the LODR Regulations, 2015 and note any compliance date it sets. "
        f"(2) If the order names a promoter, intermediary or entity a client deals with, re-run counterparty and KYC checks. "
        f"(3) Review internal policies it may supersede — insider trading code, related-party transaction policy, takeover disclosures."
    )


def _rule_rbi(h, t, sig, sec):
    return (
        f"An RBI measure that reaches banks, NBFCs and payment entities and, through them, their customers and vendors.{_lead(sig)} "
        f"(1) Identify which regulated-entity clients or counterparties are in scope and the date from which it applies. "
        f"(2) Check outsourcing, lending and payment agreements with those entities for regulatory-change and cost-pass-through clauses. "
        f"(3) If it restricts or penalises a named entity, review exposure under any facility, escrow or settlement arrangement with it."
    )


def _rule_competition(h, t, sig, sec):
    return (
        f"A competition-law development under the Competition Act, 2002.{_lead(sig)} "
        f"(1) For any deal in the pipeline, test whether it needs CCI approval under ss.5–6 before closing — including the deal-value threshold added by the 2023 amendment (₹2,000 crore with substantial business operations in India). "
        f"(2) If the issue is dominance, exclusivity or pricing, review distribution, discount and most-favoured-customer clauses. "
        f"(3) For cartel-type conduct, consider whether leniency is available before a client's own exposure surfaces."
    )


def _rule_dpdp(h, t, sig, sec):
    return (
        f"A data-protection development under the Digital Personal Data Protection Act, 2023.{_lead(sig)} "
        f"(1) Confirm whether the business is a Data Fiduciary and that notice and consent under ss.5–6 match actual processing. "
        f"(2) Check breach readiness: Board notification under s.8(6) and CERT-In's six-hour incident-reporting direction. "
        f"(3) Review processor and vendor contracts for security-safeguard, sub-processing and deletion obligations."
    )


def _rule_fema_pmla(h, t, sig, sec):
    if re.search(r"PMLA|money laundering|attach|Enforcement Directorate|\bED\b", t):
        return (
            f"An Enforcement Directorate / PMLA action.{_lead(sig)} "
            f"(1) Check whether any client asset, receivable or account sits with the named persons or entities, since attachment under s.5 PMLA can freeze it. "
            f"(2) Refresh beneficial-ownership and KYC files on the counterparties involved. "
            f"(3) If a client receives a summons, preserve documents now and route responses through counsel."
        )
    return (
        f"A cross-border investment development under FEMA and the foreign-exchange regime.{_lead(sig)} "
        f"(1) Check the sectoral cap and entry route under the FEMA (Non-Debt Instruments) Rules, 2019 for any inbound or outbound investment in progress. "
        f"(2) Confirm pricing guidelines and the filing timelines for the transaction forms with the authorised dealer bank. "
        f"(3) Late or missed reporting is compoundable but visible — fix it before it reaches a diligence exercise."
    )


def _rule_tax(h, t, sig, sec):
    return (
        f"An indirect- or direct-tax development.{_lead(sig)} "
        f"(1) Check its effective date against open assessments, pending refunds and ongoing audits for clients in the affected line of business. "
        f"(2) For open demands or refund claims on the same point, check the limitation period — refund claims under s.54 CGST run two years from the relevant date. "
        f"(3) Update contract tax clauses and invoicing templates if the rate, classification or place-of-supply treatment changes."
    )


def _rule_consumer(h, t, sig, sec):
    return (
        f"A consumer-protection or advertising-regulation development.{_lead(sig)} "
        f"(1) The CCPA can order discontinuation and impose penalties under s.21 of the Consumer Protection Act, 2019 (up to ₹10 lakh, ₹50 lakh for a repeat) — audit live claims and endorsements against it. "
        f"(2) For comparative or health/efficacy claims, hold the substantiation file ready before a notice arrives. "
        f"(3) Review influencer and agency contracts for who bears the cost of a takedown."
    )


def _rule_arbitration(h, t, sig, sec):
    return (
        f"An arbitration-law development{(' before ' + sig['courts'][0]) if sig['courts'] else ''}.{_lead(sig)} "
        f"(1) Diarise the s.34 challenge window — three months from receipt of the award, extendable by 30 days — for any award a client holds or faces. "
        f"(2) Where assets may be dissipated, s.9 interim relief is available before and during the proceedings. "
        f"(3) Check the arbitration clause's seat and institutional rules, which decide the supervising court and the appointment route."
    )


def _rule_ip(h, t, sig, sec):
    return (
        f"An intellectual-property dispute.{_lead(sig)} "
        f"(1) Brand owners should check the register for similar marks and keep evidence of use and reputation, which interim-injunction applications turn on. "
        f"(2) For a client facing a claim, assess prior use and whether the conflicting mark is genuinely similar for the same goods or services. "
        f"(3) Review licence and co-branding agreements for quality-control and termination clauses."
    )


def _rule_companies(h, t, sig, sec):
    return (
        f"A corporate-law development under the Companies Act, 2013{(' before ' + sig['courts'][0]) if sig['courts'] else ''}.{_lead(sig)} "
        f"(1) For any scheme of arrangement in progress, track the s.230–232 steps — notice to regulators, creditor and shareholder meetings — and the objection window. "
        f"(2) Check director and related-party disclosures for the entities named. "
        f"(3) Confirm filing deadlines with the Registrar that follow from the event."
    )


# Sports and opinion pieces aren't practice-relevant regimes: "MCA" there is a
# cricket association, "ED" a footballer's initials. Rules only run on these.
_RULE_SECTIONS = {"legal", "business", "reliance", "retail", "tech", "world"}

# (name, trigger over the lowercase text, builder).
# A rule fires only on specific regime terms; a story that merely sits in the
# "legal" section but names no regime gets no native brief and goes to AI.
_RULES = [
    ("insolvency",  re.compile(r"\binsolvency\b|\bibc\b|\bnclt\b|\bcirp\b|resolution plan|resolution professional|liquidator|corporate debtor|bankruptcy code"), _rule_insolvency),
    ("sebi",        re.compile(r"\bsebi\b|securities and exchange board|\blodr\b|insider trading|takeover code"), _rule_sebi),
    ("rbi",         re.compile(r"\brbi\b|reserve bank of india|\bnbfc\b|master direction|digital lending|\bkyc\b norms"), _rule_rbi),
    ("competition", re.compile(r"competition act|competition commission|\bcci\b|abuse of dominance|\bcartel\b|combination approval"), _rule_competition),
    ("dpdp",        re.compile(r"\bdpdp\b|data protection|personal data|data breach|\bcert-in\b|privacy law|data fiduciary"), _rule_dpdp),
    ("pmla/fema",   re.compile(r"\bpmla\b|money laundering|enforcement directorate|\bfema\b|foreign exchange management|\bfdi\b|foreign direct investment|\bfcra\b"), _rule_fema_pmla),
    ("tax",         re.compile(r"\bgst\b|\bcbic\b|\bcbdt\b|income[- ]tax|\bitat\b|\bcestat\b|customs duty|transfer pricing|tax tribunal"), _rule_tax),
    ("consumer",    re.compile(r"\bccpa\b|misleading advertis|\basci\b|dark pattern|comparative advertis"), _rule_consumer),
    ("arbitration", re.compile(r"arbitration|arbitral|arbitrator"), _rule_arbitration),
    ("ip",          re.compile(r"trademark|trade mark|passing off|patent infringement|copyright infring|geographical indication"), _rule_ip),
    ("companies",   re.compile(r"companies act|scheme of arrangement|\bnclat\b|ministry of corporate affairs"), _rule_companies),
]


def native_why_it_matters(headline, section, text):
    """(brief, rule_name) when a domain rule fires on this story, else (None, None)."""
    if section not in _RULE_SECTIONS:
        return None, None
    blob = clean(f"{headline}. {text}")
    sig = extract_signals(blob)
    # The regime must be the story's subject — in the headline or the opening
    # sentence — not just mentioned in passing further down.
    first = (split_sentences(text) or [""])[0]
    subject = f"{headline}. {first}".lower()
    for name, trigger, build in _RULES:
        if trigger.search(subject):
            return build(headline, blob, sig, section), name
    return None, None


# ── one call per story ───────────────────────────────────────────────────────

def analyse(headline, section, excerpts):
    """Everything the native engine can say about a story.

    Returns {"summary", "summaryQuality", "facts", "whyItMatters", "rule"}; any of the
    text fields may be None — the caller decides whether that warrants an AI call."""
    excerpts = [e for e in (clean(x) for x in excerpts) if e]
    text = " ".join(excerpts)
    summary, quality = native_summary(headline, excerpts)
    why, rule = native_why_it_matters(headline, section, text)
    return {
        "summary": summary,
        "summaryQuality": quality,
        "facts": facts_from_signals(extract_signals(f"{headline}. {text}")),
        "whyItMatters": why,
        "rule": rule,
    }
