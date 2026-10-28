#!/usr/bin/env python3
"""Probe a long list of candidate news feeds from the GitHub runner and print which
ones are worth adding. Run via the "Check news feeds" workflow (manual trigger).

Why it exists: the dev sandbox can't reach most news sites, and a feed that works
from a laptop is often blocked or empty from a cloud IP. The runner is the only
place that tells the truth, so this reports, per feed: status, items, freshness,
how many items carry a photo, how much text each item has, and whether the links
are real article URLs (Google News links have no text or image to work with).
"""
import re
import sys
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
    "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
ATOM = "{http://www.w3.org/2005/Atom}"
MEDIA = "{http://search.yahoo.com/mrss/}"
CONTENT = "{http://purl.org/rss/1.0/modules/content/}"

# (section it would serve, label, url)
CANDIDATES = [
    # legal & regulators
    ("legal", "LiveLaw (google_feeds)", "https://www.livelaw.in/google_feeds.xml"),
    ("legal", "LiveLaw top-stories", "https://www.livelaw.in/category/top-stories/google_feeds.xml"),
    ("legal", "LiveLaw (old URL)", "https://www.livelaw.in/rss/top-stories"),
    ("legal", "Bar & Bench", "https://www.barandbench.com/feed"),
    ("legal", "Bar & Bench (rss)", "https://www.barandbench.com/stories.rss"),
    ("legal", "SCC Online", "https://www.scconline.com/blog/feed/"),
    ("legal", "IndiaCorpLaw", "https://indiacorplaw.in/feed"),
    ("legal", "Verdictum", "https://www.verdictum.in/rss.xml"),
    ("legal", "LawBeat", "https://lawbeat.in/rss.xml"),
    ("legal", "The Hindu - National", "https://www.thehindu.com/news/national/feeder/default.rss"),
    ("legal", "Indian Express - India", "https://indianexpress.com/section/india/feed/"),
    ("legal", "Hindustan Times - India", "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml"),
    ("legal", "ThePrint - judiciary", "https://theprint.in/category/judiciary/feed/"),
    ("legal", "SEBI (press, circulars, orders)", "https://www.sebi.gov.in/sebirss.xml"),
    ("legal", "RBI press releases", "https://www.rbi.org.in/pressreleases_rss.xml"),
    ("legal", "RBI notifications", "https://www.rbi.org.in/notifications_rss.xml"),
    ("legal", "PIB all", "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3"),
    ("legal", "Taxguru", "https://taxguru.in/feed/"),
    # business / markets
    ("business", "ET Markets", "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms"),
    ("business", "ET Industry", "https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms"),
    ("business", "ET Economy", "https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms"),
    ("business", "ET Top stories", "https://economictimes.indiatimes.com/rssfeedstopstories.cms"),
    ("business", "Mint - companies", "https://www.livemint.com/rss/companies"),
    ("business", "Mint - markets", "https://www.livemint.com/rss/markets"),
    ("business", "Mint - news", "https://www.livemint.com/rss/news"),
    ("business", "Business Standard - top", "https://www.business-standard.com/rss/home_page_top_stories.rss"),
    ("business", "Business Standard - companies", "https://www.business-standard.com/rss/companies-101.rss"),
    ("business", "Business Standard - economy", "https://www.business-standard.com/rss/economy-102.rss"),
    ("business", "BusinessLine - companies", "https://www.thehindubusinessline.com/companies/feeder/default.rss"),
    ("business", "BusinessLine - economy", "https://www.thehindubusinessline.com/economy/feeder/default.rss"),
    ("business", "BusinessLine - all", "https://www.thehindubusinessline.com/feeder/default.rss"),
    ("business", "The Hindu - business", "https://www.thehindu.com/business/feeder/default.rss"),
    ("business", "Indian Express - business", "https://indianexpress.com/section/business/feed/"),
    ("business", "Financial Express", "https://www.financialexpress.com/feed/"),
    ("business", "Moneycontrol - top news", "https://www.moneycontrol.com/rss/MCtopnews.xml"),
    ("business", "Moneycontrol - business", "https://www.moneycontrol.com/rss/business.xml"),
    ("business", "Hindustan Times - business", "https://www.hindustantimes.com/feeds/rss/business/rssfeed.xml"),
    ("business", "India Today - business", "https://www.indiatoday.in/rss/1206514"),
    ("business", "NDTV Profit", "https://feeds.feedburner.com/ndtvprofit-latest"),
    # reliance
    ("reliance", "ET - Reliance topic", "https://economictimes.indiatimes.com/topic/reliance-industries/rssfeeds/52857114.cms"),
    ("reliance", "Mint - Reliance", "https://www.livemint.com/rss/companies"),
    # retail
    ("retail", "ET Retail", "https://retail.economictimes.indiatimes.com/rss/topstories"),
    ("retail", "ET Retail - news", "https://retail.economictimes.indiatimes.com/rss/retail-news"),
    ("retail", "Mint - industry", "https://www.livemint.com/rss/industry"),
    ("retail", "Mint - money", "https://www.livemint.com/rss/money"),
    ("retail", "Exchange4media", "https://www.exchange4media.com/rss"),
    # tech
    ("tech", "ET Tech", "https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms"),
    ("tech", "MediaNama", "https://www.medianama.com/feed/"),
    ("tech", "Inc42", "https://inc42.com/feed/"),
    ("tech", "YourStory", "https://yourstory.com/feed"),
    ("tech", "TechCrunch", "https://techcrunch.com/feed/"),
    ("tech", "NDTV Gadgets", "https://www.ndtv.com/feed/tech-gadgets"),
    ("tech", "The Hindu - tech", "https://www.thehindu.com/sci-tech/technology/feeder/default.rss"),
    # world
    ("world", "NPR world", "https://feeds.npr.org/1004/rss.xml"),
    ("world", "BBC world", "https://feeds.bbci.co.uk/news/world/rss.xml"),
    ("world", "BBC India", "https://feeds.bbci.co.uk/news/world/asia/india/rss.xml"),
    ("world", "Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"),
    ("world", "Guardian world", "https://www.theguardian.com/world/rss"),
    ("world", "NYT world", "https://rss.nytimes.com/services/xml/rss/nyt/World.xml"),
    ("world", "DW", "https://rss.dw.com/xml/rss-en-all"),
    ("world", "France24", "https://www.france24.com/en/rss"),
    ("world", "The Hindu - world", "https://www.thehindu.com/news/international/feeder/default.rss"),
    ("world", "Reuters (old)", "https://feeds.reuters.com/reuters/topNews"),
    ("world", "VOA (old)", "https://feeds.voanews.com/rss/english/news"),
    # sports
    ("sports", "ESPNcricinfo", "https://www.espncricinfo.com/rss/content/story/feeds/0.xml"),
    ("sports", "Cricbuzz", "https://www.cricbuzz.com/rss-feeds/cricket-news"),
    ("sports", "BBC football", "https://feeds.bbci.co.uk/sport/football/rss.xml"),
    ("sports", "TOI sports", "https://timesofindia.indiatimes.com/rss/4719148.cms"),
    ("sports", "The Hindu - sport", "https://www.thehindu.com/sport/feeder/default.rss"),
    ("sports", "Indian Express - sports", "https://indianexpress.com/section/sports/feed/"),
    # opinion
    ("opinion", "ET Opinion", "https://economictimes.indiatimes.com/opinion/rssfeeds/897228639.cms"),
    ("opinion", "The Hindu - opinion", "https://www.thehindu.com/opinion/feeder/default.rss"),
    ("opinion", "ThePrint - opinion", "https://theprint.in/category/opinion/feed/"),
    ("opinion", "Indian Express - opinion", "https://indianexpress.com/section/opinion/feed/"),
    ("opinion", "Mint - opinion", "https://www.livemint.com/rss/opinion"),
    ("opinion", "HT - opinion", "https://www.hindustantimes.com/feeds/rss/opinion/rssfeed.xml"),
    ("opinion", "Scroll", "https://feeds.feedburner.com/ScrollinArticles.rss"),
    ("opinion", "The Wire", "https://thewire.in/feed"),
]


def _text(el):
    return (el.text or "").strip() if el is not None else ""


def _when(item):
    for tag in ("pubDate", "{http://purl.org/dc/elements/1.1/}date", ATOM + "published", ATOM + "updated"):
        raw = _text(item.find(tag))
        if not raw:
            continue
        try:
            dt = parsedate_to_datetime(raw)
        except Exception:
            try:
                dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            except Exception:
                continue
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return None


def _has_image(item):
    if item.find(MEDIA + "content") is not None or item.find(MEDIA + "thumbnail") is not None:
        return True
    for enc in item.findall("enclosure"):
        if (enc.get("type") or "").startswith("image"):
            return True
    blob = _text(item.find("description")) + _text(item.find(CONTENT + "encoded"))
    return "<img" in blob.lower()


def _body_len(item):
    blob = (_text(item.find("description")) + " " + _text(item.find(CONTENT + "encoded"))
            + " " + _text(item.find(ATOM + "summary")) + " " + _text(item.find(ATOM + "content")))
    return len(re.sub(r"<[^>]+>", " ", blob).split())


def probe(label, url):
    t0 = time.time()
    try:
        with urlopen(Request(url, headers=HEADERS), timeout=25) as r:
            data = r.read()
    except HTTPError as e:
        return f"HTTP {e.code}"
    except Exception as e:
        return f"FAIL {type(e).__name__}: {str(e)[:60]}"
    try:
        root = ET.fromstring(data)
    except ET.ParseError as e:
        return f"NOT-XML ({len(data):,} bytes: {data[:60]!r})"
    items = root.findall(".//item") or root.findall(".//" + ATOM + "entry")
    if not items:
        return f"EMPTY ({len(data):,} bytes)"
    now = datetime.now(timezone.utc)
    ages = [(now - w).total_seconds() / 3600 for w in map(_when, items) if w]
    fresh = sum(1 for a in ages if a <= 48)
    imgs = sum(1 for i in items if _has_image(i))
    words = sorted(_body_len(i) for i in items)
    links = [_text(i.find("link")) or (i.find(ATOM + "link").get("href", "") if i.find(ATOM + "link") is not None else "") for i in items]
    google = sum(1 for l in links if "news.google.com" in l)
    title = _text(items[0].find("title")) or _text(items[0].find(ATOM + "title"))
    newest = f"{min(ages):.0f}h" if ages else "?"
    return (f"OK {len(items)} items | fresh(48h) {fresh} | newest {newest} | photo {imgs}/{len(items)} | "
            f"median {words[len(words) // 2]} words | google-links {google} | {time.time() - t0:.1f}s | “{title[:60]}”")


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for section in dict.fromkeys(c[0] for c in CANDIDATES):
        if only and section != only:
            continue
        print(f"\n== {section.upper()} ==")
        for sec, label, url in CANDIDATES:
            if sec == section:
                print(f"{label:34} {probe(label, url)}\n{'':34} {url}", flush=True)


if __name__ == "__main__":
    main()
