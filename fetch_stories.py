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
from datetime import datetime, timezone, timedelta
from xml.etree import ElementTree as ET
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from html import unescape

DEBUG_MODE = "--debug" in sys.argv

# ── CONFIG ─────────────────────────────────────────────────────────────────────
# Each entry: (url, primary_section, tags, priority)
# Stories tagged reliance are ALSO injected into business (dual-tagging).
FEEDS = [
    # ── Legal ──────────────────────────────────────────────────────────────────
    # Google News first — works reliably from cloud IPs (US locale avoids geo-mismatch)
    ("https://news.google.com/rss/search?q=Supreme+Court+India+OR+High+Court+India&hl=en&gl=US&ceid=US:en",
     "legal", ["courts", "India", "google-news"], "high"),
    ("https://news.google.com/rss/search?q=India+law+legal+court+judgment&hl=en&gl=US&ceid=US:en",
     "legal", ["courts", "India", "google-news"], "medium"),
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
    # The Verge + Ars Technica confirmed accessible from cloud IPs
    ("https://www.theverge.com/rss/index.xml",
     "tech", ["the-verge", "technology"], "high"),
    ("https://feeds.arstechnica.com/arstechnica/index",
     "tech", ["ars-technica", "technology"], "high"),
    ("https://techcrunch.com/feed/",
     "tech", ["techcrunch", "startups"], "medium"),
    # Gadgets360 — direct NDTV tech feed (Feedburner redirect is unreliable)
    ("https://feeds.feedburner.com/gadgets360-latest",
     "tech", ["gadgets360", "India-tech"], "medium"),
    ("https://www.ndtv.com/feed/tech-gadgets",
     "tech", ["gadgets360", "NDTV", "India-tech"], "medium"),
    ("https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms",
     "tech", ["ET-tech", "India-tech"], "high"),

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
    # Google News sports — most reliable from cloud IPs
    ("https://news.google.com/rss/search?q=cricket+India+IPL+Test+match&hl=en&gl=US&ceid=US:en",
     "sports", ["cricket", "India", "google-news"], "high"),
    ("https://news.google.com/rss/search?q=India+sports+football+hockey+badminton&hl=en&gl=US&ceid=US:en",
     "sports", ["sports", "India", "google-news"], "medium"),
    ("https://www.espncricinfo.com/rss/content/story/feeds/0.xml",
     "sports", ["cricket", "espncricinfo"], "medium"),
    ("https://timesofindia.indiatimes.com/rss/4719148.cms",
     "sports", ["sports", "TOI"], "low"),
    # Cricbuzz — correct RSS endpoint
    ("https://www.cricbuzz.com/rss-feeds/cricket-news",
     "sports", ["cricket", "cricbuzz"], "medium"),
    # NDTV Sports
    ("https://sports.ndtv.com/rss/cricket",
     "sports", ["NDTV", "cricket"], "medium"),

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

# Sections that get a contextNote disclaimer in each story card
CONTEXT_NOTE_REQUIRED = {"legal", "reliance", "retail", "business", "tech", "opinion"}

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
    "espncricinfo":          "ESPN Cricinfo",
    "cricbuzz":              "Cricbuzz",
    "timesofindia":          "Times of India",
    "thehindu":              "The Hindu",
    "theprint":              "The Print",
    "scroll.in":             "Scroll",
    "thewire":               "The Wire",
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
        items = (channel or root).findall("item")
        if not items:
            items = root.findall("{http://www.w3.org/2005/Atom}entry")

        items_total    = len(items)
        items_no_date  = 0
        items_too_old  = 0
        items_accepted = 0

        for item in items:
            if len(sections[primary_section]) >= MAX_PER_SECTION:
                break

            link_el = item.find("link") or item.find("{http://www.w3.org/2005/Atom}link")
            url = ""
            if link_el is not None:
                url = (link_el.text or link_el.get("href", "")).strip()
            if not url:
                continue

            pub_dt = parse_date(item)
            if pub_dt is None:
                items_no_date += 1
            elif pub_dt < cutoff:
                items_too_old += 1
                continue

            title_el = item.find("title") or item.find("{http://www.w3.org/2005/Atom}title")
            headline = truncate(strip_html(title_el.text if title_el is not None else ""), 180)
            if len(headline) < 8:
                continue

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

            if url not in seen:
                story = build_story(
                    primary_section, feed_url, url, pub_dt,
                    headline, hook, summary, tags, priority
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
                            headline, hook, summary, rel_tags, priority
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
                            headline, hook, summary, biz_tags, priority
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
