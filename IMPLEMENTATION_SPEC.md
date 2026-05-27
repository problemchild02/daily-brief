# The Daily Brief — Implementation Spec

> **Audience:** Claude Code, working in this repo.
> **Goal:** Transform the current site from a wireframe news dashboard into a personal newspaper, in three phases. Mobile / iPad / laptop parity is non-negotiable.
> **Live site today:** https://problemchild02.github.io/daily-brief/

---

## 0. How to use this file (for the human)

```
1. Save this file as IMPLEMENTATION_SPEC.md in the repo root.
2. cd into the repo.
3. Open Claude Code.
4. First prompt:
   "Read IMPLEMENTATION_SPEC.md and the existing codebase. Don't write
    any code yet. Summarise: (a) what files currently exist and how
    they're organised, (b) what gaps exist vs. the spec, and (c) a
    concrete plan to execute Phase 1 task by task with acceptance
    criteria. I'll approve before you start."
5. After Phase 1 ships and you've used it for a few days, repeat the
   same prompt for Phase 2.
```

This file is the source of truth. Claude Code should refer back to it whenever scope is unclear, and propose edits to *this file* if it discovers a better approach mid-build.

---

## 1. Project context

### What this is
A personal newspaper for one reader (an in-house legal counsel based in Mumbai who also tracks Delhi-NCR / Noida). It aggregates RSS feeds across eight verticals, surfaces a daily AI-generated briefing, and ships as a static React site on GitHub Pages.

### What exists today
- **Static React site** deployed to GitHub Pages at `/daily-brief/`.
- **GitHub Actions workflow** that refreshes content; manually triggerable via a browser-stored PAT.
- **Eight categories:** Legal & Regulatory, Business, Retail, Tech, World, Sports, Opinion — plus Bookmarks and Papers (custom curation).
- **Papers feature:** in-browser PDF text extraction to add stories to a custom newspaper. Privacy-preserving (no upload).
- **Paper canvas:** `#faf8f4` background already in place.
- **Accessibility baseline:** skip-to-content link, viewport meta tag.

### What it should become
A newspaper-feeling reading experience with:
- A dated masthead and edition number.
- A "Briefing of the Day" hero block above the fold.
- A markets/weather strip (two cities: **Mumbai + Noida**).
- Properly typeset cards (kicker / headline / dek / source / time / bookmark / reading-time).
- Category-coded section signage.
- Bottom tab bar on mobile, sidebar on iPad / laptop.
- Light / dark mode with paper-warm palettes.
- Skeleton, empty, and error states.
- All settings (PAT, PDF upload, theme, density) moved off the reading surface.

---

## 2. Stack & dependencies

### Assumed baseline
- **React 18+** with **Vite** as the build tool (adapt if the repo uses CRA — same dependencies, different config).
- **TypeScript** preferred. If the repo is JS-only, keep it JS for now and add TS only if low-friction.
- **Tailwind CSS v4** for styling (CSS-variable-first).
- **GitHub Pages** as the deploy target (already configured).
- **GitHub Actions** for the daily refresh workflow (already configured).

### Dependencies to add

```bash
npm install \
  motion \
  cmdk \
  @dnd-kit/core @dnd-kit/sortable \
  react-loading-skeleton \
  lucide-react \
  react-virtuoso \
  date-fns \
  clsx \
  tailwind-merge

# Dev dependencies for the GitHub Action only
npm install --save-dev \
  rss-parser \
  @anthropic-ai/sdk
```

shadcn/ui components should be added selectively as needed (`npx shadcn@latest add button command sheet dialog tooltip`).

### Required Google Fonts (loaded via `<link>` in `index.html`)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Optional: `Atkinson+Hyperlegible:wght@400;700` for the dyslexia-friendly toggle (Phase 3).

---

## 3. File structure (target)

```
src/
├── components/
│   ├── layout/
│   │   ├── Masthead.tsx
│   │   ├── TabBar.tsx              # mobile bottom nav
│   │   ├── Sidebar.tsx             # iPad / laptop left nav
│   │   ├── SettingsSheet.tsx       # PAT, theme, density, etc.
│   │   └── ScrollToTop.tsx
│   ├── cards/
│   │   ├── Card.tsx                # standard story card
│   │   ├── HeroCard.tsx            # large top-of-section card
│   │   ├── ListRow.tsx             # dense-mode row
│   │   └── SkeletonCard.tsx
│   ├── strips/
│   │   ├── MarketsTicker.tsx
│   │   └── WeatherStrip.tsx        # ← TWO CITIES
│   ├── briefing/
│   │   └── BriefingOfTheDay.tsx
│   ├── sections/
│   │   ├── SectionDeck.tsx         # auto-fit grid of cards per category
│   │   └── SectionHeader.tsx       # title, last-refreshed, feed-health
│   └── search/
│       └── CommandPalette.tsx      # ⌘K via cmdk
├── hooks/
│   ├── useFeeds.ts
│   ├── useBookmarks.ts
│   ├── useDensity.ts
│   ├── useTheme.ts
│   ├── useWeather.ts               # ← Open-Meteo, two cities
│   ├── useMarkets.ts
│   └── useKeyboardShortcuts.ts
├── data/                           # written by the GitHub Action
│   ├── feeds.json
│   ├── briefing.json
│   ├── meta.json                   # { editionNumber, lastRefreshIST, feedHealth }
│   └── sources.json                # RSS feed URLs + display names
├── styles/
│   ├── tokens.css                  # all CSS variables (light + dark)
│   ├── type.css                    # type scale + role classes
│   └── global.css
├── lib/
│   ├── readingTime.ts              # words / 225 → minutes
│   ├── dateFormat.ts               # IST-aware formatters
│   └── categories.ts               # category → colour + label map
├── App.tsx
└── main.tsx

.github/workflows/
└── refresh.yml                     # cron 06:00, 12:00, 18:00 IST + manual

scripts/                            # run inside the Action
├── fetch-feeds.mjs
├── generate-briefing.mjs
└── update-meta.mjs
```

Adapt paths to whatever exists today — but converge on this structure as you go.

---

## 4. Design tokens (`src/styles/tokens.css`)

```css
:root {
  /* Surfaces */
  --canvas:     #FAF8F4;
  --surface:    #FFFFFF;
  --surface-2:  #F3EFE8;
  --rule:       #E6E0D6;

  /* Ink */
  --ink:        #1A1A1A;
  --ink-2:      #4A4A4A;
  --ink-3:      #787470;

  /* Accent */
  --accent:       #A8321F;
  --accent-soft:  #FBE9E4;

  /* Categories */
  --cat-legal:    #7A4E1F;
  --cat-business: #1F4E7A;
  --cat-retail:   #5B2E7A;
  --cat-tech:     #1F6B5E;
  --cat-world:    #7A1F2E;
  --cat-sports:   #3D6B1F;
  --cat-opinion:  #5C5C5C;

  /* Type scale (fluid) */
  --step--1: clamp(0.80rem, 0.78rem + 0.10vw, 0.875rem);
  --step-0:  clamp(1.00rem, 0.97rem + 0.15vw, 1.0625rem);
  --step-1:  clamp(1.25rem, 1.20rem + 0.25vw, 1.375rem);
  --step-2:  clamp(1.563rem, 1.48rem + 0.40vw, 1.75rem);
  --step-3:  clamp(1.953rem, 1.83rem + 0.62vw, 2.25rem);
  --step-4:  clamp(2.441rem, 2.25rem + 0.95vw, 3.00rem);
  --step-5:  clamp(3.052rem, 2.78rem + 1.36vw, 4.00rem);

  /* Font roles */
  --font-serif: 'Newsreader', Georgia, 'Times New Roman', serif;
  --font-sans:  'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono:  'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;

  /* Reading column */
  --measure: 68ch;

  /* Motion */
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --dur-fast: 150ms;
  --dur-base: 220ms;
}

[data-theme="dark"] {
  --canvas:     #11100E;
  --surface:    #1A1815;
  --surface-2:  #23201C;
  --rule:       #2D2926;

  --ink:        #EDE7DC;
  --ink-2:      #B8B0A2;
  --ink-3:      #857E72;

  --accent:       #E8745B;
  --accent-soft:  #3A1F18;

  --cat-legal:    #D9A66B;
  --cat-business: #7AB0E0;
  --cat-retail:   #C198E0;
  --cat-tech:     #5FD0BA;
  --cat-world:    #E08097;
  --cat-sports:   #9AD06B;
  --cat-opinion:  #B8B8B8;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* Auto-apply dark unless user explicitly chose light */
  }
}
```

Map these into Tailwind via `tailwind.config.js`:
```js
theme: {
  extend: {
    colors: {
      canvas: 'var(--canvas)',
      surface: 'var(--surface)',
      'surface-2': 'var(--surface-2)',
      rule: 'var(--rule)',
      ink: 'var(--ink)',
      'ink-2': 'var(--ink-2)',
      'ink-3': 'var(--ink-3)',
      accent: 'var(--accent)',
      // ...etc
    },
    fontFamily: {
      serif: 'var(--font-serif)',
      sans: 'var(--font-sans)',
      mono: 'var(--font-mono)',
    },
    maxWidth: {
      measure: 'var(--measure)',
    },
  },
}
```

---

## 5. Categories (`src/lib/categories.ts`)

```ts
export const CATEGORIES = {
  legal:    { label: 'Legal & Regulatory', colorVar: '--cat-legal',    order: 1 },
  business: { label: 'Business',           colorVar: '--cat-business', order: 2 },
  retail:   { label: 'Retail',             colorVar: '--cat-retail',   order: 3 },
  tech:     { label: 'Tech',               colorVar: '--cat-tech',     order: 4 },
  world:    { label: 'World',              colorVar: '--cat-world',    order: 5 },
  opinion:  { label: 'Opinion',            colorVar: '--cat-opinion',  order: 6 },
  sports:   { label: 'Sports',             colorVar: '--cat-sports',   order: 7 },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;
```

The default front-page order matches the user's reading priority. The Phase 3 drag-to-reorder feature will override this from localStorage.

---

## 6. Core component specs

### 6.1 `Masthead.tsx`

**Visual:**
```
┌─────────────────────────────────────────────────────────────┐
│  THE DAILY BRIEF                       [🌓] [⚙] [/]          │
│  Wednesday, 27 May 2026 · Vol. 1 · Edition 142              │
└─────────────────────────────────────────────────────────────┘
```

**Behaviour:**
- Wordmark uses Newsreader Display, 48–64px, tracking -0.025em, weight 700.
- Date line uses Inter 13px Medium, ink-3 colour.
- Date string uses `Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })`.
- Edition number comes from `data/meta.json`, written by the workflow on each successful run.
- Right side: theme toggle, settings (gear), search (slash) icons. All 44×44 touch targets.
- On scroll past 200px, masthead sticks to top with reduced height (wordmark drops to 24px, date line hides).

### 6.2 `Card.tsx`

**Props:**
```ts
interface CardProps {
  category: CategoryKey;
  kicker?: string;        // e.g. "SEBI" — sub-category
  headline: string;
  dek?: string;           // 1–2 line summary
  source: string;         // e.g. "Reuters"
  url: string;
  publishedAt: string;    // ISO
  wordCount?: number;     // for reading-time calc
  imageUrl?: string;
  variant?: 'standard' | 'hero' | 'list';
}
```

**Structure (standard variant):**
```jsx
<article className="bg-surface border border-rule rounded-2xl p-6 hover:border-ink-3/20 transition-colors">
  <div className="font-sans text-[11px] font-semibold tracking-[0.08em] uppercase mb-2.5"
       style={{ color: `var(--cat-${category})` }}>
    {CATEGORIES[category].label}{kicker && ` · ${kicker}`}
  </div>
  <h3 className="font-serif text-[22px] font-semibold leading-[1.15] tracking-[-0.015em] mb-2 text-ink">
    <a href={url} target="_blank" rel="noopener">{headline}</a>
  </h3>
  {dek && (
    <p className="font-serif text-[15px] leading-[1.45] text-ink-2 mb-3.5">{dek}</p>
  )}
  <div className="font-mono text-[11px] text-ink-3 flex justify-between items-center">
    <span>{source} · {readingTime} min read</span>
    <div className="flex items-center gap-3">
      <time dateTime={publishedAt}>{relativeTime(publishedAt)}</time>
      <BookmarkButton url={url} />
    </div>
  </div>
</article>
```

**Hero variant:** spans 2 columns on tablet+, 28px headline, optional 3-bullet AI summary if available in `data/feeds.json` for that article.

**List variant:** single-row, 52px tall — headline, source, time, all on one line. Used in Dense mode.

### 6.3 `BriefingOfTheDay.tsx`

Renders `data/briefing.json`, a structure like:
```json
{
  "generatedAt": "2026-05-27T01:00:00Z",
  "bullets": [
    { "text": "SEBI's new RPT framework will require...", "category": "legal", "url": "https://..." },
    { "text": "Reliance Retail Q4 same-store growth at 18.2%...", "category": "retail", "url": "https://..." }
  ],
  "summary": "Three legal and two market stories anchor today's brief..."
}
```

**Visual:** a 2-column-wide hero block above all section decks.

Title: "**Today's Brief**" in Newsreader Display 28px, plus generation timestamp in mono.
Bullets: numbered (1–5) in Newsreader Text 17px, each clickable to source, with a category-coloured dot prefix.
Footer: "Regenerate" button (calls the workflow_dispatch endpoint).

### 6.4 `WeatherStrip.tsx` — **TWO CITIES**

**Visual:**
```
  ☁ Mumbai 28°  Light rain expected 18:00    |    ☀ Noida 36°  Clear, AQI 142
```

**Hook (`useWeather.ts`):**

```ts
import { useEffect, useState } from 'react';

interface CityWeather {
  city: 'Mumbai' | 'Noida';
  tempC: number;
  conditionCode: number;     // WMO weather code
  conditionLabel: string;    // "Clear", "Light rain", etc.
  nextRainHour?: string;     // e.g. "18:00" if rain in next 6h
  aqi?: number;              // separate CPCB call
}

const CITIES = [
  { name: 'Mumbai', lat: 19.0760, lon: 72.8777 },
  { name: 'Noida',  lat: 28.5355, lon: 77.3910 },
] as const;

export function useWeather() {
  const [data, setData] = useState<CityWeather[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Open-Meteo: single call returns both cities
    const lats = CITIES.map(c => c.lat).join(',');
    const lons = CITIES.map(c => c.lon).join(',');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,weather_code,precipitation&hourly=precipitation_probability&forecast_hours=6&timezone=Asia%2FKolkata`;

    fetch(url)
      .then(r => r.json())
      .then(json => {
        // Open-Meteo returns an array when multiple coords are passed
        const responses = Array.isArray(json) ? json : [json];
        const parsed = responses.map((r, i) => ({
          city: CITIES[i].name,
          tempC: Math.round(r.current.temperature_2m),
          conditionCode: r.current.weather_code,
          conditionLabel: wmoCodeToLabel(r.current.weather_code),
          nextRainHour: findNextRainHour(r.hourly),
        }));
        setData(parsed as CityWeather[]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { data, loading };
}

function wmoCodeToLabel(code: number): string {
  // WMO weather interpretation codes — abridged
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code <= 99) return 'Thunderstorm';
  return '—';
}

function findNextRainHour(hourly: { time: string[]; precipitation_probability: number[] }): string | undefined {
  const idx = hourly.precipitation_probability.findIndex(p => p > 60);
  if (idx === -1) return undefined;
  return hourly.time[idx].slice(11, 16); // "HH:MM"
}
```

**Settings affordance:**
- A "Home city" preference (Mumbai default) stored in localStorage as `daily-brief:home-city`.
- The strip always shows both, but any larger weather card (Phase 2 nice-to-have) uses the home city as primary.

**AQI (optional, Phase 2):**
- CPCB doesn't expose a clean public API. Easier route: World Air Quality Index API (`waqi.info`) — free tier, requires a free API token. Token can be embedded in the client safely.
- If skipping for v1, just show temp + condition for both cities.

### 6.5 `MarketsTicker.tsx`

```ts
const SYMBOLS = [
  { display: 'SENSEX', symbol: '^BSESN' },
  { display: 'NIFTY',  symbol: '^NSEI' },
  { display: 'USDINR', symbol: 'INR=X' },
  { display: 'BRENT',  symbol: 'BZ=F' },
];
```

Use Yahoo Finance unofficial endpoint:
```
https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d
```

Returns last-close and previous-close in `chart.result[0].meta`. Compute % change client-side.

**Visual:** monospace, fixed-width, colour-coded (green up, accent-red down):
```
SENSEX 73,425  +0.42%   NIFTY 22,148  +0.31%   USDINR 83.42  -0.08%   BRENT 82.14  +1.12%
```

**Refresh:** every 5 minutes during 09:15–15:30 IST (Mon-Fri); static the rest of the time. Use `setInterval` with a market-hours guard.

### 6.6 `SectionDeck.tsx`

```jsx
<section className="mb-12">
  <SectionHeader category={category} lastRefresh={lastRefresh} feedHealth={feedHealth} />
  <div className="grid gap-5"
       style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
    {stories.map(s => <Card key={s.url} {...s} />)}
  </div>
</section>
```

That `auto-fit` + `minmax(320px, 1fr)` is the single declaration that handles 1 col on phone, 2 on iPad portrait, 3 on iPad landscape, 3-4 on desktop. No media queries.

### 6.7 `TabBar.tsx` and `Sidebar.tsx`

```jsx
// In App.tsx
<div className="min-h-screen bg-canvas text-ink">
  {isDesktop && <Sidebar />}
  <main className={isDesktop ? 'ml-[240px]' : 'pb-20'}>
    {/* content */}
  </main>
  {!isDesktop && <TabBar />}
</div>
```

Use a `useMediaQuery('(min-width: 900px)')` hook to choose. Five primary tabs/items: Front, Sections, Search, Saved, Papers.

Touch targets 44×44 minimum. Bottom tab bar respects `env(safe-area-inset-bottom)`.

### 6.8 `SettingsSheet.tsx`

Slide-up sheet (mobile) / dialog (desktop) using shadcn `Sheet`/`Dialog`. Contains:

- Theme: Auto / Light / Dark
- Density: Comfortable / Compact / Dense
- Home city: Mumbai / Noida
- Font size: A− / A / A+
- GitHub PAT (with helper text about `workflow` scope)
- "Run workflow now" button
- "Upload PDF" entry into Papers
- Atkinson Hyperlegible toggle (Phase 3)

Everything persists to localStorage with the prefix `daily-brief:`.

---

## 7. The GitHub Actions workflow

`.github/workflows/refresh.yml` — runs on cron and dispatch:

```yaml
name: Refresh Daily Brief
on:
  schedule:
    - cron: '30 0,6,12 * * *'  # 06:00, 12:00, 18:00 IST = 00:30, 06:30, 12:30 UTC
  workflow_dispatch:

jobs:
  refresh:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - name: Fetch feeds
        run: node scripts/fetch-feeds.mjs
      - name: Generate briefing
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: node scripts/generate-briefing.mjs
      - name: Update meta
        run: node scripts/update-meta.mjs
      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add src/data/
          git diff --staged --quiet || git commit -m "Refresh feeds [skip ci]"
          git push
```

### Scripts

**`scripts/fetch-feeds.mjs`** — uses `rss-parser` to fetch every feed in `src/data/sources.json`, normalises into `src/data/feeds.json`, captures any fetch errors into `meta.feedHealth`.

**`scripts/generate-briefing.mjs`** — picks the top 3 stories per priority category (Legal, Business, Retail), calls Claude Haiku with a prompt like:

```
You are an editor producing a 5-bullet morning briefing for a senior
in-house legal counsel at an Indian retail company. Pick the 5 most
important stories from the input. For each, write one concise bullet
(max 25 words) capturing the substance. Output JSON only.

Input: <stories array>

Output schema:
{
  "summary": "<2-sentence editor's note>",
  "bullets": [
    { "text": "...", "category": "legal|business|retail|tech|world|opinion|sports", "url": "..." },
    ...
  ]
}
```

Cost estimate: Claude Haiku 4.5 at typical token counts → roughly ₹2–5 per run × ~90 runs/month ≈ **₹200–450/month**. If that feels too high, switch to a single 06:00 run and skip the 12:00 and 18:00 generations — drops to ~₹70–150/month.

**`scripts/update-meta.mjs`** — increments `editionNumber`, writes `lastRefreshIST` as a formatted string, records `feedHealth`.

---

## 8. Phase 1 — Foundation (Weekend 1–2)

### Acceptance criteria
- [ ] Newsreader, Inter, JetBrains Mono load on first paint.
- [ ] `tokens.css` + Tailwind config wire up; `bg-canvas`, `text-ink`, `font-serif` all work.
- [ ] Dark mode toggles via `[data-theme="dark"]` on `<html>` and persists.
- [ ] Masthead renders date + edition number, sticky on scroll.
- [ ] Cards use kicker/headline/dek/source/time pattern; category colour applied to kicker.
- [ ] Reading time per card (Math.ceil(words/225)).
- [ ] Settings sheet exists with theme, density, home city, PAT, PDF upload — and the PAT/PDF have been removed from the main page.
- [ ] Section header shows "Last fetched: <time> · X/Y sources OK".
- [ ] Site looks correct on iPhone 13 mini (375px), iPad portrait (768px), and 1280px laptop.
- [ ] Lighthouse mobile ≥ 90.

### Task order
1. Install dependencies, configure Tailwind v4 with the design tokens.
2. Add Google Fonts link in `index.html`.
3. Create `src/styles/tokens.css` and `src/styles/type.css`.
4. Build `Masthead.tsx` with `useTheme` hook.
5. Build `Card.tsx` (standard variant) + `lib/readingTime.ts`.
6. Build `SectionDeck.tsx` with the auto-fit grid.
7. Refactor any current page to use `Masthead + SectionDeck + Card`.
8. Build `SettingsSheet.tsx`. Move PAT input and PDF upload into it.
9. Build `SectionHeader.tsx` with last-fetched + feed-health pills.
10. Add edition counter to `meta.json` (script + workflow).
11. QA across three viewports; fix overflow / spacing issues.

---

## 9. Phase 2 — Newsroom (1–2 weeks)

### Acceptance criteria
- [ ] `BriefingOfTheDay` renders above all sections on Front Page.
- [ ] Workflow generates `briefing.json` once per refresh.
- [ ] `WeatherStrip` shows Mumbai + Noida (two cities, one Open-Meteo call).
- [ ] `MarketsTicker` updates every 5 min during NSE hours.
- [ ] Bottom tab bar on phone; left sidebar at ≥900px. Five primary destinations.
- [ ] ⌘K / `/` opens the `cmdk` command palette; searches loaded stories.
- [ ] Density toggle works; per-section list view toggle works.
- [ ] Bookmarks persist in localStorage; "Saved" view groups by date saved.
- [ ] Every section has proper skeleton, empty, and error states.
- [ ] `@media print` stylesheet produces a clean printable layout.
- [ ] Export to PDF button works (invokes `window.print()`).

### Task order
1. Write `scripts/generate-briefing.mjs`; add `ANTHROPIC_API_KEY` to repo secrets.
2. Build `BriefingOfTheDay.tsx`.
3. Build `useWeather.ts` and `WeatherStrip.tsx` (two-city).
4. Build `useMarkets.ts` and `MarketsTicker.tsx`.
5. Build `TabBar.tsx`, `Sidebar.tsx`; wire up routing.
6. Build `CommandPalette.tsx` with `cmdk`; index loaded stories.
7. Build `useDensity.ts` + density toggle; build `ListRow.tsx` for dense mode.
8. Build `useBookmarks.ts`; build the Saved view.
9. Build `SkeletonCard.tsx` and empty/error states for each section.
10. Write `@media print` rules; add Export-to-PDF button in Settings.
11. QA + Lighthouse ≥ 95 on iPad Safari.

---

## 10. Phase 3 — Delights (ongoing)

Pick from this list based on what feels missing after Phase 2 ships and gets used for two weeks:

- Drag-to-reorder categories (`dnd-kit`).
- Reading mode (full-screen single-column article view, 68ch measure).
- Atkinson Hyperlegible dyslexia-friendly toggle.
- A− / A / A+ font scale.
- Cloudflare Worker to hide the PAT + proxy "Explain this" calls.
- Daily 07:00 IST email digest (GitHub Action with mail-action or SendGrid free tier).
- Pull-to-refresh on mobile/iPad.
- Swipe-to-bookmark gesture.
- Keyboard shortcut layer (J/K/B/O/?/⌘K).
- Per-article highlights + annotations (localStorage or gist).
- "Explain this" AI button per card.
- Bluebook / OSCOLA citation export for legal sources.

---

## 11. Conventions for Claude Code

- **Read first, write second.** Always survey existing files in this repo before changing structure. Adapt the file paths in §3 to whatever already exists; don't move files unnecessarily.
- **One commit per task.** Each numbered task in §8 / §9 should be its own commit with a clear message.
- **Don't break the deploy.** GitHub Pages is the production target. Verify `npm run build` succeeds before pushing.
- **Mobile-first CSS.** Default styles target phones; use `@media (min-width: …)` to scale up, not down.
- **No new dependencies without asking.** The dependency list in §2 is final unless there's a strong reason to deviate.
- **TypeScript strict if possible.** If the repo is currently JS, don't migrate wholesale — add `.ts/.tsx` for new files only.
- **Accessibility is a release-blocker.** Every interactive element keyboard-reachable; visible focus states; `<time datetime>` for timestamps; `aria-label` on icon buttons.
- **Performance budget:** JS ≤ 200KB gzipped, CSS ≤ 60KB, fonts ≤ 80KB above-the-fold.
- **No browser storage other than `localStorage`/`sessionStorage`.** No IndexedDB unless explicitly needed.
- **Ask, don't assume.** If a spec detail is ambiguous, surface the question before writing code. Examples of "ask first": adding a new vertical, changing the colour system, introducing a routing library.

---

## 12. Reference — design rationale (skim if you need context)

- **Why Newsreader:** commissioned by Google Fonts for on-screen reading in content-rich environments. Free alternative to Lyon / Tiempos.
- **Why Inter:** de-facto modern UI typeface — Figma, GitHub, Linear, Vercel ship with it. Tabular figures by default (critical for timestamps).
- **Why 68ch measure:** Bringhurst's "Elements of Typographic Style" calls the 66-character line ideal; 68ch is the practical web equivalent.
- **Why `auto-fit` grid:** one CSS declaration replaces five media queries.
- **Why warm-near-black in dark mode:** APCA research shows pure-black + pure-white causes halation. Warm-near-black (`#11100E`) + warm-cream (`#EDE7DC`) keeps APCA Lc ≥ 75 without glare.
- **Why bottom tab bar → sidebar promotion:** Apple HIG / iPadOS 18 pattern. Same mental model from phone to laptop.
- **Why category colour as signage, not fill:** card fills compete with content; signage (kicker, left-border on hero) directs the eye without shouting.

---

## 13. Cost summary

| Item | Cost |
|---|---|
| Fonts (Newsreader, Inter, JetBrains Mono, Atkinson Hyperlegible) | ₹0 |
| All libraries (Motion, cmdk, dnd-kit, etc.) | ₹0 |
| Open-Meteo (weather, two cities) | ₹0 |
| WAQI (AQI, optional) | ₹0 (free tier) |
| Yahoo Finance unofficial (markets) | ₹0 |
| GitHub Pages + Actions (public repo) | ₹0 |
| GitHub Gists for cross-device bookmarks | ₹0 |
| Cloudflare Worker for PAT proxy (Phase 3) | ₹0 (free tier) |
| **Claude Haiku for daily briefing** | **~₹70–450/month depending on cadence** |
| **Total** | **~₹70–450/month, all-in** |

The briefing API cost is the only line item that isn't zero. If it ever feels wasteful, the workflow can be edited to skip generation between 06:01 and 23:59 — one briefing per day.

---

*End of spec. Phase 1 first.*
