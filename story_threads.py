"""
A daily archive of editions, and "developing story" threads built from it — stdlib
only, no network, no AI tokens.

    archive/YYYY-MM-DD.json   one file per edition day (merged across that day's
                              refreshes), slim: just what's needed to recognise a
                              follow-up. Kept for ARCHIVE_DAYS days.
    src/data/threads.json     for each of today's stories, the earlier coverage of the
                              same running story ("Previously…"), newest last.

A thread is recognised from the text alone: two stories belong together when they
share distinctive words (names, places, figures — not "court", "India", "shares"), not
merely a topic. Each article keeps its own note; threading only adds a "Previously"
trail and a "Developing" cue, it never merges anything.
"""
import json
import math
import os
import re
from collections import Counter
from datetime import datetime, timedelta

ARCHIVE_DIR = "archive"
THREADS_PATH = os.path.join("src", "data", "threads.json")
ARCHIVE_DAYS = 30
THREAD_WINDOW_DAYS = 21
MAX_PREVIOUS = 3

# Minimum similarity for two stories to count as the same running story.
MIN_COSINE = 0.34
HIGH_COSINE = 0.42            # so similar that shared-rare-words doesn't matter (a running story's own terms stop being rare)
MIN_SHARED_DISTINCTIVE = 2     # shared words that are rare in the corpus (see _distinctive)

_STOP = frozenset("""
a an the of in on to for and or but is are was were be been being at by as with from into over after
before about against between during without within up down out off than then so such not no nor
it its this that these those he she they them his her their we you your our i me my
has have had do does did will would can could may might must should shall
says said say new news today yesterday tomorrow day week year years month months first second
also more most other another says will vs v
""".split())
_WORD = re.compile(r"[a-z][a-z0-9&'\-]+|\d[\d,\.]*\d|\d")


def _norm(text):
    return re.sub(r"\s+", " ", (text or "")).strip()


def _words(text):
    out = []
    for w in _WORD.findall(_norm(text).lower().replace("’", "'")):
        w = w.strip("-'&,.")
        if len(w) < 3 and not w.isdigit():
            continue
        if w in _STOP:
            continue
        out.append(_stem(w))
    return out


def _stem(w):
    """Crude, so "listing"/"listed"/"lists" and "raise"/"raised" meet. Numbers untouched."""
    if w[0].isdigit() or len(w) < 5:
        return w
    for suf in ("ing", "ed", "es", "s"):
        if w.endswith(suf) and len(w) - len(suf) >= 3 and not (suf == "s" and w.endswith("ss")):
            w = w[: -len(suf)]
            break
    return w[:-1] if w.endswith("e") and len(w) > 3 else w


def _features(story):
    """Headline words count double: they are the story's identity."""
    c = Counter(_words(story.get("headline", "")))
    for w in list(c):
        c[w] *= 2
    summary = _norm(story.get("summary") or story.get("hook") or "")[:220]
    c.update(_words(summary))
    return c


def slim(story):
    """The fields kept in the archive."""
    return {
        "id": story["id"],
        "section": story.get("section", ""),
        "headline": _norm(story.get("headline", "")),
        "summary": _norm(story.get("summary") or story.get("hook") or "")[:240],
        "source": story.get("source", ""),
        "sourceUrl": story.get("sourceUrl", ""),
        "publishedAt": story.get("publishedAt", ""),
    }


# ── archive ────────────────────────────────────────────────────────────────────

def archive_path(date, directory=ARCHIVE_DIR):
    return os.path.join(directory, f"{date}.json")


def update_archive(date, stories, directory=ARCHIVE_DIR, keep_days=ARCHIVE_DAYS):
    """Merge today's stories into archive/<date>.json (by id, newest data wins) and drop
    files older than keep_days. Returns the number of stories now archived for the day."""
    os.makedirs(directory, exist_ok=True)
    path = archive_path(date, directory)
    merged = {}
    try:
        with open(path, encoding="utf-8") as f:
            merged = {s["id"]: s for s in json.load(f).get("stories", []) if "id" in s}
    except Exception:
        pass
    for s in stories:
        if s.get("id"):
            merged[s["id"]] = slim(s)
    with open(path, "w", encoding="utf-8") as f:
        # One story per line: compact, and a day's diff stays readable.
        f.write('{"date": %s, "stories": [\n' % json.dumps(date))
        f.write(",\n".join(json.dumps(s, ensure_ascii=False) for s in merged.values()))
        f.write("\n]}\n")
    cutoff = (datetime.strptime(date, "%Y-%m-%d") - timedelta(days=keep_days)).strftime("%Y-%m-%d")
    for name in os.listdir(directory):
        m = re.fullmatch(r"(\d{4}-\d{2}-\d{2})\.json", name)
        if m and m.group(1) < cutoff:
            os.remove(os.path.join(directory, name))
    return len(merged)


def load_archive(before_date, directory=ARCHIVE_DIR, window_days=THREAD_WINDOW_DAYS):
    """Earlier editions' stories, each tagged with its edition date."""
    out = []
    try:
        names = sorted(os.listdir(directory))
    except OSError:
        return out
    floor = (datetime.strptime(before_date, "%Y-%m-%d") - timedelta(days=window_days)).strftime("%Y-%m-%d")
    for name in names:
        m = re.fullmatch(r"(\d{4}-\d{2}-\d{2})\.json", name)
        if not m or not (floor <= m.group(1) < before_date):
            continue
        try:
            with open(os.path.join(directory, name), encoding="utf-8") as f:
                for s in json.load(f).get("stories", []):
                    out.append({**s, "date": m.group(1)})
        except Exception:
            continue
    return out


# ── threads ────────────────────────────────────────────────────────────────────

def build_threads(today_stories, earlier, today_date):
    """{story id: [earlier stories on the same running story, oldest first]}.

    Cosine similarity over TF-IDF vectors, plus a floor on shared *distinctive* words, so
    "Delhi High Court quashes FIR" doesn't pair with every other Delhi High Court story
    but "Jio Platforms files for IPO" pairs with "Jio Platforms lists on NSE"."""
    if not today_stories or not earlier:
        return {}
    docs_today = [(s, _features(s)) for s in today_stories]
    docs_old = [(s, _features(s)) for s in earlier]
    n_docs = len(docs_today) + len(docs_old)
    df = Counter()
    for _, f in docs_today + docs_old:
        df.update(f.keys())
    idf = {w: math.log((1 + n_docs) / (1 + c)) + 1.0 for w, c in df.items()}
    # A word is distinctive when it appears in few stories (names, figures, places).
    rare = {w for w, c in df.items() if c <= max(3, n_docs * 0.006)}

    def vec(f):
        v = {w: tf * idf[w] for w, tf in f.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        return v, norm

    old_vecs = [(s, f, *vec(f)) for s, f in docs_old]
    threads = {}
    for s, f in docs_today:
        v, norm = vec(f)
        scored = []
        head = _norm(s.get("headline")).lower()
        for o, of, ov, onorm in old_vecs:
            # A story that simply stays in the feed for days (or is filed under two
            # sections) is not an earlier report of itself.
            if o.get("id") == s.get("id") or _norm(o.get("headline")).lower() == head \
                    or (o.get("sourceUrl") and o.get("sourceUrl") == s.get("sourceUrl")):
                continue
            shared = v.keys() & ov.keys()
            if not shared:
                continue
            cos = sum(v[w] * ov[w] for w in shared) / (norm * onorm)
            distinct = [w for w in shared if w in rare]
            if (cos >= MIN_COSINE and len(distinct) >= MIN_SHARED_DISTINCTIVE) or cos >= HIGH_COSINE:
                scored.append((cos, o))
        if not scored:
            continue
        # Keep the best few, but one per edition day so a thread reads as a timeline.
        scored.sort(key=lambda t: -t[0])
        by_day, seen_heads, picked = set(), set(), []
        for cos, o in scored:
            h = _norm(o.get("headline")).lower()
            if o["date"] in by_day or h in seen_heads:
                continue
            by_day.add(o["date"])
            seen_heads.add(h)
            picked.append(o)
            if len(picked) == MAX_PREVIOUS:
                break
        picked.sort(key=lambda o: o["date"])
        threads[s["id"]] = [
            {k: o.get(k, "") for k in ("id", "headline", "source", "section", "sourceUrl", "date")}
            for o in picked
        ]
    return threads


def write_threads(threads, date, path=THREADS_PATH):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"generatedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                   "editionDate": date, "threads": threads}, f, ensure_ascii=False, indent=1)
        f.write("\n")


def run(stories, date, directory=ARCHIVE_DIR, threads_path=THREADS_PATH):
    """Archive today's edition, then thread it against the earlier ones.
    Returns (archived_today_count, number_of_stories_with_a_thread)."""
    earlier = load_archive(date, directory)          # strictly before `date`
    threads = build_threads(stories, earlier, date)
    write_threads(threads, date, threads_path)
    count = update_archive(date, stories, directory)
    return count, len(threads)
