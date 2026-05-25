#!/usr/bin/env python3
"""
Process text files in papers/pending/ — extract stories and enrich with Claude.
Called by the process-papers GitHub Actions workflow.
"""
import os, json, re, sys, time, hashlib, glob
from datetime import datetime, timezone, timedelta
from urllib.request import urlopen, Request
from urllib.error import HTTPError

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
AI_MODEL          = "claude-haiku-4-5-20251001"
AI_CALL_DELAY     = 1
IST_OFFSET        = timedelta(hours=5, minutes=30)

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
    "reliance": "Reliance Industries / Jio / Mukesh Ambani story",
    "retail":   "retail / FMCG / e-commerce / consumer brands story",
    "tech":     "technology / startup / digital regulation story",
    "world":    "international / geopolitics / global news story",
    "sports":   "sports story",
    "opinion":  "opinion / editorial / analysis",
}

_SECTION_KW = {
    "legal":    ["court", "judge", "judgment", "petition", "high court", "supreme court",
                 "nclt", "nclat", "sebi", "cci", "tribunal", "verdict", "bench", "justice",
                 "advocate", "suo motu", "bail", "fir", "arrest", "conviction", "ipc", "constitution"],
    "business": ["company", "market", "stock", "share", "profit", "revenue", "ipo", "merger",
                 "acquisition", "rbi", "nifty", "sensex", "corporate", "ceo", "gdp",
                 "inflation", "budget", "fiscal", "trade", "rupee"],
    "reliance": ["reliance", "jio", "mukesh ambani", "ril", "jiomart"],
    "retail":   ["retail", "fmcg", "consumer", "ecommerce", "e-commerce", "flipkart",
                 "amazon", "zomato", "swiggy", "meesho", "blinkit"],
    "tech":     ["tech", "startup", "artificial intelligence", "ai ", "dpdp", "meity",
                 "cyber", "data privacy", "digital", "fintech", "edtech", "app "],
    "world":    ["pakistan", "china", "iran", "russia", "ukraine", "geopolit",
                 "bilateral", "diplomatic", "nato", "united nations", "international"],
    "sports":   ["cricket", "football", "soccer", "ipl", "test match", "wicket",
                 "batting", "bowling", "goal", "league", "tournament", "fifa", "isl"],
    "opinion":  ["opinion", "editorial", "analysis", "column", "perspective", "view"],
}


def guess_section(text):
    lower = text.lower()
    best, best_score = "opinion", 0
    for sec, kws in _SECTION_KW.items():
        score = sum(1 for kw in kws if kw in lower)
        if score > best_score:
            best_score, best = score, sec
    return best


def make_id(section, headline):
    return f"paper-{section}-{hashlib.sha1(headline.encode()).hexdigest()[:8]}"


def parse_stories(text, source_name, max_stories=25):
    """
    Heuristic parser: identifies likely headlines (medium-length lines that look
    like titles) and collects the following body paragraphs.
    Works best on text-based newspaper PDFs.
    """
    stories = []
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    i = 0
    while i < len(lines) and len(stories) < max_stories:
        line = lines[i]
        words = line.split()
        is_headline = (
            4 <= len(words) <= 25 and
            20 <= len(line) <= 200 and
            not re.match(r"^\d+$", line) and
            not re.match(r"^[A-Z\s\d,.\-]+$", line) and   # skip all-caps headers
            not re.search(r"page \d+", line, re.I) and
            not line.startswith("http") and
            not re.match(r"^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}", line)  # skip dates
        )

        if is_headline:
            body_lines = []
            j = i + 1
            while j < len(lines) and len(body_lines) < 10:
                next_line = lines[j]
                next_words = next_line.split()
                # Stop if we hit another likely headline
                if 4 <= len(next_words) <= 25 and len(next_line) <= 200:
                    break
                if len(next_line) > 30:
                    body_lines.append(next_line)
                j += 1

            if body_lines:
                body = " ".join(body_lines)
                section = guess_section(line + " " + body[:400])
                stories.append({
                    "headline": line,
                    "hook":     body[:220],
                    "body":     body[:900],
                    "section":  section,
                    "source":   source_name,
                })
                i = j
                continue
        i += 1

    return stories


def ai_enrich_story(headline, section, hook, body, source):
    """Call Claude Haiku to generate a structured summary + context note."""
    if not ANTHROPIC_API_KEY:
        return None

    context = " ".join(filter(None, [hook, body])).strip()
    prompt = f"""{_READER_PROFILE}

Section: {_SECTION_HINTS.get(section, section)}
Source: {source} (newspaper)
Headline: {headline}
Article excerpt: {context[:600] if context else "(none)"}

Return ONLY a raw JSON object — no markdown, no code fences:
{{
  "summary": "Strictly what this article reports: summarise every major point actually covered in the piece — what happened, who is involved, key figures/numbers/quotes mentioned, any reactions or responses reported, and what the article says happens next. Do NOT add outside context or your own knowledge here. Write in flowing paragraphs. Aim for 150–200 words.",
  "contextNote": "Your own analysis — separate from the article: give the broader background and context a reader needs to fully understand this story, draw on your knowledge of the relevant law/sector/players, then explain specifically why this matters to an Indian lawyer: name the statute, tribunal, or regulatory body involved; identify the compliance risk, precedent, litigation angle, or client advisory implication; and state what a lawyer tracking this area should do or watch for. Aim for 100–150 words."
}}"""

    try:
        payload = {
            "model":      AI_MODEL,
            "max_tokens": 900,
            "messages":   [{"role": "user", "content": prompt}],
        }
        req = Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type":      "application/json",
                "x-api-key":         ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
            },
            method="POST",
        )
        with urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        raw = result["content"][0]["text"].strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$",           "", raw)
        data = json.loads(raw)
        summary      = str(data.get("summary",     "")).strip()
        context_note = str(data.get("contextNote", "")).strip()
        if summary and context_note:
            return {"summary": summary, "contextNote": context_note}
    except HTTPError as e:
        body_err = e.read().decode("utf-8", errors="ignore")
        print(f"      AI HTTP {e.code}: {body_err[:200]}", file=sys.stderr)
    except Exception as e:
        print(f"      AI error: {e}", file=sys.stderr)
    return None


def main():
    paper_file = "paper_stories.json"

    # Load existing processed stories
    existing = []
    if os.path.exists(paper_file):
        try:
            with open(paper_file, encoding="utf-8") as f:
                existing = json.load(f)
        except (json.JSONDecodeError, IOError):
            existing = []

    existing_ids = {s.get("id") for s in existing}

    # Find pending text files
    pending = sorted(glob.glob("papers/pending/*.txt"))
    if not pending:
        print("No pending paper files to process.", file=sys.stderr)
        # Still write paper_stories.json if it doesn't exist yet
        if not os.path.exists(paper_file):
            with open(paper_file, "w", encoding="utf-8") as f:
                json.dump([], f)
        return

    os.makedirs("papers/processed", exist_ok=True)
    new_stories = []
    ai_ok = ai_fail = 0

    for txt_file in pending:
        raw_name = os.path.basename(txt_file).rsplit(".", 1)[0]
        # Strip leading timestamp (YYYYMMDD-HHMMSS-)
        source_name = re.sub(r"^\d{8}-\d{6}-", "", raw_name)

        print(f"\n── {txt_file}  (source: {source_name})", file=sys.stderr)

        try:
            with open(txt_file, encoding="utf-8", errors="replace") as f:
                text = f.read()
        except IOError as e:
            print(f"  SKIP: {e}", file=sys.stderr)
            continue

        stories = parse_stories(text, source_name)
        print(f"  Parsed {len(stories)} candidate stories", file=sys.stderr)

        for story in stories:
            story_id = make_id(story["section"], story["headline"])
            if story_id in existing_ids:
                print(f"  Skip duplicate: {story['headline'][:60]}", file=sys.stderr)
                continue

            print(f"  ✦ {story['headline'][:70]}", file=sys.stderr)
            result = ai_enrich_story(
                story["headline"], story["section"],
                story["hook"], story["body"], source_name,
            )

            now = datetime.now(timezone.utc)
            ist_now = now + IST_OFFSET

            enriched = {
                "id":          story_id,
                "section":     story["section"],
                "headline":    story["headline"],
                "hook":        story["hook"],
                "summary":     result["summary"]     if result else story["body"],
                "contextNote": result["contextNote"] if result else "",
                "source":      source_name,
                "sourceUrl":   "#",
                "dateLabel":   ist_now.strftime("%d %b %Y"),
                "tags":        ["newspaper", story["section"]],
                "fromPaper":   True,
            }
            new_stories.append(enriched)
            existing_ids.add(story_id)

            if result:
                ai_ok += 1
                print(f"    ✓ AI enriched", file=sys.stderr)
            else:
                ai_fail += 1
                print(f"    ✗ AI skipped (kept raw text)", file=sys.stderr)

            if ANTHROPIC_API_KEY:
                time.sleep(AI_CALL_DELAY)

        # Move file to processed/
        dest = os.path.join("papers", "processed", os.path.basename(txt_file))
        os.rename(txt_file, dest)
        print(f"  → moved to {dest}", file=sys.stderr)

    all_stories = existing + new_stories
    with open(paper_file, "w", encoding="utf-8") as f:
        json.dump(all_stories, f, indent=2, ensure_ascii=False)

    print(
        f"\n{'─'*60}\n"
        f"New stories : {len(new_stories)}\n"
        f"AI enriched : {ai_ok}  /  fallback: {ai_fail}\n"
        f"Total stored: {len(all_stories)}\n",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
