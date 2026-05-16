#!/usr/bin/env python3
"""
fetch_stories.py — Daily Brief RSS Fetcher
Pulls from curated RSS feeds, maps items to story-schema.json,
writes stories.json. Run locally or via GitHub Actions.
"""

import json, hashlib, re, sys
from datetime import datetime, timezone, timedelta
from xml.etree import ElementTree as ET
from urllib.request import urlopen, Request
from urllib.error import URLError
from html import unescape

# ── CONFIG ─────────────────────────────────────────────────────────────────────
# Each entry: (url, section, tags, priority)
FEEDS = [
    # Legal
    ("https://www.livelaw.in/rss/top-stories", "legal", ["courts", "litigation"], "high"),
    ("https://www.barandbench.com/feed", "legal", ["bar-and-bench", "India"], "high"),

    # Regulatory / Business
    ("https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms", "business", ["markets", "India"], "high"),
    ("https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms", "business", ["industry", "India"], "medium"),
    ("https://www.thehindubusinessline.com/feeder/default.rss", "business", ["business-line"], "medium"),

    # Tech
    ("https://techcrunch.com/feed/", "tech", ["startups", "technology"], "medium"),
    ("https://feeds.feedburner.com/gadgets360-latest", "tech", ["gadgets360", "India-tech"], "medium"),

    # Geopolitics
    ("https://rss.nytimes.com/services/xml/rss/nyt/World.xml", "geopolitics", ["world", "NYT"], "medium"),
    ("https://feeds.bbci.co.uk/news/world/asia/india/rss.xml", "geopolitics", ["BBC", "India"], "high"),

    # Retail
    ("https://retail.economictimes.indiatimes.com/rss/topstories", "retail", ["retail", "India"], "medium"),

    # Sports
    ("https://www.espncricinfo.com/rss/content/story/feeds/0.xml", "sports", ["cricket", "espncricinfo"], "medium"),
    ("https://timesofindia.indiatimes.com/rss/4719148.cms", "sports", ["sports", "TOI"], "low"),

    # Opinion
    ("https://economictimes.indiatimes.com/opinion/rssfeeds/897228639.cms", "opinion", ["ET-opinion"], "low"),
]

CONTEXT_NOTE_REQUIRED = {"legal", "reliance", "retail", "business", "tech", "opinion"}
MAX_PER_SECTION = 6
MAX_AGE_HOURS = 30
IST = timezone(timedelta(hours=5, minutes=30))

SOURCE_MAP = {
    "livelaw": "Live Law", "barandbench": "Bar & Bench",
    "scconline": "SCC Online", "economictimes": "Economic Times",
    "hindubusinessline": "Business Line", "techcrunch": "TechCrunch",
    "gadgets360": "Gadgets 360", "nytimes": "The New York Times",
    "bbci.co": "BBC News", "espncricinfo": "ESPN Cricinfo",
    "timesofindia": "Times of India", "thehindubusinessline": "Business Line",
    "thehindu": "The Hindu", "retail.economictimes": "ET Retail",
}

CONTEXT_TEMPLATES = {
    "legal":    "Reported in the legal domain. Verify full judgment or order text via the source link.",
    "business": "Filed under business coverage. Cross-check with official filings or exchange disclosures.",
    "retail":   "Retail sector development. Impact may vary by geography and segment.",
    "tech":     "Technology sector story. Details may evolve rapidly — check primary source for updates.",
    "opinion":  "This is an opinion or editorial piece and reflects the author's views.",
    "reliance": "Pertains to Reliance Industries group. Verify via official exchange filings.",
}


def fetch_feed(url):
    try:
        req = Request(url, headers={"User-Agent": "DailyBriefBot/1.0"})
        with urlopen(req, timeout=15) as r:
            return r.read()
    except Exception as e:
        print(f"  WARN: {url}: {e}", file=sys.stderr)
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
    for fmt in ["%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S GMT",
                "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ"]:
        try:
            dt = datetime.strptime(raw, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None


def date_label(dt):
    if dt is None:
        return "Today"
    local = dt.astimezone(IST)
    today = datetime.now(IST).date()
    if local.date() == today:
        return local.strftime("Today, %-I:%M %p IST")
    elif local.date() == today - timedelta(days=1):
        return local.strftime("Yesterday, %-I:%M %p IST")
    return local.strftime("%d %b %Y")


def build_stories():
    now_utc = datetime.now(timezone.utc)
    cutoff  = now_utc - timedelta(hours=MAX_AGE_HOURS)
    today   = now_utc.astimezone(IST).strftime("%Y-%m-%d")

    sections = {k: [] for k in ["legal","reliance","retail","business","tech","geopolitics","sports","opinion"]}
    seen: set = set()

    for (feed_url, section, tags, priority) in FEEDS:
        if len(sections[section]) >= MAX_PER_SECTION:
            continue
        print(f"  [{section}] {feed_url}", file=sys.stderr)
        raw = fetch_feed(feed_url)
        if not raw:
            continue
        try:
            root = ET.fromstring(raw)
        except ET.ParseError as e:
            print(f"  WARN parse: {e}", file=sys.stderr)
            continue

        channel = root.find("channel")
        items = (channel or root).findall("item") or root.findall("{http://www.w3.org/2005/Atom}entry")

        for item in items:
            if len(sections[section]) >= MAX_PER_SECTION:
                break

            link_el = item.find("link") or item.find("{http://www.w3.org/2005/Atom}link")
            url = ""
            if link_el is not None:
                url = (link_el.text or link_el.get("href","")).strip()
            if not url or url in seen:
                continue

            pub_dt = parse_date(item)
            if pub_dt and pub_dt < cutoff:
                continue

            title_el = item.find("title") or item.find("{http://www.w3.org/2005/Atom}title")
            headline = truncate(strip_html(title_el.text if title_el is not None else ""), 180)
            if len(headline) < 8:
                continue

            desc_el = (item.find("description") or
                       item.find("{http://www.w3.org/2005/Atom}summary") or
                       item.find("{http://www.w3.org/2005/Atom}content"))
            raw_desc = strip_html(desc_el.text if desc_el is not None else "") or headline
            summary = truncate(raw_desc, 700)
            if len(summary) < 30:
                summary = truncate((summary + " " + headline).strip(), 700)

            sentences = re.split(r"(?<=[.!?])\s+", summary)
            hook = truncate(sentences[0] if sentences else summary, 220)
            if len(hook) < 12:
                hook = truncate(summary, 220)

            source = next((v for k,v in SOURCE_MAP.items() if k in feed_url.lower()), "News Feed")
            dl     = date_label(pub_dt)
            story  = {
                "id": make_id(section, url),
                "section": section,
                "headline": headline,
                "hook": hook,
                "summary": summary,
                "source": source,
                "sourceUrl": url,
                "dateLabel": dl,
                "tags": tags[:8],
                "priority": priority,
            }
            if section in CONTEXT_NOTE_REQUIRED:
                story["contextNote"] = CONTEXT_TEMPLATES.get(section, "See source for full context.")

            seen.add(url)
            sections[section].append(story)

    hero_id = ""
    for sec in ["legal","business","geopolitics","tech","retail","sports","opinion","reliance"]:
        highs = [s for s in sections[sec] if s["priority"] == "high"]
        if highs:
            hero_id = highs[0]["id"]
            break
    if not hero_id:
        for sec in sections.values():
            if sec:
                hero_id = sec[0]["id"]
                break

    return {"editionDate": today, "heroStoryId": hero_id, "sections": sections}


if __name__ == "__main__":
    print("Daily Brief — RSS Fetcher", file=sys.stderr)
    data  = build_stories()
    total = sum(len(v) for v in data["sections"].values())
    print(f"Fetched {total} stories  |  Edition: {data['editionDate']}  Hero: {data['heroStoryId']}", file=sys.stderr)
    out = json.dumps(data, indent=2, ensure_ascii=False)
    with open("stories.json", "w", encoding="utf-8") as f:
        f.write(out)
    print("Wrote stories.json", file=sys.stderr)
