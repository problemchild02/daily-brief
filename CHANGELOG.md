# Changelog

All notable changes to the Daily Brief React migration are recorded here.

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
