# Changelog

All notable changes to the Daily Brief React migration are recorded here.

## [Phase 2 M3] — 2026-05-28

### Added
- **`src/lib/urlHash.ts`** — djb2-style URL hash used as stable bookmark key across feed refreshes
- **`src/hooks/useBookmarks.ts`** — URL-hash-keyed bookmark store (`Record<urlHash, BookmarkMeta>`) persisted to `daily-brief:bookmarks`; old array format auto-discarded; `BookmarkMeta` carries `savedAt` ISO timestamp for time-bucket grouping
- **`src/components/cards/ListRow.tsx`** — standalone list-variant story row (52 px); category kicker, headline, source · time, external link, bookmark toggle
- **`src/components/briefing/BriefingSkeleton.tsx`** — exact-height briefing loading skeleton (title + 2-line summary + 5 category-dot bullets)
- **`src/components/cards/SkeletonCard.tsx`** — added `SkeletonListRow` export for list-mode loading state; improved card placeholder heights to match real Card
- **Print / Export to PDF** — `@media print` rules in `global.css` (18 mm `@page` margins, 11 pt Newsreader body, single-column grid override, `page-break-after` on sections, `page-break-inside: avoid` on articles); "Export to PDF" button in `SettingsSheet` calling `window.print()`

### Changed
- **`src/contexts/AppContext.tsx`** — extended with `feedsError`, `retryFeeds`, `density`, `bookmarksList`, `isBookmarked`, `toggleBookmark`
- **`src/App.tsx`** — wires `useBookmarks()` and `useDensity()` into context; adds `feedsError` / `fetchKey` retry pattern; wraps Masthead + info strip in `print:hidden`
- **`src/components/sections/SectionDeck.tsx`** — reads bookmarks and density from context (props removed); density-driven default view mode (`dense` → list); per-section grid/list toggle; list view renders `ListRow` stack; error state with inline Retry button
- **`src/components/sections/SectionHeader.tsx`** — added `viewMode` + `onToggleView` props; grid/list toggle button (LayoutGrid / List icons)
- **`src/components/briefing/BriefingOfTheDay.tsx`** — replaced inline loading skeleton with `<BriefingSkeleton />`
- **`src/pages/FrontPage.tsx`** — removed `bookmarks` / `onBookmark` props from `SectionDeck` calls (context-driven)
- **`src/pages/SectionPage.tsx`** — same as FrontPage
- **`src/pages/SavedPage.tsx`** — rewritten to group bookmarks by Today / This week / Earlier this month / Older using `BookmarkMeta.savedAt`; no longer depends on live `feeds` data
- **`src/components/layout/Sidebar.tsx`** — added `print:hidden`
- **`src/components/layout/TabBar.tsx`** — added `print:hidden`
- **`src/components/layout/SettingsSheet.tsx`** — added Export section with "Export to PDF" button; imports `Printer` from lucide-react

## [Phase 1.4] — 2026-05-27

### Added
- **`SettingsSheet.tsx`** — slide-up sheet (mobile) / centred dialog (desktop) with:
  - Theme selector: Auto / Light / Dark
  - Density selector: Comfortable / Compact / Dense
  - Home city selector: Mumbai / Noida (stored as `daily-brief:home-city`)
  - GitHub PAT input with show/hide toggle and legacy key migration (`daily-brief:settings` → `daily-brief:gh-pat`)
  - "Run workflow now" button with live loading / success / error feedback
  - PDF upload entry point for Papers feature
- **`SectionHeader.tsx`** — per-section header showing category label, global feed-health summary (N/M sources), and last-refresh relative time
- **`useDensity.ts`** hook — reads / writes `daily-brief:density`; applies `data-density` attribute to `<html>` immediately on mount
- **`githubWorkflow.ts`** — `readPat`, `writePat`, `dispatchWorkflow` utilities; migrates legacy `daily-brief:settings` PAT on first read
- **`scripts/update-meta.mjs`** — Node.js ESM script that increments `editionNumber`, stamps `lastRefreshIST` / `lastRefreshISO`, and marks all source displayNames as `{ status: 'ok', lastSuccess }` in `feedHealth`
- **`FeedHealthEntry`** type in `types.ts`; `MetaJson.feedHealth` now accepts both the new `FeedHealthEntry` shape and the legacy `'ok' | 'error'` string for backward compatibility

### Changed
- **`SectionDeck.tsx`** — delegates header rendering to `SectionHeader`; accepts `feedHealth` and `lastRefreshISO` props
- **`App.tsx`** — calls `useDensity()` at app root; passes `feedHealth` / `lastRefreshISO` from meta to each `SectionDeck`; wires gear icon in `Masthead` to open `SettingsSheet`
- **`MetaJson`** — added `lastRefreshISO?: string` field
- **`src/data/meta.json`** — added `lastRefreshISO` field (initially empty)
- **`.github/workflows/daily-update.yml`** — added Node.js 20 setup step; added `node scripts/update-meta.mjs` step after `fetch_stories.py`; added `src/data/meta.json` to the auto-commit

## [Phase 1.3] — Card system

- `WhyItMatters.tsx` — per-story practitioner brief callout (spec §7.9), `--accent` border
- `ArticleNote.tsx` — per-story auto-saving textarea with legacy key migration
- `Card.tsx` — standard / hero / list variants; `whyItMatters ?? contextNote` fallback
- `SectionDeck.tsx` — auto-fit grid, first story = hero
- `SkeletonCard.tsx` — loading skeleton

## [Phase 1.2] — Masthead + theme toggle

- `useTheme.ts` — module-level FOAT prevention; OS theme change listener
- `Masthead.tsx` — sticky compact scroll trigger at 200 px; spec-correct wordmark size and date line

## [Phase 1.1] — Foundation scaffold

- Tailwind v4 CSS-first config
- `src/styles/tokens.css` — design tokens (colours, spacing, radius, fonts)
- `src/styles/type.css` — typographic scale and kicker utility
- `src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- Google Fonts: Newsreader + JetBrains Mono
