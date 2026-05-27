# Phase 1 Readiness Audit — v2

**Date:** 27 May 2026  
**Branch:** `audit/phase1-v2`  
**Spec:** `IMPLEMENTATION_SPEC.md` (§4 target file structure · §9 Phase 1 acceptance criteria · §7.9–7.10 preserved features)  
**Purpose:** Reflect the current React implementation (PRs #6–#10), identify remaining Phase 1 gaps, establish a "do not break" checklist for existing features, and define the remaining PRs needed to reach the §9 acceptance bar.

---

## (a) Current File Inventory

### Root-level legacy files (untouched by React migration)

| File | Size | Role |
|---|---|---|
| `index.html` | 29 KB | Legacy SPA shell — all HTML markup, inline modals (PDF import, settings). Still served as the Vite entry point; Google Fonts `<link>` tags added here in PR #6. |
| `app.js` | 44 KB | All legacy client-side logic: data loading, card rendering, tabs, PDF import, settings, PAT workflow trigger. Still active — React does not yet cover all features. |
| `styles.css` | 26 KB | Legacy styles — kept as the offline fallback stylesheet. Superseded by React/Tailwind for live use. |
| `sw.js` | 2.6 KB | Service worker — cache-first app shell, network-first for `stories.json`, cache v4. |
| `stories.json` | 162 KB | Live content from daily workflow. Shape: `{ editionDate, heroStoryId, sections: Record<CategoryKey, Story[]> }`. |
| `stories.fallback.json` | 368 B | Static fallback displayed when network request fails. |
| `story-schema.json` | 3.5 KB | JSON Schema for story objects. |
| `fetch_stories.py` | 36 KB | Python RSS pipeline — updated in PR #7 to emit `publishedAt` (ISO 8601) and `wordCount` per story. |
| `process_papers.py` | 11 KB | Python newspaper processor — reads `papers/pending/*.txt`, AI-enriches, writes `paper_stories.json`. |
| `manifest.json` | 466 B | PWA manifest. |
| `favicon.svg`, `icon-192.png`, `icon-512.png` | — | PWA icons. |
| `_headers` | 99 B | CDN/Netlify response headers. |
| `AUTOMATION.md` | 1.6 KB | Operator documentation. |

### React source tree (`src/`) — built in PRs #6–#9

| Path | Status | Notes |
|---|---|---|
| `src/main.tsx` | ✅ | React 18 root, imports `global.css`, mounts `<App />` |
| `src/App.tsx` | ✅ | Fetches `stories.json` + `meta.json`, renders Masthead + 8 SectionDecks (inline grid, not SectionDeck component), bookmark state in `useState` |
| `src/vite-env.d.ts` | ✅ | `/// <reference types="vite/client" />` — required for CSS module imports |
| `src/components/cards/Card.tsx` | ✅ | Standard / hero / list variants, kicker, headline, hook, contextNote aside, source, time, bookmark, reading time |
| `src/components/cards/SkeletonCard.tsx` | ✅ | Shimmer placeholder |
| `src/components/layout/Masthead.tsx` | ✅ | Wordmark, IST date, edition number from meta.json, theme/settings/search icons, IntersectionObserver compact mode |
| `src/hooks/useTheme.ts` | ✅ | `'light' \| 'dark' \| 'auto'` → `localStorage['daily-brief:theme']` → `data-theme` on `<html>` |
| `src/lib/categories.ts` | ✅ | 8 categories including `reliance` — **deviation from spec's 7, intentional** |
| `src/lib/dateFormat.ts` | ✅ | `relativeTime()`, `formatTimeIST()` — IST-aware |
| `src/lib/readingTime.ts` | ✅ | `Math.ceil(wordCount / 225)` |
| `src/lib/types.ts` | ✅ | `Story`, `FeedsPayload`, `MetaJson`, `SourceEntry`, `BriefingJson`, `BriefingBullet` |
| `src/data/meta.json` | ✅ | Seed: `{ "editionNumber": 1, "lastRefreshIST": "", "feedHealth": {} }` |
| `src/data/sources.json` | ✅ | 50 feed entries extracted from `fetch_stories.py` |
| `src/styles/tokens.css` | ✅ | Full `:root` and `[data-theme="dark"]` blocks per §5 |
| `src/styles/type.css` | ✅ | Type-scale utility classes (`text-step--1` through `text-step-5`) |
| `src/styles/global.css` | ✅ | `@import "tailwindcss"`, `@import "./tokens.css"`, `@import "./type.css"`, `@theme inline`, `@custom-variant dark` |

### GitHub Actions workflows

| File | Trigger | Purpose |
|---|---|---|
| `.github/workflows/daily-update.yml` | cron 00:30 UTC + dispatch | Runs `fetch_stories.py`, validates `stories.json`, commits |
| `.github/workflows/process-papers.yml` | dispatch only | Runs `process_papers.py`, commits `paper_stories.json` |
| `.github/workflows/deploy.yml` | push to `main` | `npm ci && npm run build`, copies `stories.json` + `sw.js` + icons to `dist/`, deploys via `actions/deploy-pages` |

### §4 target paths — NOT YET CREATED

The following paths from the spec's §4 file structure still need to be created in Phase 1:

`src/components/layout/SettingsSheet.tsx` · `src/components/layout/TabBar.tsx` · `src/components/layout/Sidebar.tsx` · `src/components/layout/ScrollToTop.tsx` · `src/components/sections/SectionDeck.tsx` · `src/components/sections/SectionHeader.tsx` · `src/components/cards/WhyItMatters.tsx` ¹ · `src/components/cards/ArticleNote.tsx` ¹ · `src/hooks/useFeeds.ts` · `src/hooks/useBookmarks.ts` · `src/hooks/useDensity.ts` · `scripts/update-meta.mjs`

> ¹ §7.9 and §7.10 name `WhyItMatters.tsx` and `ArticleNote.tsx` as dedicated components. Currently `contextNote` is rendered inline in `Card.tsx`. `ArticleNote.tsx` does not exist in React at all yet — see section (c).

---

## (b) Gap Analysis

### vs §4 — Target file structure

**Phase 1 scope only** (Phase 2+ components like `TabBar`, `Sidebar`, `WeatherStrip`, `MarketsTicker`, `BriefingOfTheDay`, `CommandPalette`, `useWeather`, `useMarkets`, `useKeyboardShortcuts`, `briefing.json`, and Node scripts are out of scope for Phase 1):

| §4 target | Status |
|---|---|
| `src/components/layout/Masthead.tsx` | ✅ Built (PR #8) |
| `src/components/layout/SettingsSheet.tsx` | ❌ Missing |
| `src/components/layout/ScrollToTop.tsx` | ❌ Missing |
| `src/components/cards/Card.tsx` | ✅ Built (PR #9) |
| `src/components/cards/SkeletonCard.tsx` | ✅ Built (PR #9) |
| `src/components/cards/HeroCard.tsx` | ⚠️ Covered by `variant="hero"` in Card.tsx — see deviation (e.2) |
| `src/components/cards/ListRow.tsx` | ⚠️ Covered by `variant="list"` in Card.tsx — see deviation (e.2) |
| `src/components/sections/SectionDeck.tsx` | ❌ Missing — App.tsx renders the grid inline |
| `src/components/sections/SectionHeader.tsx` | ❌ Missing — no "Last fetched · X/Y sources OK" header |
| `src/hooks/useFeeds.ts` | ❌ Missing — fetching is inline in App.tsx |
| `src/hooks/useBookmarks.ts` | ❌ Missing — bookmark state is inline useState in App.tsx |
| `src/hooks/useDensity.ts` | ❌ Missing |
| `src/hooks/useTheme.ts` | ✅ Built (PR #8) |
| `src/data/meta.json` | ✅ Seed in place (PR #7); not yet written by workflow |
| `src/data/sources.json` | ✅ Built (PR #7) |
| `src/styles/tokens.css` | ✅ Built (PR #6) |
| `src/styles/type.css` | ✅ Built (PR #6) |
| `src/styles/global.css` | ✅ Built (PR #6) |
| `src/lib/readingTime.ts` | ✅ Built (PR #9) |
| `src/lib/dateFormat.ts` | ✅ Built (PR #9) |
| `src/lib/categories.ts` | ✅ Built (PR #9) |
| `src/App.tsx` | ✅ Built (PR #9) |
| `src/main.tsx` | ✅ Built (PR #6) |
| `scripts/update-meta.mjs` | ❌ Missing — edition counter not yet workflow-automated |

### vs §9 — Phase 1 Acceptance Criteria

| Criterion | Status | Detail |
|---|---|---|
| Newsreader, Inter, JetBrains Mono load on first paint | ✅ | Google Fonts `<link>` in `index.html` since PR #6 |
| `tokens.css` + Tailwind; `bg-canvas`, `text-ink`, `font-serif` work | ✅ | PR #6 — Tailwind v4 `@theme inline` maps all CSS vars |
| Dark mode via `[data-theme="dark"]` on `<html>`, persists | ✅ | `useTheme.ts` since PR #8 |
| Masthead renders date + edition number, sticky on scroll | ✅ | PR #8 — edition number from `meta.json` (shows "1" until workflow runs) |
| Cards: kicker / headline / dek / source / time / category colour | ✅ | PR #9 — all fields rendered |
| **Existing "Why It Matters" preserved per §7.9** | ✅ | PR #10 — contextNote `<aside>` in Card.tsx |
| **Existing "Your Note" textarea preserved per §7.10** | ❌ | **Not implemented in React.** See section (c). |
| Reading time per card (Math.ceil(words/225)) | ✅ | PR #9 — `readingTime.ts` + `wordCount` from PR #7 data layer |
| Settings sheet: theme, density, home city, PAT, PDF upload | ❌ | No SettingsSheet — gear icon in Masthead does nothing yet |
| Section header: "Last fetched · X/Y sources OK" | ❌ | No SectionHeader component |
| Correct at 375px, 768px, 1280px | ⚠️ | Auto-fit grid deployed; not formally tested at spec viewports |
| Lighthouse mobile ≥ 90 | ❌ | Not measured |

**Score: 7 pass, 2 partial, 3 fail.** The three failing criteria are `ArticleNote`, `SettingsSheet`, and `SectionHeader`. The two partials need viewport QA and Lighthouse CI.

---

## (c) "Do Not Break" Checklist — Existing Feature Inventory

These features exist on the live site and must survive every future Phase 1 PR without data loss or regression.

---

### C.1 "Why It Matters" — per-story practitioner brief (spec §7.9)

**Current implementation:** React `Card.tsx` (PR #10), lines 114–131.

```tsx
{contextNote && (
  <aside
    className="rounded-lg px-4 py-3 text-step--1 font-sans leading-relaxed"
    style={{
      background: `color-mix(in srgb, var(${cat.colorVar}) 8%, var(--surface-2))`,
      borderLeft: `3px solid var(${cat.colorVar})`,
      color: 'var(--ink-2)',
    }}
  >
    <span className="type-kicker block mb-1" style={{ color: `var(${cat.colorVar})` }}>
      Why it matters
    </span>
    {contextNote}
  </aside>
)}
```

**Data shape:** `story.contextNote?: string` in `src/lib/types.ts`.

**Rendered on:** Standard and Hero variants. Hidden on List variant (correct per §7.9).

**What must not change:** The `contextNote` field name in `Story`, the `aside` rendering in Card.tsx, and the category-tinted background. Spec §7.9 calls for a separate `WhyItMatters.tsx` component — extraction is recommended (see section d) but must not change the rendered output.

**Generation source:** `fetch_stories.py` calls Claude Haiku for legal/business/retail stories. Caches in `stories.json`. React reads it from there.

---

### C.2 "Your Note" — per-story annotation textarea (spec §7.10)

**Current implementation:** `app.js` only. **NOT yet in React.**

```js
const STORAGE_PREFIX = "dailybrief:";  // note: no hyphen

function noteKey(storyId) { return STORAGE_PREFIX + "note:" + storyId; }
function saveNote(storyId, text) {
  if (!text) storageRemove(noteKey(storyId));
  else storageSet(noteKey(storyId), text);
}
function loadNote(storyId) { return storageGet(noteKey(storyId)) || ""; }

// In createStoryMarkup():
<textarea class="story-note" placeholder="Add a note — saved automatically…">${loadNote(story.id)}</textarea>

// In initStoryInteractions():
textarea.addEventListener("input", () => saveNote(storyId, textarea.value));
```

**Old localStorage key:** `dailybrief:note:{storyId}` (keyed by story ID, prefix without hyphen).

**New spec (§7.10) key:** `daily-brief:notes:<urlHash>` (keyed by URL hash, prefix with hyphen).

**⚠️ KEY CONFLICT:** Old keys will not be found by any React implementation that uses the new key format. A one-time migration function must run on app init to copy `dailybrief:note:*` entries to the new `daily-brief:notes:*` format.

**What must be implemented in React:**
- `src/components/cards/ArticleNote.tsx` — textarea, "YOUR NOTE" kicker, save indicator ("Saved ✓" / "Saving…"), 500ms debounce, auto-expand.
- `src/hooks/useNotes.ts` (or inline in ArticleNote) — reads/writes `daily-brief:notes:<urlHash>`; backup key `daily-brief:notes-backup:<urlHash>`.
- Migration layer in `src/App.tsx` or `src/lib/migrateStorage.ts` — scans for `dailybrief:note:*` keys, copies them to `daily-brief:notes:*` format.
- Empty state: collapsed single-line textarea. Expands on first click.
- Spec visibility: shown on Standard and Hero variants; hidden on List variant.

---

### C.3 Bookmarks

**Current implementation (app.js):**
- Key: `dailybrief:bookmark:{storyId}` — one key per bookmarked story, value `"1"`.
- Reads all bookmarks by iterating `localStorage` keys with prefix `dailybrief:bookmark:`.

**Current implementation (React App.tsx):**
- Key: `daily-brief:bookmarks` — a JSON array of story IDs.
- **⚠️ FORMAT CONFLICT:** Bookmarks saved in app.js (individual keys) will not appear in the React bookmark list (JSON array), and vice versa.

**What must be done:**
- Migration on app init: scan `localStorage` for `dailybrief:bookmark:*` keys, add matching IDs to the `daily-brief:bookmarks` array.
- Or accept that legacy bookmarks are lost (user must re-bookmark). This is a policy decision — recommend migration since bookmarks represent user intent.

---

### C.4 Theme preference

| | Old (app.js) | New (React useTheme.ts) |
|---|---|---|
| Key | `dailybrief:theme` | `daily-brief:theme` |
| Values | `"light"`, `"dark"` | `"light"`, `"dark"`, `"auto"` |

**⚠️ KEY CONFLICT:** If the user had a theme preference saved under the old key, it won't be read by React. The app will default to `"auto"`.

**What must be done:** Migration on app init: if `daily-brief:theme` is absent but `dailybrief:theme` is present, copy it over.

---

### C.5 Papers PDF extraction

**Current implementation:** `app.js` `initPdfImport()` + vanilla HTML modal (`#pdf-overlay` in `index.html`).

**Storage key:** `daily-brief:papers` — array of paper story objects.

**Flow:**
1. User selects PDF in `<input type="file">`.
2. pdf.js (CDN, version 3.11.174) extracts text client-side.
3. Text is chunked and uploaded to GitHub Contents API at `papers/pending/{filename}`.
4. `process-papers.yml` workflow is dispatched.
5. After processing, `paper_stories.json` is committed and the Papers tab renders the stories.

**⚠️ NOT IN REACT:** The PDF import UI, the pdf.js loading, and the PAT-authenticated upload are all in `app.js`. The SettingsSheet.tsx (to be built) must include a "Import PDF newspaper" entry point per §9 acceptance criterion and §7.8.

**Key preserved items:**
- `daily-brief:papers` localStorage key and its data shape.
- The upload path `papers/pending/` and the `process-papers.yml` dispatch.
- Client-side text extraction (privacy-preserving, no upload of the PDF file).

---

### C.6 PAT workflow dispatch

**Current implementation:** `app.js` `triggerWorkflow(pat)`.

```js
const SETTINGS_KEY = "daily-brief:settings";  // { pat: string }

async function triggerWorkflow(pat) {
  const res = await fetch(
    "https://api.github.com/repos/problemchild02/daily-brief/actions/workflows/daily-update.yml/dispatches",
    { method: "POST", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main" }) }
  );
  return res.status === 204;
}
```

**Storage key:** `daily-brief:settings` → `{ pat: string }` (already uses the correct hyphen prefix — **no conflict**).

**What must be done:** Migrate `triggerWorkflow` into `src/lib/githubWorkflow.ts` and expose it from `SettingsSheet.tsx`.

---

### C.7 localStorage key reference table

| Key | Owner | Format | Migration needed? |
|---|---|---|---|
| `dailybrief:theme` | app.js | `"light"` \| `"dark"` | ✅ Copy to `daily-brief:theme` on first React load |
| `daily-brief:theme` | useTheme.ts | `"light"` \| `"dark"` \| `"auto"` | — |
| `dailybrief:note:{storyId}` | app.js | Plain text string | ✅ Copy to `daily-brief:notes:<urlHash>` on first React load |
| `daily-brief:notes:<urlHash>` | ArticleNote.tsx (to build) | `{ url, storyTitle, note, updatedAt }` JSON | — |
| `daily-brief:notes-backup:<urlHash>` | ArticleNote.tsx (to build) | Same as above | — |
| `dailybrief:bookmark:{storyId}` | app.js | `"1"` | ✅ Merge into `daily-brief:bookmarks` array |
| `daily-brief:bookmarks` | App.tsx | JSON array of story IDs | — |
| `daily-brief:settings` | app.js / SettingsSheet (to build) | `{ pat: string }` | No conflict — already correct prefix |
| `daily-brief:papers` | app.js | Array of paper story objects | No conflict — keep as-is |
| `daily-brief:home-city` | useTheme.ts (future) | `"Mumbai"` \| `"Noida"` | — |
| `daily-brief:density` | useDensity.ts (to build) | `"comfortable"` \| `"compact"` \| `"dense"` | — |

**Migration strategy:** A single `migrateStorage()` function in `src/lib/migrateStorage.ts` runs once on app init (guarded by a `daily-brief:migrated` flag). It handles all key copies/transforms in one place. Call it at the top of `App.tsx` before any hook reads localStorage.

---

## (d) Remaining Phase 1 Execution Plan

PRs #6 (bootstrap + tokens), #7 (data layer), #8 (Masthead), #9 (Card), and #10 (contextNote fix) have landed or are open. The following PRs complete Phase 1. Each is independently deployable; none leaves the site broken.

---

### PR 1.5 — `SectionDeck.tsx` + `SectionHeader.tsx`

**Goal:** Extract the inline grid in App.tsx into a dedicated SectionDeck component with a proper section header showing feed health.

**Scope:**
- `src/components/sections/SectionHeader.tsx` — renders category label in category colour + `"Last fetched: <relative time> · X/Y sources OK"` in mono, with a warning icon if any source failed. Accepts `category`, `lastRefresh` (ISO string), `feedHealth` object.
- `src/components/sections/SectionDeck.tsx` — wraps `SectionHeader` + `auto-fit minmax(320px, 1fr)` grid of `Card` components. Handles empty state ("Nothing new in this section") and `isLoading` skeleton state.
- Refactor `App.tsx` to use `SectionDeck` instead of the inline map.

**Preserving existing features:** No Card changes in this PR. The `contextNote` aside in Card.tsx is untouched.

**Acceptance:** Every section renders with a header showing last-refresh time; empty-state message appears for sections with no stories; skeleton shows during load.

---

### PR 1.6 — `ArticleNote.tsx` + `useNotes` + `migrateStorage`

**Goal:** The "Your Note" textarea is live in React, existing notes are not lost, and all §7.10 requirements are met.

**Scope:**
- `src/lib/migrateStorage.ts` — `migrateStorage()` runs once on app init. Migrates:
  - `dailybrief:theme` → `daily-brief:theme`
  - `dailybrief:bookmark:{id}` → entries in `daily-brief:bookmarks` JSON array
  - `dailybrief:note:{id}` → `daily-brief:notes:<urlHash>` (compute URL hash from `story.sourceUrl`)
  - Sets `daily-brief:migrated: "1"` flag when done.
- `src/hooks/useNotes.ts` — `useNote(storyId: string, sourceUrl: string)` returns `{ note, setNote, saveStatus }`. Writes `daily-brief:notes:<urlHash>` with 500ms debounce; backs up to `daily-brief:notes-backup:<urlHash>` before each write.
- `src/components/cards/ArticleNote.tsx` — "YOUR NOTE" kicker row with save indicator, auto-expanding textarea, `border-rule` border, `--surface` background, Newsreader Text 14px body.
- Wire `ArticleNote` into `Card.tsx` below the contextNote aside, visible on Standard and Hero variants, hidden on List variant.
- Call `migrateStorage()` in `App.tsx` before hooks initialise.

**Preserving existing features:** This PR only adds; it does not remove or restructure any existing Card content.

**Acceptance:** Notes save on keystroke (debounced 500ms); "Saved ✓" indicator appears after save; notes survive page reload; notes saved in old app.js format migrate correctly; empty textarea collapses to single line.

---

### PR 1.7 — `SettingsSheet.tsx` + `useDensity` + PAT/PDF migration

**Goal:** All settings live in one sheet behind the gear icon; PAT input and PDF import are removed from `index.html` modals.

**Scope:**
- `src/components/layout/SettingsSheet.tsx` — slide-up sheet (mobile) / dialog (desktop) using shadcn `Sheet`/`Dialog`. Sections: Theme (Auto/Light/Dark), Density (Comfortable/Compact/Dense), Home City (Mumbai/Noida), Font Size (A− / A / A+), GitHub PAT + "Run workflow now" button, "Import PDF newspaper" entry.
- `src/hooks/useDensity.ts` — reads/writes `daily-brief:density`; applies `data-density` on `<html>`.
- `src/lib/githubWorkflow.ts` — migrated `triggerWorkflow()` from `app.js`, typed with the `daily-brief:settings` PAT key.
- `src/components/papers/PdfImportSheet.tsx` — migrated PDF import flow from `app.js` (pdf.js CDN, text extraction, GitHub Contents API upload, `process-papers.yml` dispatch). Preserves `daily-brief:papers` key and upload path `papers/pending/`.
- Wire gear icon in `Masthead.tsx` to open `SettingsSheet`.

**Preserving existing features:** The PAT value stored at `daily-brief:settings` survives unchanged. The PDF upload flow uses the same endpoints and key.

**Acceptance:** Gear opens sheet; theme + density changes apply immediately; existing PAT in `daily-brief:settings` is pre-populated in the input; "Run workflow now" dispatches successfully; PDF import still works end-to-end.

---

### PR 1.8 — `useBookmarks.ts` + bookmark migration + `useFeeds.ts` extraction

**Goal:** Bookmarks are a proper hook, the bookmark migration from app.js format runs, and feed loading is extracted from App.tsx into `useFeeds`.

**Scope:**
- `src/hooks/useBookmarks.ts` — `{ bookmarks: Set<string>, toggle, isBookmarked }`. Reads/writes `daily-brief:bookmarks` JSON array. Works alongside `migrateStorage` which already merges old `dailybrief:bookmark:*` keys.
- `src/hooks/useFeeds.ts` — wraps the `fetch(BASE + 'stories.json')` + `fetch(BASE + 'src/data/meta.json')` calls currently inline in App.tsx. Returns `{ feeds, meta, loading, error }`.
- Refactor `App.tsx` to use both hooks; remove inline state and fetch logic.

**Preserving existing features:** Bookmarks already migrated by PR 1.6's `migrateStorage`. This PR just extracts the hook pattern.

**Acceptance:** Bookmarks persist across reload; app.js-era bookmarks appear in the React UI after migration; `useFeeds` returns typed data; no inline fetch in App.tsx.

---

### PR 1.9 — `scripts/update-meta.mjs` + workflow integration

**Goal:** `meta.json` is auto-incremented on every workflow run so the Masthead shows a real edition number and SectionHeader shows accurate feed health.

**Scope:**
- `scripts/update-meta.mjs` — reads `src/data/meta.json`, increments `editionNumber`, writes `lastRefreshIST` in IST format, copies `feedHealth` from a sidecar `feed-health.json` written by `fetch_stories.py`.
- Update `fetch_stories.py` to emit `feed-health.json` with `{ ok, total, byFeed: { feedName: "ok"|"error" } }`.
- Update `.github/workflows/daily-update.yml` to run `node scripts/update-meta.mjs` after the Python fetch step, `git add src/data/meta.json`, and commit.

**Acceptance:** After next workflow run, `meta.json` has `editionNumber > 1` and `lastRefreshIST` non-empty; Masthead displays the edition number; SectionHeader shows `X/Y sources OK`.

---

### PR 1.10 — `WhyItMatters.tsx` extraction + `ScrollToTop.tsx`

**Goal:** Extract the contextNote aside from Card.tsx into its own component per §7.9, add a floating scroll-to-top button.

**Scope:**
- `src/components/cards/WhyItMatters.tsx` — extracts the existing `<aside>` block from Card.tsx. Props: `text: string`, `category: CategoryKey`. Renders identically to current code.
- Update `Card.tsx` to use `<WhyItMatters text={contextNote} category={category} />`.
- `src/components/layout/ScrollToTop.tsx` — floating button after 500px scroll; `window.scrollTo({ top: 0, behavior: 'smooth' })`.

**Preserving existing features:** Extraction only — no visual or data changes to the contextNote output.

**Acceptance:** Rendered output of `WhyItMatters` matches previous Card output pixel-for-pixel; scroll-to-top button appears and functions correctly.

---

### PR 1.11 — QA pass: viewports, accessibility, Lighthouse ≥ 90

**Goal:** All ten Phase 1 acceptance criteria are green.

**Scope:**
- Fix overflow / spacing regressions at 375px (iPhone 13 mini), 768px (iPad portrait), 1280px (laptop).
- Audit all interactive elements for keyboard reachability and `focus-visible` ring.
- Confirm `aria-label` on all icon-only buttons (theme toggle, gear, search, bookmark, scroll-to-top).
- Confirm `<time datetime="{iso}">` on every timestamp.
- Confirm `env(safe-area-inset-bottom)` guard in Masthead footer area.
- Verify JS bundle ≤ 200 KB gzipped, CSS ≤ 60 KB.
- Add Lighthouse CI step to `deploy.yml` failing the build if mobile score < 90.
- Run axe-core scan; fix any critical violations.

**Acceptance:** Lighthouse Mobile ≥ 90 on CI; manual checks at three viewports pass; zero critical a11y violations.

---

### PR summary table

| PR | Title | Key new files | Existing features preserved |
|---|---|---|---|
| #10 (open) | contextNote fix | — | Adds `contextNote` aside to Card |
| 1.5 | SectionDeck + SectionHeader | `SectionDeck.tsx`, `SectionHeader.tsx` | No Card changes |
| 1.6 | ArticleNote + migrateStorage | `ArticleNote.tsx`, `useNotes.ts`, `migrateStorage.ts` | Migrates old note/bookmark/theme keys |
| 1.7 | SettingsSheet + useDensity + PAT/PDF | `SettingsSheet.tsx`, `useDensity.ts`, `githubWorkflow.ts`, `PdfImportSheet.tsx` | PAT key unchanged; PDF upload path unchanged |
| 1.8 | useBookmarks + useFeeds extraction | `useBookmarks.ts`, `useFeeds.ts` | Bookmarks migrated in 1.6; this PR only adds hooks |
| 1.9 | Edition counter + meta.json workflow | `scripts/update-meta.mjs` | No frontend changes |
| 1.10 | WhyItMatters extraction + ScrollToTop | `WhyItMatters.tsx`, `ScrollToTop.tsx` | Extraction only — output unchanged |
| 1.11 | QA + Lighthouse | — | Bug fixes only |

---

## (e) Recommended Deviations from Spec

### e.1 `reliance` as an eighth category

**Spec §6** defines 7 categories. The codebase (PR #9) adds `reliance` as an eighth, with its own colour `--cat-reliance: #6B1A5C` and order 3.

**Recommendation: Keep it.** The reader explicitly tracks Reliance Industries / Jio as a primary beat. Removing it would require merging those stories into another section and losing the dedicated feed health tracking. The spec's §12 instructs deviating when there's a good reason.

**Action required:** Acknowledge the deviation; do not attempt to remove `reliance` during Phase 1. Propose adding it to §6 in a future spec update.

---

### e.2 Card variants instead of separate HeroCard/ListRow files

**Spec §4** lists `HeroCard.tsx` and `ListRow.tsx` as separate files. The current implementation uses `variant="hero"` and `variant="list"` props on a single `Card.tsx`.

**Recommendation: Keep the single-file approach.** All three variants share ~70% of their structure (kicker, headline, source, time, bookmark). Separate files would mean duplicating that structure or introducing a third shared component. The variant prop pattern is idiomatic React and easier to maintain. The external API is the same.

**No action required.** The spec notes "adapt paths to whatever exists today — but converge on this structure as you go" (§12).

---

### e.3 Tailwind v4 `@theme inline` instead of `tailwind.config.js`

**Spec §5** shows a `tailwind.config.js` with `theme.extend.colors`. Tailwind v4 (the installed version) replaced this with `@theme inline` inside CSS. The current `global.css` uses the v4 approach.

**Recommendation: Keep v4 approach.** `tailwind.config.js` is not recognised by Tailwind v4. Using it would break the build. The `@theme inline` block in `global.css` is the canonical v4 equivalent and produces identical utility class names.

**No action required.**

---

### e.4 ArticleNote key uses URL hash, not story ID

**Spec §7.10** specifies `daily-brief:notes:<urlHash>` keyed by a hash of the article URL, not the story's `id` field.

**Old app.js** keys by `storyId` (the `id` field from `stories.json`).

**Recommendation: Use URL hash for new React notes, but migrate old entries by story ID → URL.** The URL is a more stable join key than `storyId` — story IDs can change if the workflow re-generates IDs. The migration in `migrateStorage.ts` will read the current `stories.json` to look up `sourceUrl` for each `storyId` found in old note keys, then compute the URL hash.

**Action required:** In PR 1.6, the `migrateStorage` function must load `stories.json` (or the in-memory feeds) to resolve storyId → sourceUrl before writing new-format keys.

---

### e.5 `WhyItMatters` uses category colour for border/background (not `--accent`)

**Spec §7.9** says the left border should be `--accent` (red). The existing Card.tsx implementation (PR #10) uses `var(${cat.colorVar})` — the category colour — for both the border and tinted background.

**Recommendation: Keep category colour.** Using `--accent` (red) for every card's "Why It Matters" border would make the aside look like an error callout and remove the category association. Category colour is more visually coherent and matches the kicker colour already used above the headline. This aligns with the spec's §2.4 principle: "category colour is signage."

**Action required:** In PR 1.10 when extracting `WhyItMatters.tsx`, preserve the category-colour border. Note the deviation in the PR description.

---

*End of Phase 1 Readiness Audit v2. Phase 1 is ~60% complete. The critical remaining work is `ArticleNote` (the most user-data-sensitive PR) and `SettingsSheet` (the PAT/PDF feature gate). Those two PRs should be reviewed most carefully. Proceed to PR 1.5 to start.*
