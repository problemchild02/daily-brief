#!/usr/bin/env python3
"""
fetch_stories.py — Daily Brief RSS Fetcher
Pulls from curated RSS feeds, maps items to story-schema.json,
writes stories.json. Run locally or via GitHub Actions.

Section keys: legal, business, reliance, retail, tech, world, sports, opinion
Reliance stories are dual-tagged: they appear in both 'reliance' AND 'business' sections.

Flags:
  --debug   Run full fetch + print diagnostics, but do NOT write stories.json.
            Useful for diagnosing feed failures without touching the live file.

Manual refresh:
  Run at any time via: python fetch_stories.py
  Or via GitHub Actions → Actions tab → Daily Brief Auto-Update → Run workflow.
  The site reflects the new stories.json automatically on every commit to main.
"""

import json, hashlib, re, sys, time, shutil, os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from xml.etree import ElementTree as ET
from urllib.request import urlopen, Request, build_opener, HTTPRedirectHandler
from urllib.error import URLError, HTTPError
from html import unescape

import analysis_engine as ae   # native (zero-token) summary / facts / why-it-matters

DEBUG_MODE = "--debug" in sys.argv

# ── AI summarisation config ────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
AI_ENABLED        = bool(ANTHROPIC_API_KEY)
AI_MODEL          = "claude-haiku-4-5-20251001"
AI_WORKERS        = 1
AI_CALL_DELAY     = 1   # Haiku is fast; 1s gap is plenty

# ── CONFIG ─────────────────────────────────────────────────────────────────────
# Each entry: (url, primary_section, tags, priority)
# Stories tagged reliance are ALSO injected into business (dual-tagging).
FEEDS = [
    # ── Legal ──────────────────────────────────────────────────────────────────
    # Direct publisher feeds first — a real article page on a real news site has an
    # og:image tag we can actually scrape; a Google News redirect link almost never
    # does (it's a Google-hosted interstitial, not the article, and Google actively
    # blocks non-browser requests to it). Google News feeds are still included below
    # as a volume fallback (their own RSS *feed* endpoint is reliably fetchable even
    # when they fill up first), but only get to fill whatever's left of the 8-story
    # cap after these direct sources have had their turn — previously they were
    # listed first and were crowding LiveLaw/Bar & Bench/etc. out of the section
    # entirely on runs where Google News alone returned 8+ items.
    ("https://www.livelaw.in/rss/top-stories",
     "legal", ["courts", "litigation", "India"], "high"),
    ("https://www.barandbench.com/feed",
     "legal", ["bar-and-bench", "India"], "high"),
    # SCC Online latest
    ("https://www.scconline.com/blog/feed/",
     "legal", ["SCC", "India", "courts"], "medium"),
    # NDTV Law — extra fallback
    ("https://feeds.feedburner.com/ndtvnews-law",
     "legal", ["NDTV", "law", "India"], "low"),
    # The Print — law & policy
    ("https://theprint.in/category/judiciary/feed/",
     "legal", ["the-print", "judiciary", "India"], "medium"),
    # Google News — works reliably from cloud IPs (US locale avoids geo-mismatch),
    # fills whatever's left of the section after the direct feeds above.
    ("https://news.google.com/rss/search?q=Supreme+Court+India+OR+High+Court+India&hl=en&gl=US&ceid=US:en",
     "legal", ["courts", "India", "google-news"], "high"),
    ("https://news.google.com/rss/search?q=India+law+legal+court+judgment&hl=en&gl=US&ceid=US:en",
     "legal", ["courts", "India", "google-news"], "medium"),

    # ── Business (general) ────────────────────────────────────────────────────
    # Google News first — US locale works from GitHub Actions cloud IPs
    ("https://news.google.com/rss/search?q=India+business+economy+market&hl=en&gl=US&ceid=US:en",
     "business", ["business", "India", "google-news"], "high"),
    ("https://news.google.com/rss/search?q=India+economy+finance+corporate+BSE+NSE&hl=en&gl=US&ceid=US:en",
     "business", ["business", "India", "google-news"], "medium"),
    ("https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
     "business", ["markets", "India"], "high"),
    ("https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms",
     "business", ["industry", "India"], "medium"),
    ("https://www.thehindubusinessline.com/feeder/default.rss",
     "business", ["business-line", "India"], "medium"),
    ("https://www.business-standard.com/rss/home_page_top_stories.rss",
     "business", ["business-standard", "India"], "medium"),
    # Mint top stories
    ("https://www.livemint.com/rss/companies",
     "business", ["mint", "India"], "medium"),
    # India Today business
    ("https://www.indiatoday.in/rss/1206514",
     "business", ["india-today", "business", "India"], "medium"),

    # ── Reliance (dedicated feeds — also dual-tagged into business) ────────────
    # Google News with US locale — most reliable from cloud IPs
    ("https://news.google.com/rss/search?q=Reliance+Industries+OR+Jio+OR+Mukesh+Ambani&hl=en&gl=US&ceid=US:en",
     "reliance", ["reliance", "RIL", "google-news"], "high"),
    ("https://economictimes.indiatimes.com/topic/reliance-industries/rssfeeds/52857114.cms",
     "reliance", ["reliance", "RIL", "Jio"], "high"),
    ("https://retail.economictimes.indiatimes.com/rss/topstories",
     "reliance", ["reliance-retail", "retail", "JioMart"], "medium"),

    # ── Retail (broader) ──────────────────────────────────────────────────────
    ("https://news.google.com/rss/search?q=India+retail+FMCG+ecommerce+consumer&hl=en&gl=US&ceid=US:en",
     "retail", ["retail", "India", "google-news"], "high"),
    ("https://retail.economictimes.indiatimes.com/rss/topstories",
     "retail", ["retail", "India"], "high"),
    ("https://www.thehindubusinessline.com/feeder/default.rss",
     "retail", ["business-line", "retail"], "low"),
    # Livemint retail
    ("https://www.livemint.com/rss/industry",
     "retail", ["mint", "retail"], "low"),

    # ── Tech ──────────────────────────────────────────────────────────────────
    # India-focused: startup, policy, regulation (DPDP, MeitY, fintech)
    ("https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms",
     "tech", ["ET-tech", "India-tech"], "high"),
    ("https://news.google.com/rss/search?q=India+tech+DPDP+MeitY+startup+AI+regulation&hl=en&gl=US&ceid=US:en",
     "tech", ["India-tech", "DPDP", "MeitY", "google-news"], "high"),
    ("https://www.medianama.com/feed/",
     "tech", ["medianama", "India-tech-policy"], "high"),
    ("https://inc42.com/feed/",
     "tech", ["inc42", "India-startup"], "medium"),
    ("https://yourstory.com/feed",
     "tech", ["yourstory", "India-startup"], "medium"),
    ("https://techcrunch.com/feed/",
     "tech", ["techcrunch", "startups"], "medium"),
    ("https://www.ndtv.com/feed/tech-gadgets",
     "tech", ["NDTV", "India-tech"], "low"),

    # ── World ─────────────────────────────────────────────────────────────────
    # VOA + NPR: public broadcasters, no bot-blocking, designed for aggregation
    ("https://feeds.voanews.com/rss/english/news",
     "world", ["VOA", "world"], "high"),
    ("https://feeds.npr.org/1004/rss.xml",
     "world", ["NPR", "world"], "high"),
    # Google News world — US locale works from cloud IPs
    ("https://news.google.com/rss/search?q=India+world+news+international&hl=en&gl=US&ceid=US:en",
     "world", ["world", "google-news"], "high"),
    ("https://news.google.com/rss/search?q=world+news+geopolitics&hl=en&gl=US&ceid=US:en",
     "world", ["world", "google-news"], "medium"),
    # These may be blocked from cloud IPs but try anyway
    ("https://feeds.bbci.co.uk/news/world/asia/india/rss.xml",
     "world", ["BBC", "India"], "medium"),
    ("https://www.aljazeera.com/xml/rss/all.xml",
     "world", ["Al-Jazeera", "geopolitics"], "medium"),
    ("https://feeds.reuters.com/reuters/topNews",
     "world", ["Reuters", "world"], "medium"),
    ("https://www.theguardian.com/world/rss",
     "world", ["Guardian", "world"], "low"),

    # ── Sports ────────────────────────────────────────────────────────────────
    # Cricket
    ("https://news.google.com/rss/search?q=cricket+India+IPL+Test+match&hl=en&gl=US&ceid=US:en",
     "sports", ["cricket", "India", "google-news"], "high"),
    ("https://www.espncricinfo.com/rss/content/story/feeds/0.xml",
     "sports", ["cricket", "espncricinfo"], "high"),
    ("https://www.cricbuzz.com/rss-feeds/cricket-news",
     "sports", ["cricket", "cricbuzz"], "medium"),
    # Football / Soccer — international and India
    ("https://news.google.com/rss/search?q=football+soccer+Premier+League+UEFA+Champions+League&hl=en&gl=IN&ceid=IN:en",
     "sports", ["football", "soccer", "Premier-League"], "high"),
    ("https://news.google.com/rss/search?q=Indian+Super+League+ISL+Indian+football+soccer&hl=en&gl=US&ceid=US:en",
     "sports", ["football", "ISL", "India"], "high"),
    ("https://feeds.bbci.co.uk/sport/football/rss.xml",
     "sports", ["football", "BBC-sport"], "medium"),
    # General India sports
    ("https://timesofindia.indiatimes.com/rss/4719148.cms",
     "sports", ["sports", "TOI", "India"], "low"),

    # ── Opinion ───────────────────────────────────────────────────────────────
    # Google News opinion — reliable from cloud IPs
    ("https://news.google.com/rss/search?q=India+opinion+editorial+analysis&hl=en&gl=US&ceid=US:en",
     "opinion", ["opinion", "India", "google-news"], "high"),
    # Scroll.in and The Wire — independent Indian outlets, tend to be accessible
    ("https://scroll.in/rss",
     "opinion", ["scroll", "India", "opinion"], "high"),
    ("https://thewire.in/feed",
     "opinion", ["the-wire", "India", "opinion"], "high"),
    ("https://economictimes.indiatimes.com/opinion/rssfeeds/897228639.cms",
     "opinion", ["ET-opinion"], "low"),
    ("https://www.thehindu.com/opinion/feeder/default.rss",
     "opinion", ["the-hindu", "opinion"], "medium"),
    # The Print opinion
    ("https://theprint.in/category/opinion/feed/",
     "opinion", ["the-print", "opinion"], "medium"),
]

# Canonical section order — mirrors the UI tab order
ALL_SECTIONS = ["legal", "business", "reliance", "retail", "tech", "world", "sports", "opinion"]

# The old canned per-section notes. No longer attached to stories — kept only so
# enrichment can recognise them in a previous stories.json and refuse to "reuse" one.
CONTEXT_NOTE_REQUIRED = {"legal", "business", "reliance", "retail", "tech", "world", "sports", "opinion"}

CONTEXT_TEMPLATES = {
    "legal":    "This ruling or regulatory action may affect litigation strategy, compliance obligations, or precedent applicable to your practice — verify the full order via the source link.",
    "business": "Corporate developments like this can trigger due diligence, disclosure obligations, or restructuring considerations relevant to transactional and advisory work.",
    "reliance": "Reliance group moves often signal shifts in regulatory posture, M&A activity, or sector-wide compliance trends worth tracking for corporate and commercial practice.",
    "retail":   "Retail sector changes can implicate FDI rules, consumer protection law, and e-commerce policy — areas of growing regulatory activity in India.",
    "tech":     "Technology and data regulation is evolving rapidly in India (DPDP, MeitY, IT Rules) — this development may have compliance or advisory implications.",
    "world":    "International developments affecting trade, sanctions, or cross-border investment can directly impact Indian law practice and client advisories.",
    "sports":   "Sports governance and media rights increasingly involve contract, IP, and regulatory disputes — worth tracking for sports law and entertainment practice.",
    "opinion":  "Editorial perspective — useful for understanding the direction of regulatory discourse and anticipating legislative or policy shifts.",
}

MAX_PER_SECTION  = 8    # max stories kept per section
MAX_AGE_HOURS    = 240  # 10 days — survives long weekends, holidays, feed outages
FEED_TIMEOUT_SEC = 20   # per-feed HTTP timeout
FEED_DELAY_SEC   = 0.3  # pause between feed fetches
FEED_RETRIES     = 2    # number of retry attempts on network errors
FALLBACK_FILE    = "stories.fallback.json"  # used if 0 stories fetched
IST = timezone(timedelta(hours=5, minutes=30))

# Keywords that mark a Business-feed story as also Reliance-relevant
RELIANCE_KEYWORDS = [
    "reliance", "ril", "jio", "mukesh ambani", "ambani",
    "jiomart", "jio cinema", "jio hotstar", "jio financial",
    "reliance retail", "reliance jio", "reliance industries",
]

SOURCE_MAP = {
    "livelaw":               "Live Law",
    "barandbench":           "Bar & Bench",
    "scconline":             "SCC Online",
    "retail.economictimes":  "ET Retail",
    "economictimes":         "Economic Times",
    "hindubusinessline":     "Business Line",
    "thehindubusinessline":  "Business Line",
    "business-standard":     "Business Standard",
    "livemint":              "Mint",
    "indiatoday":            "India Today",
    "medianama.com":         "MediaNama",
    "inc42.com":             "Inc42",
    "yourstory.com":         "YourStory",
    "bbci.co.uk/sport":      "BBC Sport",
    "techcrunch":            "TechCrunch",
    "gadgets360":            "Gadgets 360",
    "feedburner.com/gadgets": "Gadgets 360",
    "ndtv.com/feed/tech":    "NDTV Tech",
    "sports.ndtv":           "NDTV Sports",
    "ndtv.com":              "NDTV",
    "feeds.feedburner.com/ndtv": "NDTV",
    "theverge":              "The Verge",
    "arstechnica":           "Ars Technica",
    "techcrunch":            "TechCrunch",
    "nytimes":               "The New York Times",
    "bbci.co":               "BBC News",
    "bbc.co":                "BBC News",
    "aljazeera":             "Al Jazeera",
    "reuters":               "Reuters",
    "theguardian":           "The Guardian",
    "rsshub.app/apnews":     "AP News",
    "voanews":               "VOA News",
    "feeds.npr":             "NPR",
    "espncricinfo.com":      "ESPNcricinfo",
    "espncricinfo":          "ESPN Cricinfo",
    "cricbuzz.com":          "Cricbuzz",
    "cricbuzz":              "Cricbuzz",
    "timesofindia":          "Times of India",
    "thehindu":              "The Hindu",
    "theprint":              "The Print",
    "scroll.in":             "Scroll",
    "thewire":               "The Wire",
    "news.google":           "Google News",
}


# ── HELPERS ────────────────────────────────────────────────────────────────────

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def fetch_feed(url, retries=FEED_RETRIES):
    """Fetch a feed URL with retry logic. Returns raw bytes or None."""
    for attempt in range(1, retries + 1):
        try:
            req = Request(url, headers=_HEADERS)
            with urlopen(req, timeout=FEED_TIMEOUT_SEC) as r:
                data = r.read()
                print(f"    OK  ({len(data):,} bytes)", file=sys.stderr)
                return data
        except HTTPError as e:
            print(f"    HTTP {e.code} — skipping  {url}", file=sys.stderr)
            return None  # 4xx/5xx — don't retry
        except Exception as e:
            if attempt < retries:
                wait = attempt * 2
                print(f"    FAIL attempt {attempt}/{retries}: {e}  — retry in {wait}s",
                      file=sys.stderr)
                time.sleep(wait)
            else:
                print(f"    FAIL (all {retries} attempts): {e}", file=sys.stderr)
                return None


def strip_html(text):
    text = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r"\s+", " ", unescape(text)).strip()


_BOILERPLATE_RE = re.compile(
    r"\s*[\u2026\.]?\s*"
    r"(?:Read (?:the )?full story\b.*"
    r"|Read more\b.*"
    r"|Continue reading\b.*"
    r"|The post .+? appeared first on .+?"
    r"|Image:.{0,120}$"
    r")$",
    re.IGNORECASE | re.DOTALL,
)

# Domains that should never appear as news stories (encyclopedias, dictionaries, etc.)
_JUNK_DOMAINS = {
    "britannica.com", "wikipedia.org", "wikimedia.org",
    "merriam-webster.com", "dictionary.com", "investopedia.com",
    "thoughtco.com", "thefreedictionary.com",
}


def is_junk_url(url):
    try:
        from urllib.parse import urlparse
        host = urlparse(url).netloc.lower().lstrip("www.")
        return any(host == d or host.endswith("." + d) for d in _JUNK_DOMAINS)
    except Exception:
        return False


_JUNK_HEADLINE_RE = re.compile(
    r"(?i)(yearly results|annual results|financial summary|share price today|"
    r"nse/bse|stock price live|archives \d{4}|q\d results.*financial|"
    r"memorial day sale|best .* deals? .*(weekend|today)|"
    r"\d+ deals? (we recommend|under \$))",
    re.IGNORECASE,
)

def is_junk_headline(headline):
    return bool(_JUNK_HEADLINE_RE.search(headline))


def _norm(text):
    """Lowercase + collapse whitespace + strip trailing ellipsis for comparison."""
    return re.sub(r"\s+", " ", text.lower().strip()).rstrip("\u2026")

_LEADING_JUNK_RE = re.compile(
    r"^(?:\|\s*)?(?:Image|Photo|Video|Illustration|Screenshot):[^.!?]{0,120}\.?\s*",
    re.IGNORECASE,
)


def clean_boilerplate(text):
    """Strip leading image captions and trailing RSS boilerplate from description text."""
    text = _LEADING_JUNK_RE.sub("", text)
    return _BOILERPLATE_RE.sub("", text).strip()


def truncate(text, maxlen):
    text = text.strip()
    if len(text) <= maxlen:
        return text
    return text[:maxlen].rsplit(" ", 1)[0].rstrip(",.;:") + "\u2026"


def make_id(section, url):
    return f"{section}-{hashlib.sha1(url.encode()).hexdigest()[:8]}"


def fetch_article_text(url):
    """Stub — article fetching removed; AI now works from RSS metadata only."""
    return None


_READER_PROFILE = (
    "The reader is an Indian lawyer / legal professional who tracks: "
    "Indian courts and tribunals (Supreme Court, High Courts, NCLT, NCLAT, SEBI, CCI, ED, etc.), "
    "large Indian corporates especially Reliance Industries and its subsidiaries (Jio, Jio Financial, etc.), "
    "startup and tech regulation (DPDP Act, MeitY, fintech, edtech, ecommerce policy), "
    "and global business / geopolitics that affects Indian law, cross-border M&A, or compliance practice."
)

_SECTION_HINTS = {
    "legal":    "legal/court story — judgment, order, petition, regulatory action",
    "business": "business/corporate story — deals, earnings, corporate governance",
    "reliance": "Reliance Industries group story — RIL, Jio, Jio Financial, Reliance Retail",
    "retail":   "retail sector story",
    "tech":     "technology/regulation story",
    "world":    "global/international story",
    "sports":   "sports story",
    "opinion":  "opinion or editorial piece",
}


_BANNED_PHRASES = (
    "may affect", "may have implications", "may impact", "could have implications",
    "could affect", "is worth noting", "worth tracking", "worth watching",
    "remains to be seen", "in today's", "in an ever-evolving", "landscape",
    "growing regulatory activity", "increasingly important", "stay tuned",
)

# ── Multi-provider AI backend ────────────────────────────────────────────────
# Three providers, tried in order until one returns a usable result. Order is
# cost-aware, not just reliability-aware: Gemini's free tier costs nothing, so
# it goes first for routine sections; Claude Haiku is the best-tuned prompt
# (see the practitioner-brief voice below) and the most expensive per call, so
# it's reserved for the two sections that are this product's actual
# differentiator (legal, reliance — see IMPLEMENTATION_SPEC.md §2.11) and used
# as a last resort elsewhere. Any provider whose key isn't set is skipped.
GEMINI_API_KEY  = os.environ.get("GEMINI_API_KEY", "")
OPENAI_API_KEY  = os.environ.get("OPENAI_API_KEY", "")
GEMINI_MODEL    = "gemini-3.6-flash"
OPENAI_MODEL    = "gpt-4o-mini"
ANY_AI_ENABLED  = bool(ANTHROPIC_API_KEY or GEMINI_API_KEY or OPENAI_API_KEY)

_QUALITY_FIRST_SECTIONS = {"legal", "reliance"}

# A fourth, optional provider for any OpenAI-compatible endpoint — Groq,
# OpenRouter, DeepSeek, Mistral, Together, or a local Ollama / LM Studio server
# (free, no tokens billed). Configure with three env vars, no code change:
#   AI_FALLBACK_BASE_URL  e.g. https://api.groq.com/openai/v1   (or http://localhost:11434/v1)
#   AI_FALLBACK_MODEL     e.g. llama-3.3-70b-versatile
#   AI_FALLBACK_API_KEY   (may be blank for a local server)
# It is always tried last unless AI_PROVIDER_ORDER lists it explicitly.
FALLBACK_BASE_URL = os.environ.get("AI_FALLBACK_BASE_URL", "").rstrip("/")
FALLBACK_MODEL    = os.environ.get("AI_FALLBACK_MODEL", "")
FALLBACK_API_KEY  = os.environ.get("AI_FALLBACK_API_KEY", "")
ANY_AI_ENABLED    = ANY_AI_ENABLED or bool(FALLBACK_BASE_URL and FALLBACK_MODEL)

# Token-spend controls (all optional env vars).
#   AI_PROVIDER_ORDER  comma list overriding the order, e.g. "gemini,custom,openai"
#   AI_MAX_CALLS       hard cap on AI calls per run (default 80) — the native engine
#                      handles everything else, and the cap is spent legal-first
#   AI_MAX_FAILS       consecutive failures before a provider is skipped for the
#                      rest of the run (default 3; quota/billing errors skip it at once)
AI_MAX_CALLS = int(os.environ.get("AI_MAX_CALLS", "80") or 80)
AI_MAX_FAILS = int(os.environ.get("AI_MAX_FAILS", "3") or 3)
NOTE_MAX_TOKENS = 450      # a ~150-word note is ~250 tokens; the rest is headroom
#   AI_SKIP_SECTIONS   comma list of sections that never get an AI note (default:
#                      "sports" — a "why it matters" for in-house counsel is noise
#                      there). Opinion is deliberately NOT skipped: editorials often
#                      carry the regulatory signal. Their summary and facts stay native.
AI_SKIP_SECTIONS = {s.strip() for s in (os.environ.get("AI_SKIP_SECTIONS") or "sports").split(",") if s.strip()}

_PROVIDER_STATE = {}       # name -> {"fails": int, "dead": bool}, reset each run


def _provider_order(section):
    forced = [n.strip().lower() for n in os.environ.get("AI_PROVIDER_ORDER", "").split(",") if n.strip()]
    forced = [n for n in forced if n in _PROVIDERS]
    if forced:
        return forced
    free = [n for n, p in _PRESETS.items() if p.get("tier") == "free"]
    paid = [n for n, p in _PRESETS.items() if p.get("tier") != "free"]
    if section in _QUALITY_FIRST_SECTIONS:
        base = ["anthropic", "gemini", "openai"] + free + paid
    else:
        # Free allowances first, then the paid ones; Claude last (dearest per token).
        base = ["gemini"] + free + ["openai"] + paid + ["anthropic"]
    return [n for n in base + ["custom"] if n in _PROVIDERS]


def _provider_usable(name):
    return name in _PROVIDERS and _PROVIDERS[name][1]() and not _PROVIDER_STATE.get(name, {}).get("dead", False)


def _note_provider_result(name, ok, exhausted=False):
    st = _PROVIDER_STATE.setdefault(name, {"fails": 0, "dead": False})
    if ok:
        st["fails"] = 0
        return
    st["fails"] += 1
    if exhausted or st["fails"] >= AI_MAX_FAILS:
        st["dead"] = True
        why = "out of quota/credit" if exhausted else f"{st['fails']} failures in a row"
        print(f"      [{name}] disabled for the rest of this run ({why})", file=sys.stderr)


def _build_note_prompt(headline, section, source, tags, excerpt, summary, facts):
    """Prompt for ONLY the "why it matters" note. The summary and the extracted
    facts are already known (native engine), so they go in as context instead of
    being asked for again — about half the output tokens of the old both-fields
    call, and a shorter input than before (excerpt capped at 450 chars)."""
    facts_str = "; ".join(f"{f['label']}: {f['value']}" for f in facts) or "none extracted"
    body = (summary or excerpt or "")[:450].strip()
    no_text = "" if body else (
        "\nNo article text is available — only the headline. Ground the analysis in what "
        "you actually know about the named people, companies, statutes or events; do not "
        "pad with vague sector commentary and do not invent facts about this story."
    )
    return f"""{_READER_PROFILE}

Section: {_SECTION_HINTS.get(section, section)} | Source: {source} | Tags: {", ".join(tags or [])}
Headline: {headline}
Key facts found in the text: {facts_str}
What the article reports: {body or "(none)"}
{no_text}
Write like a sharp analyst briefing a busy colleague. No generic filler that fits any story; if you have no specific fact, say less. Never use these phrases: {", ".join(f'"{p}"' for p in _BANNED_PHRASES)}.

Return ONLY raw JSON: {{"contextNote": "Grounded analysis, separate from the article. Name the specific statute (with section if known), regulator, tribunal or precedent — not just the area of law; cite real case law if it applies, else say none is on point. Then 2-3 numbered implications inline '(1) ... (2) ...' for what Indian in-house counsel should do, check or watch because of THIS story. 100-160 words."}}"""


class _ProviderExhausted(Exception):
    """Billing/quota failure — retrying the same provider won't help."""


class _NoRedirect(HTTPRedirectHandler):
    """urllib silently turns a redirected POST into a GET and follows it, which
    surfaces as a baffling "empty reply". Refuse to follow: the 3xx becomes an
    HTTPError and the log shows where the server tried to send us."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_API_OPENER = build_opener(_NoRedirect)
_API_USER_AGENT = "daily-brief/1.0 (+https://github.com/problemchild02/daily-brief)"


def _post_json(url, payload, headers, timeout=30):
    import json as _json
    headers = {"User-Agent": _API_USER_AGENT, **headers}
    req = Request(url, data=_json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    with _API_OPENER.open(req, timeout=timeout) as resp:
        raw = resp.read()
        try:
            return _json.loads(raw.decode("utf-8"))
        except ValueError:
            # Say what actually came back — "Expecting value: char 0" tells nobody anything.
            raise RuntimeError(
                f"non-JSON reply (HTTP {resp.status}, {resp.headers.get('Content-Type')}, "
                f"{len(raw)} bytes): {raw[:160]!r}"
            )


def _strip_json_fences(raw):
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    return re.sub(r"\s*```$", "", raw)


def _call_anthropic_raw(prompt, max_tokens=900):
    import json as _json
    try:
        result = _post_json(
            "https://api.anthropic.com/v1/messages",
            {"model": AI_MODEL, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}]},
            {
                "Content-Type":      "application/json",
                "x-api-key":         ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
            },
        )
        return result["content"][0]["text"]
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        if e.code in (400, 429) and ("credit balance" in body.lower() or "quota" in body.lower()):
            raise _ProviderExhausted(body[:200])
        raise RuntimeError(f"HTTP {e.code}: {body[:200]}")


def _call_gemini_raw(prompt, max_tokens=900):
    import json as _json
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
        f"?key={GEMINI_API_KEY}"
    )
    try:
        result = _post_json(
            url,
            {
                "contents": [{"parts": [{"text": prompt}]}],
                # Newer Gemini models spend part of this budget "thinking" before they
                # write; a tight cap (450) came back empty or cut off mid-JSON. Billing
                # is for tokens actually generated, so a roomy cap costs nothing extra.
                "generationConfig": {"temperature": 0.4, "maxOutputTokens": max(max_tokens, 2048)},
            },
            {"Content-Type": "application/json"},
        )
        return result["candidates"][0]["content"]["parts"][0]["text"]
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        if e.code == 429 or "quota" in body.lower() or "RESOURCE_EXHAUSTED" in body:
            raise _ProviderExhausted(body[:200])
        raise RuntimeError(f"HTTP {e.code}: {body[:200]}")


def _call_openai_raw(prompt, max_tokens=900):
    try:
        result = _post_json(
            "https://api.openai.com/v1/chat/completions",
            {
                "model": OPENAI_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.4,
                "max_tokens": max_tokens,
                "response_format": {"type": "json_object"},
            },
            {
                "Content-Type":  "application/json",
                "Authorization": f"Bearer {OPENAI_API_KEY}",
            },
        )
        return result["choices"][0]["message"]["content"]
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        if e.code == 429 or "insufficient_quota" in body.lower() or "billing" in body.lower():
            raise _ProviderExhausted(body[:200])
        raise RuntimeError(f"HTTP {e.code}: {body[:200]}")


def _load_presets():
    """The extra OpenAI-compatible providers from ai-providers.json (see that file)."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ai-providers.json")
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f).get("providers", [])
    except Exception as e:
        print(f"   ! ai-providers.json not loaded ({e}); extra providers unavailable", file=sys.stderr)
        return []


_PRESETS = {p["name"]: p for p in _load_presets()}


def _preset_setting(name, what):
    """A preset's key/model/base URL, with <NAME>_MODEL / <NAME>_BASE_URL overrides."""
    p = _PRESETS[name]
    if what == "key":
        return os.environ.get(p["keyEnv"], "")
    env = os.environ.get(f"{name.upper()}_{'MODEL' if what == 'model' else 'BASE_URL'}", "")
    return env or p["model" if what == "model" else "baseUrl"]


def _call_preset_raw(name, prompt, max_tokens=900):
    key = _preset_setting(name, "key")
    base = _preset_setting(name, "base").rstrip("/")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {key}",
        **_PRESETS[name].get("headers", {}),
    }
    try:
        result = _post_json(
            f"{base}/chat/completions",
            {
                "model": _preset_setting(name, "model"),
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.4,
                "max_tokens": max(max_tokens, _PRESETS[name].get("minTokens", 0)),
                **_PRESETS[name].get("body", {}),
            },
            headers,
            timeout=45,
        )
        return result["choices"][0]["message"]["content"]
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        # 429 covers both a spent daily allowance and a per-minute limit; either
        # way, hammering it for the remaining stories only wastes the run.
        if e.code in (402, 429) or "quota" in body.lower() or "insufficient" in body.lower():
            raise _ProviderExhausted(body[:200])
        where = f" -> {e.headers.get('Location')}" if 300 <= e.code < 400 else ""
        raise RuntimeError(f"HTTP {e.code}{where}: {body[:200]}")


def _call_custom_raw(prompt, max_tokens=900):
    """Any OpenAI-compatible /chat/completions endpoint (see FALLBACK_* above)."""
    headers = {"Content-Type": "application/json"}
    if FALLBACK_API_KEY:
        headers["Authorization"] = f"Bearer {FALLBACK_API_KEY}"
    try:
        result = _post_json(
            f"{FALLBACK_BASE_URL}/chat/completions",
            {
                "model": FALLBACK_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.4,
                "max_tokens": max_tokens,
            },
            headers,
            timeout=60,   # local models are slower
        )
        return result["choices"][0]["message"]["content"]
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        if e.code == 429 or "quota" in body.lower() or "insufficient" in body.lower():
            raise _ProviderExhausted(body[:200])
        raise RuntimeError(f"HTTP {e.code}: {body[:200]}")


_PROVIDERS = {
    "anthropic": (_call_anthropic_raw, lambda: AI_ENABLED),
    "gemini":    (_call_gemini_raw,    lambda: bool(GEMINI_API_KEY)),
    "openai":    (_call_openai_raw,    lambda: bool(OPENAI_API_KEY)),
}
for _name in _PRESETS:
    _PROVIDERS[_name] = (
        (lambda prompt, max_tokens=900, _n=_name: _call_preset_raw(_n, prompt, max_tokens)),
        (lambda _n=_name: bool(_preset_setting(_n, "key"))),
    )
_PROVIDERS["custom"] = (_call_custom_raw, lambda: bool(FALLBACK_BASE_URL and FALLBACK_MODEL))


def _try_provider(name, prompt, label, fields=("contextNote",), max_tokens=NOTE_MAX_TOKENS, budget=None):
    """One provider, up to two attempts (the second only when the first used banned
    hedging language). Returns {field: text, "enrichedBy": name} or None. Tracks
    failures so a dead provider stops being called for the rest of the run."""
    call_fn = _PROVIDERS[name][0]
    banned_hint = ""
    result = None
    for attempt in range(2):
        if budget is not None and not budget.left():
            break
        try:
            raw = call_fn(prompt + banned_hint, max_tokens)
            # Only a call that got a reply from the model spends tokens — a refused
            # or failed request (no credit, rate limit, outage) doesn't count
            # against the cap.
            if budget is not None:
                budget.spend()
        except _ProviderExhausted as e:
            print(f"      [{name}] exhausted: {e}", file=sys.stderr)
            _note_provider_result(name, False, exhausted=True)
            return None
        except Exception as e:
            print(f"      [{name}] error: {e}", file=sys.stderr)
            _note_provider_result(name, False)
            return None
        try:
            data = json.loads(_strip_json_fences(raw))
        except Exception as e:
            print(f"      [{name}] bad JSON: {e}", file=sys.stderr)
            _note_provider_result(name, False)
            return None
        values = {f: str(data.get(f, "")).strip() for f in fields}
        if not all(values.values()):
            _note_provider_result(name, False)
            return None
        result = {**values, "enrichedBy": name}
        combined_lower = " ".join(values.values()).lower()
        if attempt == 0 and any(p in combined_lower for p in _BANNED_PHRASES):
            banned_hint = (
                "\n\nYour previous attempt used generic hedging language "
                "(e.g. \"may affect\", \"worth tracking\"). Rewrite with concrete, "
                "specific claims instead — name the actual mechanism or "
                "implication, don't gesture at one."
            )
            continue
        break
    if result:
        _note_provider_result(name, True)
        print(f"   ✓ [{name}] {label}", file=sys.stderr)
    return result


class _AIBudget:
    """Counts AI calls for the run so a bad day can't run up an unbounded bill."""
    def __init__(self, cap):
        self.cap, self.used = cap, 0

    def left(self):
        return self.used < self.cap

    def spend(self):
        self.used += 1


def ai_note_for_story(story, excerpt, summary, facts, budget):
    """The "why it matters" note from the first working provider, in cost-aware
    order, or None. Only called when the native engine had no brief for the story."""
    prompt = _build_note_prompt(
        story["headline"], story["section"], story.get("source", ""),
        story.get("tags", []), excerpt, summary, facts,
    )
    label = story["headline"][:60]
    for name in _provider_order(story["section"]):
        if not _provider_usable(name):
            continue
        if not budget.left():
            return None
        result = _try_provider(name, prompt, label, budget=budget)
        if result:
            return result
    return None


def parse_date(item):
    ns = {"dc": "http://purl.org/dc/elements/1.1/"}
    raw = None
    for tag in ["pubDate", "dc:date"]:
        el = item.find(tag, ns) if ":" in tag else item.find(tag)
        if el is not None and el.text:
            raw = el.text.strip()
            break
    if not raw:
        return None
    for fmt in [
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S GMT",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%SZ",
    ]:
        try:
            dt = datetime.strptime(raw, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None


def date_label(dt):
    """Return a human-readable date label. Uses cross-platform strftime (no %-I)."""
    if dt is None:
        return "Today"
    local = dt.astimezone(IST)
    today = datetime.now(IST).date()
    hour = local.hour % 12 or 12
    minute = local.strftime("%M")
    ampm = "AM" if local.hour < 12 else "PM"
    time_str = f"{hour}:{minute} {ampm} IST"
    if local.date() == today:
        return f"Today, {time_str}"
    elif local.date() == today - timedelta(days=1):
        return f"Yesterday, {time_str}"
    return local.strftime("%d %b %Y")


def is_reliance_story(headline, summary):
    """Return True if the text mentions Reliance group keywords."""
    text = (headline + " " + summary).lower()
    return any(kw in text for kw in RELIANCE_KEYWORDS)


def build_story(section, feed_url, url, pub_dt, headline, hook, summary, tags, priority, image_url=None):
    """Construct a story dict."""
    source = "News Feed"
    feed_lower = feed_url.lower()
    for key, name in SOURCE_MAP.items():
        if key in feed_lower:
            source = name
            break

    pub_iso = pub_dt.isoformat() if pub_dt else datetime.now(timezone.utc).isoformat()

    story = {
        "id":          make_id(section, url),
        "section":     section,
        "headline":    headline,
        "hook":        hook,
        "summary":     summary,
        "source":      source,
        "sourceUrl":   url,
        "dateLabel":   date_label(pub_dt),
        "publishedAt": pub_iso,
        "wordCount":   len((summary + " " + hook).split()),
        "tags":        tags[:8],
        "priority":    priority,
    }
    if image_url:
        story["imageUrl"] = image_url
    # No canned "why it matters" is attached here any more: enrich_stories() sets
    # contextNote from the native engine or an AI provider, and leaves it unset
    # when neither has anything concrete — the site then shows no brief rather
    # than the same sentence on every story in a section.
    return story


# ── IMAGE EXTRACTION ───────────────────────────────────────────────────────────

_MEDIA_NS = {"media": "http://search.yahoo.com/mrss/"}

IMAGE_FETCH_TIMEOUT_SEC = 6
IMAGE_FETCH_WORKERS     = 8
IMAGE_MAX_BYTES         = 200_000

_OG_IMAGE_RE     = re.compile(
    r'<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\'][^>]+content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)
_OG_IMAGE_RE_REV = re.compile(
    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\']',
    re.IGNORECASE,
)

_IMAGE_WIDTH_PARAM_RE = re.compile(r'([?&])(w|width)=(\d+)', re.IGNORECASE)


def upsize_image_url(url, min_width=800):
    """Several CDNs used by Indian publishers (e.g. assettype.com — Bar & Bench and
    others) embed a `w=`/`width=` query param in their og:image URL, sized for their
    own small article-list thumbnails (seen as low as 280px). Our cards render wider
    than that on most devices, so the browser upscales the small source and it looks
    soft/blurry. If the URL already asks for a width below min_width, bump it up;
    leave everything else (no such param, or already large enough) untouched."""
    def _bump(m):
        if int(m.group(3)) >= min_width:
            return m.group(0)
        return f"{m.group(1)}{m.group(2)}={min_width}"
    return _IMAGE_WIDTH_PARAM_RE.sub(_bump, url, count=1)


def extract_rss_image(item):
    """Look for an image URL embedded directly in the RSS item — no network call."""
    thumb = item.find("media:thumbnail", _MEDIA_NS)
    if thumb is not None and thumb.get("url"):
        return thumb.get("url").strip()
    for content in item.findall("media:content", _MEDIA_NS):
        medium = content.get("medium") or ""
        ctype  = content.get("type") or ""
        if content.get("url") and (medium == "image" or ctype.startswith("image/")):
            return content.get("url").strip()
    enclosure = item.find("enclosure")
    if enclosure is not None and enclosure.get("url") and (enclosure.get("type") or "").startswith("image/"):
        return enclosure.get("url").strip()
    desc_el = item.find("description")
    if desc_el is not None and desc_el.text:
        m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', desc_el.text)
        if m:
            return m.group(1).strip()
    return None


def fetch_page_meta(url, want_text=True):
    """One download of an article page, mined for both the og:image and the page's
    own description / first paragraphs (fed to the native summary). Never raises.
    Returns (image_url_or_None, reason, page_excerpt)."""
    try:
        req = Request(url, headers=_HEADERS)
        with urlopen(req, timeout=IMAGE_FETCH_TIMEOUT_SEC) as resp:
            raw = resp.read(IMAGE_MAX_BYTES).decode("utf-8", errors="ignore")
        text = ae.extract_page_excerpt(raw) if want_text else ""
        m = _OG_IMAGE_RE.search(raw) or _OG_IMAGE_RE_REV.search(raw)
        if m:
            return upsize_image_url(unescape(m.group(1)).strip()), "ok", text
        return None, "no og:image/twitter:image tag found", text
    except HTTPError as e:
        return None, f"HTTP {e.code}", ""
    except URLError as e:
        return None, f"network error: {e.reason}", ""
    except Exception as e:
        return None, f"{type(e).__name__}: {e}", ""


def fetch_og_image(url):
    """Best-effort fetch of a story's og:image/twitter:image meta tag. Never raises.
    Returns (image_url_or_None, reason) — the reason is only for diagnostic logging,
    e.g. distinguishing "site has no og:image" from "blocked/timed out/network error"
    (Google News redirect links in particular tend to fail here, not just return
    nothing — see the reordered FEEDS comment above)."""
    try:
        req = Request(url, headers=_HEADERS)
        with urlopen(req, timeout=IMAGE_FETCH_TIMEOUT_SEC) as resp:
            raw = resp.read(IMAGE_MAX_BYTES).decode("utf-8", errors="ignore")
        m = _OG_IMAGE_RE.search(raw) or _OG_IMAGE_RE_REV.search(raw)
        if m:
            return upsize_image_url(unescape(m.group(1)).strip()), "ok"
        return None, "no og:image/twitter:image tag found"
    except HTTPError as e:
        return None, f"HTTP {e.code}"
    except URLError as e:
        return None, f"network error: {e.reason}"
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"


# ── ENRICHMENT ─────────────────────────────────────────────────────────────────

def load_previous_stories(path="stories.json"):
    """id -> story from the last run, so unchanged stories keep their (paid-for) analysis."""
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return {st["id"]: st for sec in data.get("sections", {}).values() for st in sec if "id" in st}
    except Exception:
        return {}


def _generic_note(note):
    low = (note or "").lower()
    return (not note) or note in CONTEXT_TEMPLATES.values() or any(p in low for p in _BANNED_PHRASES)


def _reusable_note(prev, story, content_hash):
    """Last run's AI-written note, if it's still valid for this story. Native results
    are never "reused" — they cost nothing, so they're recomputed with the latest rules."""
    if not prev or prev.get("enrichedBy") not in _PROVIDERS or _generic_note(prev.get("contextNote")):
        return None
    if prev.get("enrichHash") is not None:
        same = prev["enrichHash"] == content_hash
    else:   # written before enrichHash existed: same headline is the best signal
        same = prev.get("headline") == story["headline"]
    return {"contextNote": prev["contextNote"], "enrichedBy": prev["enrichedBy"]} if same else None


def enrich_stories(all_stories, page_text, previous):
    """
    Fills summary, contextNote ("why it matters"), facts, enrichedBy, summaryBy.

      1. summary  — always native (extractive; faithful to the source and free).
                    A summary an AI wrote on an earlier run is kept only when the
                    native engine has less to offer.
      2. note     — reuse last run's AI note if the story is unchanged; else the
                    native rule engine if a legal regime is the story's subject;
                    else ONE short AI call (note only), capped by AI_MAX_CALLS and
                    skipping providers that have run out or keep failing.
      3. nothing  — no note is better than a canned one. The site hides it.
    """
    _PROVIDER_STATE.clear()
    budget = _AIBudget(AI_MAX_CALLS)
    stats = {"reused": 0, "native_note": 0, "ai_note": 0, "stale": 0, "extract": 0, "no_note": 0, "skipped_budget": 0}
    by_provider = {}
    need_ai = []
    raw_excerpts = {}

    for story in all_stories:
        content_hash = ae.content_hash(story["headline"], story.get("hook", ""), story.get("summary", ""))
        excerpts = [story.get("hook", ""), story.get("summary", ""), page_text.get(story["id"], "")]
        prev = previous.get(story["id"])
        try:
            a = ae.analyse(story["headline"], story["section"], excerpts)
        except Exception as e:   # the native engine must never take the refresh down
            print(f"   ! native analysis failed for {story['headline'][:50]}: {e}", file=sys.stderr)
            a = {"summary": None, "summaryQuality": None, "facts": [], "whyItMatters": None, "rule": None}

        # — summary —
        prev_ai_summary = (
            prev and prev.get("enrichedBy") in _PROVIDERS and prev.get("summaryBy") in (None, *_PROVIDERS)
            and prev.get("headline") == story["headline"] and (prev.get("summary") or "").strip()
        )
        if a["summaryQuality"] == "good":
            summary, summary_by = a["summary"], "native"
        elif prev_ai_summary:
            summary, summary_by = prev["summary"], prev.get("summaryBy") or prev["enrichedBy"]
        elif a["summary"]:
            summary, summary_by = a["summary"], "native"
        else:
            summary, summary_by = "", None

        # — why it matters —
        note = _reusable_note(prev, story, content_hash)
        if note:
            stats["reused"] += 1
        elif a["whyItMatters"]:
            note = {"contextNote": a["whyItMatters"], "enrichedBy": "native"}
            stats["native_note"] += 1
        elif story["section"] in AI_SKIP_SECTIONS:
            pass   # no note at all: neither a paid call nor extracted "key points"
        else:
            need_ai.append((story, " ".join(filter(None, excerpts))[:900], summary, a["facts"]))
            raw_excerpts[story["id"]] = excerpts

        story["summary"] = summary
        if summary_by:
            story["summaryBy"] = summary_by
        else:
            story.pop("summaryBy", None)
        story["facts"] = a["facts"]
        story["enrichHash"] = content_hash
        story.pop("noteKind", None)
        if note:
            story["contextNote"] = note["contextNote"]
            story["enrichedBy"] = note["enrichedBy"]
        else:
            story.pop("contextNote", None)
            story.pop("enrichedBy", None)

    # The capped AI budget goes legal/reliance-first, high-priority first.
    need_ai.sort(key=lambda t: (t[0]["section"] not in _QUALITY_FIRST_SECTIONS, t[0].get("priority") != "high"))
    active = [n for n in _PROVIDERS if _PROVIDERS[n][1]()]
    if need_ai:
        print(f"\n── AI notes ({len(need_ai)} stories without a native/reused brief; "
              f"providers: {', '.join(active) or 'none configured'}; cap {AI_MAX_CALLS} calls) ──",
              file=sys.stderr)
    for story, excerpt, summary, facts in need_ai:
        if not active:
            continue
        if not budget.left():
            stats["skipped_budget"] += 1
            continue
        before = budget.used
        result = ai_note_for_story(story, excerpt, summary, facts, budget)
        if result:
            story["contextNote"] = result["contextNote"]
            story["enrichedBy"] = result["enrichedBy"]
            stats["ai_note"] += 1
            by_provider[result["enrichedBy"]] = by_provider.get(result["enrichedBy"], 0) + 1
        if budget.used > before:
            time.sleep(AI_CALL_DELAY)

    # ── The safety net: no provider (out of credit, rate-limited, offline) may
    #    leave a story blank when something concrete is available. In order:
    #    last run's AI note for the same headline even if the text drifted a little
    #    (stale beats blank), then key points extracted from the article itself.
    #    Neither costs a token, and both are replaced the next time AI answers.
    for story, excerpt, summary, facts in need_ai:
        if story.get("contextNote"):
            continue
        prev = previous.get(story["id"])
        if (prev and prev.get("enrichedBy") in _PROVIDERS and not _generic_note(prev.get("contextNote"))
                and prev.get("headline") == story["headline"]):
            story["contextNote"], story["enrichedBy"] = prev["contextNote"], prev["enrichedBy"]
            stats["stale"] += 1
            continue
        try:
            points = ae.key_points(story["headline"], raw_excerpts.get(story["id"], []), summary, facts)
        except Exception as e:
            print(f"   ! key points failed for {story['headline'][:50]}: {e}", file=sys.stderr)
            points = None
        if points:
            story["contextNote"], story["enrichedBy"], story["noteKind"] = points, "native", "extract"
            stats["extract"] += 1
        else:
            stats["no_note"] += 1
            print(f"   ✗ no note: {story['headline'][:60]}", file=sys.stderr)

    for story in all_stories:
        story["wordCount"] = len((story.get("summary", "") + " " + story.get("contextNote", "")).split())

    total = len(all_stories)
    breakdown = ", ".join(f"{n}={c}" for n, c in by_provider.items()) or "none"
    saved = (stats["reused"] + stats["native_note"]) * 1300 + total * 350
    print(
        f"\n   Enrichment: {total} stories | reused {stats['reused']} | native brief {stats['native_note']} | "
        f"AI {stats['ai_note']} ({breakdown}; {budget.used} calls) | kept stale {stats['stale']} | "
        f"key points {stats['extract']} | no brief {stats['no_note']}"
        + (f" | over cap {stats['skipped_budget']}" if stats["skipped_budget"] else "")
        + f"\n   ~{saved:,} tokens not spent vs. enriching every story with AI",
        file=sys.stderr,
    )
    dead = [n for n, st in _PROVIDER_STATE.items() if st["dead"]]
    if dead:
        print(f"   Providers disabled this run: {', '.join(dead)}", file=sys.stderr)


# ── MAIN ───────────────────────────────────────────────────────────────────────

def build_stories():
    now_utc = datetime.now(timezone.utc)
    cutoff  = now_utc - timedelta(hours=MAX_AGE_HOURS)
    today   = now_utc.astimezone(IST).strftime("%Y-%m-%d")

    if DEBUG_MODE:
        print("\n*** DEBUG MODE — stories.json will NOT be written ***", file=sys.stderr)

    print(f"\nCutoff: {cutoff.strftime('%Y-%m-%d %H:%M UTC')}  (MAX_AGE_HOURS={MAX_AGE_HOURS})",
          file=sys.stderr)

    sections: dict = {s: [] for s in ALL_SECTIONS}
    seen: set = set()

    feeds_ok   = 0
    feeds_fail = 0

    for (feed_url, primary_section, tags, priority) in FEEDS:
        if len(sections[primary_section]) >= MAX_PER_SECTION:
            print(f"  [{primary_section:>10}] SKIP (section full) {feed_url}", file=sys.stderr)
            continue

        print(f"  [{primary_section:>10}] fetching {feed_url}", file=sys.stderr)
        raw = fetch_feed(feed_url)
        time.sleep(FEED_DELAY_SEC)

        if not raw:
            feeds_fail += 1
            continue

        feeds_ok += 1

        try:
            root = ET.fromstring(raw)
        except ET.ParseError as e:
            print(f"  WARN parse: {e}", file=sys.stderr)
            feeds_fail += 1
            feeds_ok   -= 1
            continue

        channel = root.find("channel")
        items = (channel if channel is not None else root).findall("item")
        if not items:
            items = root.findall("{http://www.w3.org/2005/Atom}entry")

        items_total    = len(items)
        items_no_date  = 0
        items_too_old  = 0
        items_accepted = 0

        for item in items:
            if len(sections[primary_section]) >= MAX_PER_SECTION:
                break

            link_el = item.find("link")
            if link_el is None:
                link_el = item.find("{http://www.w3.org/2005/Atom}link")
            url = ""
            if link_el is not None:
                url = (link_el.text or link_el.get("href", "")).strip()
            if not url:
                continue

            if is_junk_url(url):
                continue

            pub_dt = parse_date(item)
            if pub_dt is None:
                items_no_date += 1
            elif pub_dt < cutoff:
                items_too_old += 1
                continue

            title_el = item.find("title")
            if title_el is None:
                title_el = item.find("{http://www.w3.org/2005/Atom}title")
            headline = truncate(strip_html(title_el.text if title_el is not None else ""), 180)
            if len(headline) < 8:
                continue

            # Google News appends " - Publication Name" to every headline — strip it
            if "news.google.com" in feed_url and " - " in headline:
                headline = headline.rsplit(" - ", 1)[0].strip()

            # Skip encyclopedia / directory entries — their titles contain "|"
            if "|" in headline:
                continue

            if is_junk_headline(headline):
                continue

            desc_el = item.find("description")
            if desc_el is None:
                desc_el = item.find("{http://www.w3.org/2005/Atom}summary")
            if desc_el is None:
                desc_el = item.find("{http://www.w3.org/2005/Atom}content")
            if "news.google.com" in feed_url:
                # Google News <description> is never real article body text — it's just
                # the headline (sometimes split into "sentences" by punctuation inside
                # the headline itself, e.g. "RIL Is Becoming A Platform Company. The Jio
                # IPO Is Just The Beginning") with the publisher name appended. Splitting
                # it into a "hook"/"summary" produces headline fragments, not content —
                # so these are headline-only stories until AI enrichment fills them in.
                hook = ""
                summary = ""
            else:
                raw_desc = clean_boilerplate(strip_html(desc_el.text if desc_el is not None else "")) or headline
                summary  = truncate(raw_desc, 900)
                if len(summary) < 30:
                    summary = truncate((summary + " " + headline).strip(), 900)

                sentences = re.split(r"(?<=[.!?])\s+", summary)
                hook = truncate(sentences[0] if sentences else summary, 220)
                if len(hook) < 12:
                    hook = truncate(summary, 220)

                # Remove the hook sentence from the summary so it doesn't repeat
                if len(sentences) > 1:
                    remaining = " ".join(sentences[1:]).strip()
                    if len(remaining) >= 30:
                        summary = remaining

                # If summary is still essentially the same as the hook, clear it —
                # an empty summary is better than showing the same sentence twice
                if _norm(summary) == _norm(hook) or _norm(summary) == _norm(headline):
                    summary = ""

            image_url = extract_rss_image(item)
            if image_url:
                image_url = upsize_image_url(image_url)

            if url not in seen:
                story = build_story(
                    primary_section, feed_url, url, pub_dt,
                    headline, hook, summary, tags, priority, image_url
                )
                sections[primary_section].append(story)
                seen.add(url)
                items_accepted += 1
                print(f"    + [{primary_section}] {headline[:80]}", file=sys.stderr)

            if primary_section == "reliance" or (
                primary_section == "business" and is_reliance_story(headline, summary)
            ):
                if primary_section == "business" and is_reliance_story(headline, summary):
                    rel_url_key = url + "::reliance"
                    if (
                        len(sections["reliance"]) < MAX_PER_SECTION
                        and rel_url_key not in seen
                    ):
                        rel_tags = list(dict.fromkeys(["reliance", "RIL"] + tags))
                        rel_story = build_story(
                            "reliance", feed_url, url, pub_dt,
                            headline, hook, summary, rel_tags, priority, image_url
                        )
                        rel_story["id"] = make_id("reliance", url + "::reliance")
                        sections["reliance"].append(rel_story)
                        seen.add(rel_url_key)
                        print(f"    \u21b3 dual-tag [reliance] {headline[:70]}", file=sys.stderr)

                if primary_section == "reliance":
                    biz_url_key = url + "::business"
                    if (
                        len(sections["business"]) < MAX_PER_SECTION
                        and biz_url_key not in seen
                    ):
                        biz_tags = list(dict.fromkeys(["reliance", "business"] + tags))
                        biz_story = build_story(
                            "business", feed_url, url, pub_dt,
                            headline, hook, summary, biz_tags, priority, image_url
                        )
                        biz_story["id"] = make_id("business", url + "::business")
                        sections["business"].append(biz_story)
                        seen.add(biz_url_key)
                        print(f"    \u21b3 dual-tag [business] {headline[:70]}", file=sys.stderr)

        print(
            f"    \u2192 {items_total} items: {items_accepted} accepted, "
            f"{items_too_old} too old, {items_no_date} no-date",
            file=sys.stderr,
        )

    all_stories = [
        story
        for stories in sections.values()
        for story in stories
    ]

    # ── Page fetch pass: og:image for stories without an image, and the page's own
    #    description for stories whose RSS excerpt is too thin to summarise. One
    #    download serves both. Google News links are tried for an image (as before)
    #    but never mined for text — their pages are a redirect shell. ─────────────
    page_text = {}

    def _thin(story):
        return ae.native_summary(story["headline"], [story.get("hook", ""), story.get("summary", "")])[1] != "good"

    def _wants_text(story):
        return _thin(story) and "news.google.com" not in story["sourceUrl"]

    stories_to_fetch = [s for s in all_stories if not s.get("imageUrl") or _wants_text(s)]
    if stories_to_fetch:
        print(f"\n── Page fetch ({len(stories_to_fetch)} stories, "
              f"{IMAGE_FETCH_WORKERS} workers) ─────────────────────────────",
              file=sys.stderr)

        img_ok = img_fail = txt_ok = 0
        url_cache = {}

        def _resolve_page(story):
            src_url = story["sourceUrl"]
            if src_url not in url_cache:
                url_cache[src_url] = fetch_page_meta(src_url, want_text=_wants_text(story))
            return story, url_cache[src_url]

        with ThreadPoolExecutor(max_workers=IMAGE_FETCH_WORKERS) as pool:
            futures = [pool.submit(_resolve_page, s) for s in stories_to_fetch]
            for fut in as_completed(futures):
                story, (found_url, reason, excerpt) = fut.result()
                label = story["headline"][:60]
                if excerpt and _wants_text(story):
                    page_text[story["id"]] = excerpt
                    txt_ok += 1
                if story.get("imageUrl"):
                    continue
                if found_url:
                    story["imageUrl"] = found_url
                    img_ok += 1
                    print(f"   ✓ [{story['section']:>10}] {label}", file=sys.stderr)
                else:
                    img_fail += 1
                    print(f"   ✗ [{story['section']:>10}] {label}: {reason}", file=sys.stderr)

        print(f"   images: {img_ok} found, {img_fail} not found  |  page text: {txt_ok} stories", file=sys.stderr)

    # ── Enrichment: reuse → native engine → AI only for what's still missing ─────
    enrich_stories(all_stories, page_text, load_previous_stories())

    # ── Hero selection ────────────────────────────────────────────────────────
    hero_id = ""
    for sec in ["legal", "business", "reliance", "world", "tech", "retail", "sports", "opinion"]:
        highs = [s for s in sections.get(sec, []) if s["priority"] == "high"]
        if highs:
            hero_id = highs[0]["id"]
            break
    if not hero_id:
        for sec in ALL_SECTIONS:
            if sections[sec]:
                hero_id = sections[sec][0]["id"]
                break

    total = sum(len(v) for v in sections.values())

    print(f"\n{'─'*60}", file=sys.stderr)
    print(f"Feeds:   {feeds_ok} OK  /  {feeds_fail} failed", file=sys.stderr)
    print(f"Stories: {total} total  |  "
          + ", ".join(f"{s}: {len(sections[s])}" for s in ALL_SECTIONS),
          file=sys.stderr)
    print(f"Edition: {today}   Hero: {hero_id or '(none)'}", file=sys.stderr)
    print(f"{'─'*60}", file=sys.stderr)

    if DEBUG_MODE:
        print("\n*** DEBUG MODE — exiting without writing stories.json ***", file=sys.stderr)
        sys.exit(0)

    # ── GUARD: if 0 stories, fall back to stories.fallback.json ──────────────
    if total == 0:
        if os.path.exists(FALLBACK_FILE):
            print(
                f"\nWARN: 0 stories fetched — copying {FALLBACK_FILE} to stories.json.\n"
                "Check feed connectivity and the cutoff date above.",
                file=sys.stderr,
            )
            shutil.copy(FALLBACK_FILE, "stories.json")
            print(f"Copied fallback to stories.json ✓", file=sys.stderr)
            sys.exit(0)
        else:
            print(
                "\nERROR: 0 stories fetched and no fallback file found.\n"
                "The existing stories.json is preserved (may be empty).",
                file=sys.stderr,
            )
            sys.exit(1)

    return {"editionDate": today, "heroStoryId": hero_id, "sections": sections}


if __name__ == "__main__":
    print("Daily Brief — RSS Fetcher", file=sys.stderr)
    data  = build_stories()   # may exit with code 0 (fallback/debug) or 1 (hard fail)
    total = sum(len(v) for v in data["sections"].values())

    out = json.dumps(data, indent=2, ensure_ascii=False)
    with open("stories.json", "w", encoding="utf-8") as f:
        f.write(out)

    # Save a copy as the fallback for future zero-story runs
    with open(FALLBACK_FILE, "w", encoding="utf-8") as f:
        f.write(out)

    print(f"\nWrote stories.json  ({total} stories) ✓", file=sys.stderr)
    print(f"Wrote {FALLBACK_FILE} ✓  (fallback updated)", file=sys.stderr)
