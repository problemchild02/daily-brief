# The Daily Brief — Implementation Spec

> **Audience:** Claude Code, working in this repo.
> **Goal:** Transform the current site from a wireframe news dashboard into a personal newspaper, in three phases. Mobile / iPad / laptop parity is non-negotiable.
> **Live site today:** https://problemchild02.github.io/daily-brief/

> **Reading guide:** Decisions in this spec are accompanied by a **Why this** note explaining the intent behind them. When the spec is ambiguous about a detail, optimise for the *intent* not the *letter*. When the intent itself is unclear, ask before writing code.

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

## 2. Design principles — Why it matters

These principles are the worldview behind every specific decision in this spec. When in doubt, refer back here.

### 2.1 It's a newspaper, not a dashboard
**Why this matters:** Dashboards are tools you scan; newspapers are artefacts you read. The current site is a dashboard — flat section blocks with refresh buttons. The transformation is to a newspaper: dated masthead, briefing-of-the-day hero, editorial typography, byline metadata, bookmarkable stories. The mental model shapes every UI decision — for example, a newspaper has a *date* and an *edition number*, a dashboard has a *last-refreshed timestamp*. We do both, but lead with the newspaper framing.

### 2.2 Editorial typography beats UI typography
**Why this matters:** A reading-first product needs reading-first type. UI typography (Inter, SF Pro, Helvetica) is optimised for short labels at small sizes; editorial typography (Newsreader, Lyon, Tiempos) is optimised for sustained reading at body sizes. Mixing both — serif for content, sans for chrome — is how every serious news product looks the way it does (FT, NYT, Stratechery). The serif headline is what makes the difference between "another dashboard" and "the morning paper".

### 2.3 One CSS Grid declaration replaces five media queries
**Why this matters:** Mobile/iPad/laptop parity is the hard constraint, and the cheapest way to honour it is to *let the browser figure out the columns*. `repeat(auto-fit, minmax(320px, 1fr))` produces 1 column at 375px, 2 at 768px, 3 at 1024px, 4 at 1280px+ — without a single media query. Fewer media queries = fewer places to break = fewer device-specific bugs.

### 2.4 Category colour is signage, not fill
**Why this matters:** Category-coloured *card backgrounds* compete with the headline — the eye reads the colour block, not the words. Category colour applied only to the kicker text and a 2px left-border on hero cards directs the eye to the content while still giving each category a recognisable spine. Restraint here is what separates editorial design from a Trello board.

### 2.5 Warm cream and warm near-black, never pure white or pure black
**Why this matters:** Pure white at typical screen brightness creates the same fatigue as reading a backlit billboard — that's why FT's pink and NYT's off-white exist. In dark mode, pure black + bright white causes "halation" (text appears to vibrate at the edges) per APCA research. Warm cream `#FAF8F4` + warm near-black `#11100E` paired with warm-cream text `#EDE7DC` keeps APCA Lc ≥ 75 (the body-text "Gold" threshold) without that effect. The eyes thank us.

### 2.6 Touch targets are 44×44, no exceptions
**Why this matters:** Apple HIG mandates 44pt minimum touch targets — below that, mistap rates climb sharply per Apple's own usability research. This applies on iPad as much as on phone. A 32px bookmark icon may look more refined, but the user who taps the headline instead and breaks their flow is a worse outcome than slightly larger affordances.

### 2.7 Configuration controls do not leak into the reading surface
**Why this matters:** PAT inputs, PDF uploaders, theme toggles, density sliders — none of these are content. They live behind a gear icon, in a sheet. The reading surface should contain only stories. This is the difference between "I built a tool" and "I read the news".

### 2.8 Same mental model from phone to laptop
**Why this matters:** Apple's iPadOS 18 HIG explicitly recommends bottom tab bar on phones → sidebar on iPad and Mac. Same five primary destinations everywhere. Building two separate navigation systems is more work AND more inconsistency. A user who learns the app on iPhone shouldn't have to re-learn it on iPad.

### 2.9 Generate expensive things server-side, cache as JSON
**Why this matters:** The daily briefing is the most expensive operation in the system (an LLM call). Doing it client-side per-visitor would expose the API key, cost more, and delay first paint. Doing it once per refresh in the GitHub Action — and caching the result as `briefing.json` in the repo — means the page loads instantly with the briefing already there, and the LLM key never leaves the workflow runner.

### 2.10 Ship phases, not features
**Why this matters:** Each phase is independently useful and shippable. Phase 1 alone (paper masthead + editorial cards + settings) is meaningfully better than today. Phase 2 alone (briefing + strips + nav) is meaningfully better than Phase 1. You might discover during Phase 1 that something fundamental needs rethinking — better to discover that after 4 PRs than after 20.

### 2.11 Per-story practitioner analysis is the differentiating value
**Why this matters:** Aggregating news is commodity work — any RSS reader does it. The existing site already includes a "Why It Matters" per-story callout: an AI-generated practitioner brief that explains the legal/regulatory significance of each story, with specific case references (e.g. *Arun Ferreira (2021)*), constitutional framing (Article 21/22), and numbered practical implications. **This is the feature that makes this product irreplaceable.** It must be preserved and elevated in the redesign — not collapsed into the daily briefing, not styled as an afterthought, not lost during the Card refactor. Treat it as the *primary* content of each story card; the headline brings the reader in, the dek summarises, and the "Why It Matters" is what they actually came for.

### 2.12 The reader's annotations are sacred data
**Why this matters:** The existing site supports per-article notes that auto-save. These are the reader's *own thinking* — far more valuable than any AI output. They must persist across refreshes, survive feed updates, be exportable from the Saved view, and never be silently lost. When in doubt about a data-handling decision involving notes, choose the more conservative option (longer retention, more backups, more visible save indicators).

---

## 3. Stack & dependencies

### Assumed baseline
- **React 18+** with **Vite** as the build tool (adapt if the repo uses CRA — same dependencies, different config).
- **TypeScript** preferred. If the repo is JS-only, keep it JS for now and add TS only if low-friction.
- **Tailwind CSS v4** for styling (CSS-variable-first).
- **GitHub Pages** as the deploy target (already configured).
- **GitHub Actions** for the daily refresh workflow (already configured).

> **Why this stack:** React + Vite is the modern default for content-driven static sites — fast dev server, fast production builds, GitHub Pages-compatible out of the box. Tailwind v4 (released late 2024) is *CSS-variable-first*, which means our design tokens in `tokens.css` flow directly into utility classes — no JS theme objects, no PostCSS plugins, no build-time computation. This keeps the design system in one file and one mental model.

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

> **Why each library:**
> - **motion** (formerly Framer Motion): spring physics, layout animations, `<AnimatePresence>`. The only animation library that lets you do shared-element transitions (card → article view) without writing the choreography yourself.
> - **cmdk**: the Linear/Vercel-style ⌘K palette. Building this from scratch isn't worth the time — cmdk handles keyboard nav, grouping, screen-reader semantics, and recent-history in ~7KB gzipped.
> - **@dnd-kit**: drag-and-drop that works on touch (Phase 3 category reordering). The legacy `react-dnd` requires HTML5 drag events which don't fire on mobile.
> - **react-loading-skeleton**: ~870K weekly downloads; CSS-only shimmer, no JS runtime cost.
> - **lucide-react**: the icon set that ships with shadcn. Consistent stroke width, designed for UI not decoration.
> - **react-virtuoso**: needed once you have 200+ cards on screen at once. Variable-height aware, unlike react-window.
> - **date-fns**: tree-shakable. moment.js would add 67KB; date-fns is ~10KB for the functions we actually use.
> - **clsx + tailwind-merge**: the conditional-class pattern shadcn uses. Lets you write `cn('p-4', isActive && 'bg-accent', className)` without class duplication bugs.
> - **rss-parser + @anthropic-ai/sdk**: only used inside the GitHub Action, never shipped to the client.

shadcn/ui components should be added selectively as needed (`npx shadcn@latest add button command sheet dialog tooltip`).

> **Why shadcn over a component library:** shadcn is *copy-paste*, not a dependency — components land in `src/components/ui/`, you own the source. This means no version drift, no breaking changes from upstream, and full freedom to restyle with our design tokens. The opposite philosophy from Material UI or Chakra.

### Required Google Fonts (loaded via `<link>` in `index.html`)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

> **Why these three fonts:**
> - **Newsreader** was commissioned by Google Fonts specifically *"for continuous on-screen reading in content-rich environments"* — the closest free analogue to Lyon, Tiempos, or Chronicle. Its variable-optical-size axis means the same font file looks correct at 12pt body and 72pt masthead.
> - **Inter** has become the de-facto UI font (Figma, GitHub, Linear, Vercel ship with it). Tabular figures by default — critical for timestamps where "09:42" and "10:55" must align vertically. Humanist proportions read cleanly at 11px UI sizes.
> - **JetBrains Mono** for tickers, timestamps, code. The role of monospace in editorial design is *"this is data, not narrative"* — the NYT uses Franklin Gothic for the same purpose in print. JetBrains Mono is the freely-licensed pick with the best legibility at 11–12px.
> - Total above-the-fold font payload: ~80KB compressed, all subsets. Acceptable.

Optional: `Atkinson+Hyperlegible:wght@400;700` for the dyslexia-friendly toggle (Phase 3).

---

## 4. File structure (target)

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

> **Why this layout:** Components grouped by *role* (layout, cards, strips, briefing, sections, search) not by *feature*. Hooks separate from components — easier to test, easier to share between routes. The `/data` directory holds workflow-generated JSON, which means the client never makes runtime API calls for things that don't change between renders. That's why the site loads instantly on GitHub Pages.

Adapt paths to whatever exists today — but converge on this structure as you go.

---

## 5. Design tokens (`src/styles/tokens.css`)

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
```

> **Why fluid type via clamp():** Fixed type sizes (`18px`, `32px`) require breakpoint-specific overrides for tablet and desktop. `clamp(min, preferred, max)` produces a continuously-scaling size that adapts to viewport width within sensible bounds. The headline that's 22px on iPhone becomes 26px on iPad and 28px on desktop, with zero media queries. The user perceives "appropriately sized for this screen" at every width.
>
> **Why 68ch measure:** Bringhurst's *Elements of Typographic Style* calls the 66-character line "widely regarded as ideal." Baymard's reading-comfort research puts the comfort range at 50–75 characters. 68ch (in the body font, accounting for character-width variability) lands in the middle of that range and survives font-scaling.
>
> **Why three motion durations only:** `fast` (150ms) for state changes (hover, focus). `base` (220ms) for transitions (modal open, route change). One easing curve (`cubic-bezier(0.2, 0.8, 0.2, 1)`) used everywhere. Consistency in motion is what makes interactions feel deliberate rather than reactive.

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

## 6. Categories (`src/lib/categories.ts`)

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

> **Why this order:** It matches the actual daily reading priority — legal-regulatory work first, then market-relevant business and retail, then tech and world for context, opinion mid-morning, sports at the very end. Sports comes last *because* a reader checking sports first thing in the morning is a different person than one checking it after the legal brief. The order codes the intent.
>
> **Why the Phase 3 drag-to-reorder feature exists at all:** because the default order will be wrong sometimes — a counsel preparing for a specific tech-policy hearing might want Tech first that week. The system should give the default and let the user override it.

---

## 7. Core component specs

### 7.1 `Masthead.tsx`

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

> **Why a masthead with edition number:** It's the single highest-leverage change in the entire spec. A newspaper without a date and edition number is just a page. The masthead transforms the *psychological* experience from "I'm looking at a website" to "I'm reading today's paper". The edition number rewards return visits — Edition 142 today, 143 tomorrow.
>
> **Why the masthead shrinks on scroll:** Real estate. The masthead is gorgeous but the user came for stories. Sticky-with-shrink gives them both — the brand identity persists, the content gets the room it needs.

### 7.2 `Card.tsx`

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

> **Why the kicker-headline-dek-meta structure:** It's the canonical newspaper card anatomy, used by every editorial publication that ships cards (FT, Bloomberg, NYT, Stratechery). The kicker tells you "this is the category"; the headline tells you "this is the story"; the dek tells you "this is whether you should read it"; the meta tells you "this is how to act on it". Each element answers a different question, in the order the reader needs.
>
> **Why 225 WPM for reading time:** Medium uses 265 WPM in its public help docs. The `reading-time` npm package uses 200 WPM. 225 splits the difference. Reading-time isn't precision data; it's calibration — does "4 min read" mean "I have time before my call" or "I'll come back later". 225 produces honest estimates for content-dense reading where the reader skims passages.

### 7.3 `BriefingOfTheDay.tsx`

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

> **Why this is the single highest-impact new feature:** Eight categories of stories without a synthesis is *less* useful than five distilled bullets. Phase 1 already gives the reader scannable cards. The briefing tells them what *matters today across categories*. It's the difference between a feed reader and an editor's note — and the editor's note is what makes a publication feel curated rather than aggregated.
>
> **Why generation runs in the workflow, not the client:** Three reasons. (1) Security — an Anthropic API key in the browser is exfiltrable by anyone viewing source. (2) Cost — generating per-visit means the cost scales with traffic. Generating per-refresh means the cost is fixed and predictable. (3) Performance — a cached `briefing.json` loads in 5ms; a fresh LLM call takes 3–8 seconds. The reader sees the briefing instantly on page load.

### 7.4 `WeatherStrip.tsx` — **TWO CITIES**

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

> **Why both cities at once, in a single API call:** The reader splits time and attention between Mumbai (home, office) and Delhi-NCR/Noida (work travel, family). A weather widget that only shows one city forces a daily question "which one today?" — a friction the product doesn't need. Open-Meteo accepts comma-separated coordinates and returns an array, so showing both costs one network round-trip, half the cold-start latency, and simpler error handling than two separate calls.
>
> **Why Open-Meteo specifically:** Free, no API key required, no commercial-use restriction for personal projects, CC BY 4.0. The alternatives — OpenWeatherMap, WeatherAPI — require keys and have rate limits. Open-Meteo is the unambiguous pick for a static personal site.

### 7.5 `MarketsTicker.tsx`

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

> **Why these four symbols specifically:** Sensex and Nifty are the index summaries (BSE and NSE benchmarks). USDINR matters because retail margins are import-cost-sensitive. Brent matters because it drives transport and packaging input costs. Together they answer "is today a normal day in the economy I sell into?" in four numbers.
>
> **Why unofficial Yahoo Finance:** Reliability is acceptable for a personal app where the fallback is "—". Official feeds (TrueData, ICICI Breeze, Bloomberg) cost ₹1,000–10,000+/month and matter for trading desks, not for a glance-at-the-strip morning check. If the endpoint breaks once a quarter, the cost of fixing it is less than the cost of paying for guaranteed uptime.

### 7.6 `SectionDeck.tsx`

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

> **Why 320px minimum:** A 320px-wide card fits the headline + dek + meta row legibly without ellipsing. Anything narrower compresses the dek to one line and forces awkward text-overflow. 320px also matches the smallest reasonable phone width (iPhone SE), so on the smallest device the grid renders as a single column without the card itself becoming too narrow.

### 7.7 `TabBar.tsx` and `Sidebar.tsx`

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

> **Why 900px as the bottom-tab → sidebar threshold:** iPad portrait is 768px and iPad landscape is 1024px. 900px sits between them — meaning iPad portrait gets the bottom tab bar (one-handed reach, no horizontal navigation competing with content) and iPad landscape gets the sidebar (more horizontal real estate justifies a persistent nav). This is also Apple's recommended threshold for the iPadOS 18 sidebar pattern.
>
> **Why five tabs, not seven or more:** Apple HIG: "3–5 tabs in a tab bar." More than 5 produces a "More" tab, which is where features go to die. The seven categories live *inside* the Sections tab on mobile and as Sidebar sub-items on iPad+ — same five primary destinations everywhere.

### 7.8 `SettingsSheet.tsx`

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

> **Why a sheet, not a settings page:** Settings should feel like a tool you reach for, not a place you navigate to. A sheet appears in-context (over the reading surface), the user makes a change, the change applies immediately, the sheet dismisses. A settings page breaks reading flow and pretends the configuration is more important than it is.
>
> **Why localStorage prefixing with `daily-brief:`:** Future-proofing. If you ever embed the app inside another product (or deploy it on a domain that hosts something else), namespaced keys don't collide. Cheap insurance.

### 7.9 `WhyItMatters.tsx` — Per-story practitioner brief

**This component already exists on the live site and must be preserved.** It is the single most differentiating feature of the product.

**Visual (rendered inside each Card, below the dek, above the metadata row):**

```
┌──────────────────────────────────────────────────────────┐
│ │ WHY IT MATTERS                                         │
│ │                                                        │
│ │ This likely concerns India's Unlawful Activities       │
│ │ (Prevention) Act (UAPA)... [body of practitioner       │
│ │ analysis with case references, statutory framing,      │
│ │ and numbered practical implications]                    │
└──────────────────────────────────────────────────────────┘
```

**Styling specifics:**
- 3px solid left border in --accent (light mode `#A8321F`, dark mode `#E8745B`).
- Background `--surface-2` (or `--accent-soft` on light mode for slight tint).
- Padding 18px 20px 18px 22px.
- Kicker label "WHY IT MATTERS" in JetBrains Mono 11px, letter-spacing 0.08em, --accent colour.
- Body in Newsreader Text 14px, italic, line-height 1.6, --ink-2 colour.
- Numbered enumerations like "(1) ... (2) ..." render inline (not as a list — preserves the dense practitioner-brief feel of the existing site).
- Inline italic case references (e.g. *Arun Ferreira (2021)*) preserved as-is via simple markdown rendering (`*text*` → `<em>`).

**Data shape (extends the Card story object):**
```ts
interface Story {
  // ...existing fields (headline, dek, source, url, publishedAt, etc.)
  whyItMatters?: string;   // 100–200 word practitioner brief
}
```

**Render behaviour:**
- Visible by default on Standard and Hero card variants.
- Hidden on List card variant (dense view).
- A small "Hide why-it-matters" toggle available in Settings → Reading preferences for users who want a leaner card.

**Generation:** lives in the workflow, not the client — see updated §8 below.

> **Why preserve this exactly:** The existing site's "Why It Matters" is the legal-counsel-specific value-add. Generic news aggregators don't offer it. Removing it during the Card refactor would gut the most distinctive feature of the product. Treat the visual styling above as a *floor* — improve typography, but don't reduce information density or change the practitioner-brief voice.

### 7.10 `ArticleNote.tsx` — Per-story user annotation

**This component also already exists on the live site and must be preserved.** The reader's own annotations are more valuable than any AI output.

**Visual (rendered inside each Card, below WhyItMatters, below the metadata row):**

```
┌──────────────────────────────────────────────────────────┐
│ YOUR NOTE                                    Saved ✓     │
│                                                          │
│ ┌────────────────────────────────────────────────────┐  │
│ │ Add a note — saved automatically...                │  │
│ │                                                    │  │
│ └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Styling specifics:**
- Kicker label "YOUR NOTE" in JetBrains Mono 11px, letter-spacing 0.08em, --ink-3 colour.
- Save indicator on the right of the kicker row: "Saved ✓" in JetBrains Mono 10px --ink-3 when persisted, or "Saving..." while debounced write is pending.
- Textarea with `border: 1px solid var(--rule)`, `border-radius: 8px`, padding 12px 14px, --surface background.
- Placeholder text: "Add a note — saved automatically..." in --ink-3.
- Body in Newsreader Text 14px, --ink colour.
- Auto-expands as content is added (use `auto-grow` via JS or `field-sizing: content` CSS property).

**Behaviour:**
- Persists to `localStorage` key `daily-brief:notes:<urlHash>` where urlHash is a deterministic hash of the article URL.
- Saves on every keystroke with 500ms debounce. Save indicator updates accordingly.
- Empty notes: render the textarea collapsed (single-line placeholder visible). On first click, expands.
- Notes persist across feed refreshes — the urlHash is the join key, not the story array index.
- Notes appear alongside their article in the Saved view (Phase 2.5) even if the original story has rotated off the feed.

**Data shape:**
```ts
// localStorage shape
type NotesStore = Record<string, {
  url: string;
  storyTitle: string;
  note: string;
  updatedAt: string; // ISO
}>;
```

**Defensive behaviour:**
- Before every write, the previous value is preserved in `daily-brief:notes-backup:<urlHash>` so a localStorage corruption issue doesn't lose the note silently.
- A "Export all notes" button in Settings exports the entire NotesStore as JSON for backup.

> **Why this is sacred data:** Per principle §2.12, the reader's notes are their *own thinking*. Losing a note is the worst possible failure mode in this app — far worse than a broken feed or a stale briefing. The debounced auto-save, the backup key, and the export option are all in service of "no lost notes, ever".

---

## 8. The GitHub Actions workflow

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
      - name: Generate per-story annotations
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: node scripts/generate-annotations.mjs
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

> **Why three refresh times (06:00, 12:00, 18:00 IST):** Morning brief at 06:00 lands before the workday. 12:00 catches mid-morning Indian market direction (NSE/BSE open 09:15, by noon there's enough movement to be informative). 18:00 catches London market mid-day, which moves the FX and commodity stories that affect retail. If the LLM cost feels excessive, dropping to just 06:00 still produces a usable product — but 12:00 and 18:00 are where the briefing earns its keep on a market-moving day.
>
> **Why JSON-in-the-repo as the data store:** No database, no server, no API to maintain. The data is versioned (git history), inspectable (any text editor), and the deploy is the data update. For a single-reader app, this is the lowest-maintenance architecture possible.

### Scripts

**`scripts/fetch-feeds.mjs`** — uses `rss-parser` to fetch every feed in `src/data/sources.json`, normalises into `src/data/feeds.json`, captures any fetch errors into `meta.feedHealth`.

**`scripts/generate-annotations.mjs`** — generates the per-story "Why It Matters" practitioner briefs. For each story in priority categories (Legal & Regulatory always; Business and Retail when the headline contains regulatory/policy keywords like "SEBI", "RBI", "CCI", "compliance", "regulation", "Act", "Bill", "Court", "ruling"), calls Claude Haiku 4.5 with a prompt focused on practitioner framing:

```
You are writing a "Why It Matters" brief for a senior in-house legal
counsel at an Indian retail company. The brief should be 100-180 words.

For each story, explain:
- The specific statute, regulation, or legal framework involved (with
  section numbers where applicable).
- Relevant case law or precedent (with citation, e.g. "Arun Ferreira (2021)").
- Numbered practical implications for the practitioner (use inline
  "(1) ... (2) ... (3) ..." style, not bullets).
- Why this matters for corporate compliance, regulatory risk, or counsel
  practice specifically.

Voice: precise, technical, present-tense, no hedging. Italicise case
names with asterisks. Output JSON: { "whyItMatters": "..." }.

Story: <title, dek, source, url>
```

Cache aggressively: if a story's URL already has a `whyItMatters` field in the previous feeds.json, reuse it — only generate for new stories. This keeps cost low even on multi-daily refreshes.

**`scripts/generate-briefing.mjs`** — picks the top 3 stories per priority category, calls Claude Haiku with a prompt like:

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

> **Why two separate scripts:** The briefing is a daily synthesis (1 LLM call). The annotations are per-story practitioner briefs (~10–20 LLM calls per refresh, but cached so only *new* stories pay). Separating them means the briefing always runs even if annotation generation hits an error, and each script can be skipped independently if the API key isn't present.

Cost estimate, Claude Haiku 4.5:
- Briefing: ~₹2–5 per run × ~90 runs/month ≈ **₹200–450/month**
- Annotations: ~10–15 new stories per refresh × ~$0.002 each × 90 refreshes ≈ **₹150–250/month**
- **Total LLM cost: roughly ₹350–700/month** for both features.

If the cost feels high, drop to one daily refresh (06:00 IST only) — total drops to ~₹120–250/month and the product still works.

**`scripts/update-meta.mjs`** — increments `editionNumber`, writes `lastRefreshIST` as a formatted string, records `feedHealth`.

The workflow runs these in sequence: fetch-feeds → generate-annotations → generate-briefing → update-meta → commit.

---

## 9. Phase 1 — Foundation (Weekend 1–2)

> **Why Phase 1 first, in this order:** The typographic system + design tokens + paper masthead together transform the feel of the product more than any other single change. Cards depend on the type system; the settings sheet depends on the theme tokens; the section headers depend on the categories file. The order is the dependency graph.
>
> **Existing features that must be preserved:** The live site already has (a) the "Why It Matters" per-story practitioner brief, (b) the "Your Note" per-story annotation textarea, and (c) the Papers PDF-extraction feature. All three must survive the Card refactor — preserve their data and their behaviour, and apply the new design tokens to their styling. Do NOT delete them. If unsure how something works in the current code, read it carefully first.

### Acceptance criteria
- [ ] Newsreader, Inter, JetBrains Mono load on first paint.
- [ ] `tokens.css` + Tailwind config wire up; `bg-canvas`, `text-ink`, `font-serif` all work.
- [ ] Dark mode toggles via `[data-theme="dark"]` on `<html>` and persists.
- [ ] Masthead renders date + edition number, sticky on scroll.
- [ ] Cards use kicker/headline/dek/source/time pattern; category colour applied to kicker.
- [ ] **Existing "Why It Matters" callout per story is preserved with new design-token styling per §7.9.**
- [ ] **Existing "Your Note" textarea per story is preserved with new styling per §7.10; all existing localStorage notes continue to work.**
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
5. Build `Card.tsx` (standard variant) + `lib/readingTime.ts`. **Include the existing "Why It Matters" and "Your Note" sub-components — read the current code first to understand how they work, then restyle them per §7.9 and §7.10.**
6. Build `SectionDeck.tsx` with the auto-fit grid.
7. Refactor any current page to use `Masthead + SectionDeck + Card` — **without losing any existing per-story data (notes, annotations, bookmarks)**.
8. Build `SettingsSheet.tsx`. Move PAT input and PDF upload into it.
9. Build `SectionHeader.tsx` with last-fetched + feed-health pills.
10. Add edition counter to `meta.json` (script + workflow).
11. QA across three viewports; fix overflow / spacing issues; verify existing notes still load.

---

## 10. Phase 2 — Newsroom (1–2 weeks)

> **Why Phase 2 comes second:** Phase 1 gave the product its *feel*. Phase 2 gives it its *intelligence* (the briefing), its *context* (markets, weather), and its *navigation* (tab bar, sidebar, search). These build on Phase 1 — the briefing needs the type system, the strips need the design tokens, the tab bar needs the routing. Doing them before Phase 1 would mean building twice.

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

## 11. Phase 3 — Delights (ongoing)

> **Why Phase 3 is a menu, not a sequence:** Each item is independent — they don't depend on each other and they don't all need to ship. Pick whichever feels missing after Phase 2 has lived for two weeks. If nothing feels missing, the product is done.

Pick from this list based on what feels missing after Phase 2 ships and gets used for two weeks:

- **Drag-to-reorder categories** (`dnd-kit`). *Why:* the default order in `categories.ts` will be wrong for some weeks — drag-to-reorder is the cheapest way to acknowledge that without preferences-paralysis.
- **Reading mode** (full-screen single-column article view, 68ch measure). *Why:* sometimes you want to *actually read* an article, not just scan it. A dedicated reading view removes every distraction.
- **Atkinson Hyperlegible dyslexia-friendly toggle.** *Why:* costs almost nothing to implement and dramatically helps anyone who needs it, including future-you on a tired evening.
- **A− / A / A+ font scale.** *Why:* iPad reading at arm's length wants a different size than phone reading at 20cm. User-controlled scale is the right answer.
- **Cloudflare Worker to hide the PAT** + proxy "Explain this" calls. *Why:* the PAT-in-browser pattern is fine for one user on trusted devices, but anyone with physical access to the laptop gets the PAT. Moving it to a Worker fixes that and unlocks the "Explain this" feature without exposing an LLM key.
- **Daily 07:00 IST email digest** (GitHub Action with mail-action or SendGrid free tier). *Why:* sometimes the inbox is the surface — a one-glance digest in the inbox catches the morning even when you don't open the app.
- **Pull-to-refresh on mobile/iPad.** *Why:* it's the gesture every reader's muscle memory expects.
- **Swipe-to-bookmark gesture.** *Why:* one-handed bookmarking on the train. Saves a touch-target visit.
- **Keyboard shortcut layer** (J/K/B/O/?/⌘K). *Why:* on the laptop, keyboard shortcuts collapse a 5-second mouse trip to a 200ms keystroke. Power-user reward for the user who lives in the product.
- **Per-article highlights + annotations.** *Why:* every legal counsel marks up everything. Letting the app catch a highlight + note saves a "remember to read this later" friction.
- **"Explain this" AI button per card.** *Why:* every now and then a headline references something you don't know — "what's a Section 197 disclosure?" — and the right answer is a paragraph of context, not a Google trip.
- **Bluebook / OSCOLA citation export for legal sources.** *Why:* legal counsel cite news sources constantly. Properly-formatted citations in one click is the kind of niche delight that makes a tool feel built-for-me.

---

## 12. Conventions for Claude Code

- **Read first, write second.** Always survey existing files in this repo before changing structure. Adapt the file paths in §4 to whatever already exists; don't move files unnecessarily.
- **One commit per task.** Each numbered task in §9 / §10 should be its own commit with a clear message.
- **Don't break the deploy.** GitHub Pages is the production target. Verify `npm run build` succeeds before pushing.
- **Mobile-first CSS.** Default styles target phones; use `@media (min-width: …)` to scale up, not down.
- **No new dependencies without asking.** The dependency list in §3 is final unless there's a strong reason to deviate.
- **TypeScript strict if possible.** If the repo is currently JS, don't migrate wholesale — add `.ts/.tsx` for new files only.
- **Accessibility is a release-blocker.** Every interactive element keyboard-reachable; visible focus states; `<time datetime>` for timestamps; `aria-label` on icon buttons.
- **Performance budget:** JS ≤ 200KB gzipped, CSS ≤ 60KB, fonts ≤ 80KB above-the-fold.
- **No browser storage other than `localStorage`/`sessionStorage`.** No IndexedDB unless explicitly needed.
- **Ask, don't assume.** If a spec detail is ambiguous, surface the question before writing code. Examples of "ask first": adding a new vertical, changing the colour system, introducing a routing library.

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
| **Claude Haiku — daily briefing** | **~₹200–450/month** |
| **Claude Haiku — per-story "Why It Matters" annotations** | **~₹150–250/month (cached, so only new stories pay)** |
| **Total** | **~₹350–700/month, all-in** |

The two LLM line items are the only non-zero costs. If they ever feel excessive:
- Drop to one daily refresh at 06:00 IST instead of three → ~₹120–250/month total.
- Or skip the annotations on multi-daily refreshes (generate them only on the 06:00 run) → ~₹250–500/month.
- Or stop generating annotations for the Tech/World categories → another ~30% reduction.

The annotations cache aggressively — once a story has a `whyItMatters` field, subsequent refreshes reuse it. So the ongoing cost scales with *new stories per day*, not total stories.

---

*End of spec. Phase 1 first.*
