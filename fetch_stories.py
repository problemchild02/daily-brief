#!/usr/bin/env python3
"""
fetch_stories.py — Daily Brief RSS Fetcher
Pulls from curated RSS feeds, maps items to story-schema.json,
writes stories.json. Run locally or via GitHub Actions.

Section keys: legal, business, reliance, retail, tech, world, sports, opinion
Reliance stories are dual-tagged: they appear in both 'reliance' AND 'business' sections.
"""

import json, hashlib, re, sys, time
from datetime import datetime, timezone, timedelta
from xml.etree import ElementTree as ET
from urllib.request import urlopen, Request
from urllib.error import URLError
from html import unescape

# ── CONFIG ─────────────────────────────────────────────────────────────────────
# Each entry: (url, primary_section, tags, priority)
# Stories tagged reliance are ALSO injected into business (dual-tagging).
FEEDS = [
    # ── Legal ──────────────────────────────────────────────────────────────────
    ("https://www.livelaw.in/rss/top-stories",
     "legal", ["courts", "litigation", "India"], "high"),
    ("https://www.barandbench.com/feed",
     "legal", ["bar-and-bench", "India"], "high"),
    # Fallback: SCC Online latest
    ("https://www.scconline.com/blog/feed/",
     "legal", ["SCC", "India", "courts"], "medium"),

    # ── Business (general) ────────────────────────────────────────────────────
    ("https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
     "business", ["markets", "India"], "high"),
    ("https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms",
     "business", ["industry", "India"], "medium"),
    ("https://www.thehindubusinessline.com/feeder/default.rss",
     "business", ["business-line", "India"], "medium"),
    ("https://www.business-standard.com/rss/home_page_top_stories.rss",
     "business", ["business-standard", "India"], "medium"),
    # Fallback: Mint top stories
    ("https://www.livemint.com/rss/companies",
     "business", ["mint", "India"], "medium"),

    # ── Reliance (dedicated feeds — also dual-tagged into business) ────────────
    ("https://economictimes.indiatimes.com/topic/reliance-industries/rssfeeds/52857114.cms",
     "reliance", ["reliance", "RIL", "Jio"], "high"),
    ("https://retail.economictimes.indiatimes.com/rss/topstories",
     "reliance", ["reliance-retail", "retail", "JioMart"], "medium"),
    # Google News RSS for Reliance — broad catch-all
    ("https://news.google.com/rss/search?q=Reliance+Industries&hl=en-IN&gl=IN&ceid=IN:en",
     "reliance", ["reliance", "RIL", "google-news"], "medium"),

    # ── Retail (broader) ──────────────────────────────────────────────────────
    ("https://retail.economictimes.indiatimes.com/rss/topstories",
     "retail", ["retail", "India"], "high"),
    ("https://www.thehindubusinessline.com/feeder/default.rss",
     "retail", ["business-line", "retail"], "low"),
    # Fallback: Livemint retail
    ("https://www.livemint.com/rss/industry",
     "retail", ["mint", "retail"], "low"),

    # ── Tech ──────────────────────────────────────────────────────────────────
    ("https://techcrunch.com/feed/",
     "tech", ["startups", "technology"], "medium"),
    ("https://feeds.feedburner.com/gadgets360-latest",
     "tech", ["gadgets360", "India-tech"], "medium"),
    ("https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms",
     "tech", ["ET-tech", "India-tech"], "high"),
    # Fallback: The Verge
    ("https://www.theverge.com/rss/index.xml",
     "tech", ["the-verge", "technology"], "medium"),

    # ── World ─────────────────────────────────────────────────────────────────
    ("https://feeds.bbci.co.uk/news/world/asia/india/rss.xml",
     "world", ["BBC", "India"], "high"),
    ("https://www.aljazeera.com/xml/rss/all.xml",
     "world", ["Al-Jazeera", "geopolitics"], "medium"),
    ("https://feeds.reuters.com/reuters/worldNews",
     "world", ["Reuters", "world"], "high"),
    # Fallback: The Guardian World
    ("https://www.theguardian.com/world/rss",
     "world", ["Guardian", "world"], "medium"),
    # Fallback: AP News World
    ("https://rsshub.app/apnews/topics/apf-intlnews",
     "world", ["AP", "world"], "medium"),

    # ── Sports ────────────────────────────────────────────────────────────────
    ("https://www.espncricinfo.com/rss/content/story/feeds/0.xml",
     "sports", ["cricket", "espncricinfo"], "medium"),
    ("https://timesofindia.indiatimes.com/rss/4719148.cms",
     "sports", ["sports", "TOI"], "low"),
    # Fallback: Cricbuzz
    ("https://www.cricbuzz.com/cricket-rss-feeds",
     "sports", ["cricket", "cricbuzz"], "medium"),

    # ── Opinion ───────────────────────────────────────────────────────────────
    ("https://economictimes.indiatimes.com/opinion/rssfeeds/897228639.cms",
     "opinion", ["ET-opinion"], "low"),
    ("https://www.thehindu.com/opinion/feeder/default.rss",
     "opinion", ["the-hindu", "opinion"], "medium"),
    # Fallback: The Print opinion
    ("https://theprint.in/category/opinion/feed/",
     "opinion", ["the-print", "opinion"], "medium"),
]

# Canonical section order — mirrors the UI tab order
ALL_SECTIONS = ["legal", "business", "reliance", "retail", "tech", "world", "sports", "opinion"]

# Sections that get a contextNote disclaimer in each story card
CONTEXT_NOTE_REQUIRED = {"legal", "reliance", "retail", "business", "tech", "opinion"}

MAX_PER_SECTION = 8   # max stories kept per section
MAX_AGE_HOURS   = 96  # ignore items older than this (widened for resilience)
FEED_DELAY_SEC  = 0.5 # pause between feed fetches to avoid burst-rate limiting
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
    "techcrunch":            "TechCrunch",
    "gadgets360":            "Gadgets 360",
    "feedburner.com/gadgets": "Gadgets 360",
    "theverge":              "The Verge",
    "nytimes":               "The New York Times",
    "bbci.co":               "BBC News",
    "bbc.co":                "BBC News",
    "aljazeera":             "Al Jazeera",
    "reuters":               "Reuters",
    "theguardian":           "The Guardian",
    "rsshub.app/apnews":     "AP News",
    "espncricinfo":          "ESPN Cricinfo",
    "cricbuzz":              "Cricbuzz",
    "timesofindia":          "Times of India",
    "thehindu":              "The Hindu",
    "theprint":              "The Print",
    "news.google":           "Google News",
}

CONTEXT_TEMPLATES = {
    "legal":    "Reported in the legal domain. Verify full judgment or order text via the source link.",
    "business": "Filed under business coverage. Cross-check with official filings or exchange disclosures.",
    "reliance": "Pertains to Reliance Industries group. Verify via official exchange filings (BSE/NSE).",
    "retail":   "Retail sector development. Impact may vary by geography and segment.",
    "tech":     "Technology sector story. Details may evolve rapidly — check primary source for updates.",
    "opinion":  "This is an opinion or editorial piece and reflects the author's views.",
}


# ── HELPERS ────────────────────────────────────────────────────────────────────

def fetch_feed(url):
    try:
        req = Request(url, headers={"User-Agent": "DailyBriefBot/1.0"})
        with urlopen(req, timeout=15) as r:
            return r.read()
    except Exception as e:
        print(f"  WARN fetch: {url}  →  {e}", file=sys.stderr)
        return None


def strip_html(text):
    text = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r"\s+", " ", unescape(text)).strip()


def truncate(text, maxlen):
    text = text.strip()
    if len(text) <= maxlen:
        return text
    return text[:maxlen].rsplit(" ", 1)[0].rstrip(",.;:") + "\u2026"


def make_id(section, url):
    return f"{section}-{hashlib.sha1(url.encode()).hexdigest()[:8]}"


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
    # Cross-platform hour formatting — avoid %-I (Linux-only)
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


def build_story(section, feed_url, url, pub_dt, headline, hook, summary, tags, priority):
    """Construct a story dict."""
    source = "News Feed"
    feed_lower = feed_url.lower()
    for key, name in SOURCE_MAP.items():
        if key in feed_lower:
            source = name
            break

    story = {
        "id":        make_id(section, url),
        "section":   section,
        "headline":  headline,
        "hook":      hook,
        "summary":   summary,
        "source":    source,
        "sourceUrl": url,
        "dateLabel": date_label(pub_dt),
        "tags":      tags[:8],
        "priority":  priority,
    }
    if section in CONTEXT_NOTE_REQUIRED:
        story["contextNote"] = CONTEXT_TEMPLATES.get(section, "See source for full context.")
    return story


# ── MAIN ───────────────────────────────────────────────────────────────────────

def build_stories():
    now_utc = datetime.now(timezone.utc)
    cutoff  = now_utc - timedelta(hours=MAX_AGE_HOURS)
    today   = now_utc.astimezone(IST).strftime("%Y-%m-%d")

    sections: dict = {s: [] for s in ALL_SECTIONS}
    seen: set = set()  # de-duplicate by URL across ALL sections

    for (feed_url, primary_section, tags, priority) in FEEDS:
        if len(sections[primary_section]) >= MAX_PER_SECTION:
            continue
        print(f"  [{primary_section:>10}] fetching {feed_url}", file=sys.stderr)
        raw = fetch_feed(feed_url)
        time.sleep(FEED_DELAY_SEC)  # be polite to feed servers
        if not raw:
            continue
        try:
            root = ET.fromstring(raw)
        except ET.ParseError as e:
            print(f"  WARN parse: {e}", file=sys.stderr)
            continue

        channel = root.find("channel")
        items = (channel or root).findall("item")
        if not items:
            items = root.findall("{http://www.w3.org/2005/Atom}entry")

        for item in items:
            if len(sections[primary_section]) >= MAX_PER_SECTION:
                break

            # URL
            link_el = item.find("link") or item.find("{http://www.w3.org/2005/Atom}link")
            url = ""
            if link_el is not None:
                url = (link_el.text or link_el.get("href", "")).strip()
            if not url:
                continue

            # Age filter — items with no date are accepted (can't filter what we can't measure)
            pub_dt = parse_date(item)
            if pub_dt and pub_dt < cutoff:
                continue

            # Headline
            title_el = item.find("title") or item.find("{http://www.w3.org/2005/Atom}title")
            headline = truncate(strip_html(title_el.text if title_el is not None else ""), 180)
            if len(headline) < 8:
                continue

            # Summary / hook
            desc_el = (
                item.find("description")
                or item.find("{http://www.w3.org/2005/Atom}summary")
                or item.find("{http://www.w3.org/2005/Atom}content")
            )
            raw_desc = strip_html(desc_el.text if desc_el is not None else "") or headline
            summary  = truncate(raw_desc, 700)
            if len(summary) < 30:
                summary = truncate((summary + " " + headline).strip(), 700)

            sentences = re.split(r"(?<=[.!?])\s+", summary)
            hook = truncate(sentences[0] if sentences else summary, 220)
            if len(hook) < 12:
                hook = truncate(summary, 220)

            # ── Primary section ───────────────────────────────────────────────
            if url not in seen:
                story = build_story(
                    primary_section, feed_url, url, pub_dt,
                    headline, hook, summary, tags, priority
                )
                sections[primary_section].append(story)
                seen.add(url)
                print(f"    + [{primary_section}] {headline[:80]}", file=sys.stderr)

            # ── Dual-tagging: Reliance stories → also Business ─────────────────
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
                            headline, hook, summary, rel_tags, priority
                        )
                        rel_story["id"] = make_id("reliance", url + "::reliance")
                        sections["reliance"].append(rel_story)
                        seen.add(rel_url_key)
                        print(f"    ↳ dual-tag [reliance] {headline[:70]}", file=sys.stderr)

                if primary_section == "reliance":
                    biz_url_key = url + "::business"
                    if (
                        len(sections["business"]) < MAX_PER_SECTION
                        and biz_url_key not in seen
                    ):
                        biz_tags = list(dict.fromkeys(["reliance", "business"] + tags))
                        biz_story = build_story(
                            "business", feed_url, url, pub_dt,
                            headline, hook, summary, biz_tags, priority
                        )
                        biz_story["id"] = make_id("business", url + "::business")
                        sections["business"].append(biz_story)
                        seen.add(biz_url_key)
                        print(f"    ↳ dual-tag [business] {headline[:70]}", file=sys.stderr)

    # ── Hero: first high-priority story across priority sections ──────────────
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

    return {"editionDate": today, "heroStoryId": hero_id, "sections": sections}


if __name__ == "__main__":
    print("Daily Brief — RSS Fetcher", file=sys.stderr)
    data  = build_stories()
    total = sum(len(v) for v in data["sections"].values())
    per   = ", ".join(f"{s}: {len(data['sections'][s])}" for s in ALL_SECTIONS)
    print(f"\nFetched {total} stories  |  {per}", file=sys.stderr)
    print(f"Edition: {data['editionDate']}   Hero: {data['heroStoryId']}", file=sys.stderr)

    out = json.dumps(data, indent=2, ensure_ascii=False)
    with open("stories.json", "w", encoding="utf-8") as f:
        f.write(out)
    print("\nWrote stories.json ✓", file=sys.stderr)
