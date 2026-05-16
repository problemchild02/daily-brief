# Automation Guide

## What runs automatically
`fetch_stories.py` fetches 13 curated RSS feeds across 8 sections, filters
stories to the last 30 hours, maps them to `story-schema.json`, and writes
`stories.json`. No API keys. No paid services.

## Scheduled run
Every day at **06:00 AM IST** via `.github/workflows/daily-update.yml`.

## Manual refresh — two ways

### Option A: GitHub UI (no terminal needed)
1. Go to your repo → **Actions** tab
2. Click **"Daily Brief — Auto-Update"** in the left sidebar
3. Click the **"Run workflow"** button (top-right of the run table)
4. Hit the green **"Run workflow"** confirm button
5. Stories refresh and commit happens automatically in ~60 seconds

### Option B: Run locally
```bash
python fetch_stories.py
git add stories.json
git commit -m "manual: refresh stories"
git push
```

## Customising feeds
Edit the `FEEDS` list at the top of `fetch_stories.py`:
```python
FEEDS = [
    ("https://example.com/rss", "section", ["tag1", "tag2"], "priority"),
]
```
- **section**: legal · reliance · retail · business · tech · geopolitics · sports · opinion  
- **priority**: high · medium · low

## Feed sources included
| Feed | Section |
|---|---|
| Live Law | legal |
| Bar & Bench | legal |
| Economic Times Markets | business |
| Economic Times Industry | business |
| Business Line | business |
| TechCrunch | tech |
| Gadgets 360 | tech |
| NYT World | geopolitics |
| BBC India | geopolitics |
| ET Retail | retail |
| ESPN Cricinfo | sports |
| Times of India Sports | sports |
| ET Opinion | opinion |
