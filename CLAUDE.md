# daily-brief — project notes for Claude Code

A personal newspaper-style news reader for one reader (in-house legal counsel,
Mumbai/Delhi-NCR). React/Vite frontend on GitHub Pages, content refreshed by a
Python script running in GitHub Actions. Design intent and history lives in
`IMPLEMENTATION_SPEC.md` — read that for the *why* behind the UI. This file is
the *what's actually running* reference, kept current as the codebase changes.

## Architecture — read this before touching data or deploy

- **Frontend**: `src/` — React 18 + TypeScript + Vite + Tailwind v4. Entry
  point is `index.html` → `src/main.tsx`. Deployed to GitHub Pages at
  `/daily-brief/`.
- **Legacy, unused files at repo root**: `app.js`, `styles.css`,
  `story-schema.json` are left over from a pre-React version. The live
  `index.html` doesn't reference them. Don't assume styling changes there do
  anything — the real design tokens are in `src/styles/tokens.css` /
  `type.css` / `global.css`.
- **Content pipeline**: `fetch_stories.py` (Python, repo root) is the real
  content fetcher/enrichment script — not the `scripts/*.mjs` files the
  original spec (`IMPLEMENTATION_SPEC.md`) described; the implementation
  diverged from that spec. It fetches ~20 RSS feeds, dedupes/dual-tags
  Reliance stories into both `reliance` and `business`, calls the AI
  enrichment chain (below) per story, and writes `stories.json` +
  `stories.fallback.json` at the repo root.
- `scripts/generate-briefing.mjs` writes the "Today's Brief" hero summary to
  `src/data/briefing.json`. `scripts/fetch-markets.mjs` and
  `scripts/update-meta.mjs` write `src/data/markets.json` and
  `src/data/meta.json`.
- **The React app fetches these at runtime**, not at build time — see
  `src/App.tsx` for the `fetch()` calls. `stories.json` is fetched from the
  repo root; `meta.json`/`briefing.json` from `src/data/`.
- **Categories**: `legal, business, reliance, retail, tech, world, sports,
  opinion` — defined in `src/lib/categories.ts`, which is the source of
  truth for display order/color/label (not `IMPLEMENTATION_SPEC.md`'s
  original ordering, which has drifted).
- **Papers feature** (`process_papers.py`, manually triggered via the
  `process-papers.yml` workflow) is a separate PDF-import pipeline with its
  own duplicated `ai_enrich_story` function — not on the multi-provider
  chain below, still Anthropic-only. Low volume (manual trigger), so this
  hasn't been a priority to unify, but it's inconsistent with the main
  pipeline and worth fixing if it ever matters.

## The paper edition (page-turn reading mode)

The Front (`/`) and section routes (`/sections/:category`) render as a
flippable newspaper, and stories open in a flippable reader, when "Page
turns" is on in Settings (the default) and the OS isn't set to reduced
motion. Otherwise the original scrolling `FrontPage`/`SectionPage` and
`ArticleSheet` are used — keep both paths working.

- `src/components/paper/FlipBook.tsx` wraps `page-flip` (StPageFlip, the
  one dependency added for this). It works around several library quirks —
  read its comments before changing it, and re-test back-navigation in
  single-page (phone) mode, which the library gets wrong on its own.
- **Pagination is measured, not estimated** (`PaperEdition.tsx`): an
  off-screen copy of every page piece is rendered at the real page size,
  and pages are packed from those heights. If you change spacing or font
  sizes in `PaperPages.tsx`, nothing else needs updating — but don't
  reintroduce fixed per-page story counts or height guesses; they left
  pages overflowing with their folio cut off.
- Touch turning is **our own code** in `FlipBook.tsx`, not page-flip's: the
  library only follows a finger after a 250ms hold and gives up once Android
  treats the touch as a scroll, so touches are translated into its drag
  primitives. Test on a real-touch emulation (CDP `Input.dispatchTouchEvent`,
  Pixel profile), not synthetic events.
- A Flip | Scroll switch sits in the paper toolbar and above the scrolling
  layout. The reader's choice wins over `prefers-reduced-motion`, which only
  picks the default when nothing has been chosen.
- Stories with no photo get section-coloured artwork (`StoryArt.tsx`).
- Haptics (`src/lib/haptics.ts`, `navigator.vibrate`; Android only, a setting).
- Reader preferences (theme palette, font, text size, page turns, page
  sound, haptics) live in `src/hooks/usePreferences.ts` and are applied as
  `data-*` attributes on `<html>`; palettes/fonts/`--reading-scale` are in
  `src/styles/tokens.css`, paper styling in `src/styles/paper.css`.

## Story analysis: native engine first, AI only for what's missing

Per-story `summary`, `contextNote` ("Why It Matters" — the product's actual
differentiator, see `IMPLEMENTATION_SPEC.md` §2.11) and `facts` are produced by
`enrich_stories()` in `fetch_stories.py`, spending as few tokens as possible.
In order, per story:

1. **Reuse** — a note an AI wrote on an earlier run is kept if the story is
   unchanged (`enrichHash` of headline+hook+summary, or same headline for
   stories written before the hash existed). Previously ~64 AI calls per
   refresh, 3x/day; now only new/changed stories cost anything.
2. **Native engine** (`analysis_engine.py`, stdlib, no API, no tokens):
   - `summary` is always native: extractive (real sentences from the RSS
     excerpt plus the article page's own description, which the page-fetch
     pass already downloads for og:image). It returns *nothing* rather than
     restating the headline. An earlier AI summary is kept only if the native
     engine has less to offer.
   - `facts`: courts, regulators, statutes/sections, amounts, deadlines, companies.
   - `contextNote`: a rule fires only when a legal regime (IBC, SEBI, RBI, CCI,
     DPDP, FEMA/PMLA, tax, CCPA, arbitration, IP, Companies Act) is the
     story's *subject* (headline or opening sentence) and the section is not
     sports/opinion. Rules name the entities found; `enrichedBy` = `"native"`.
     Add or tighten rules in `_RULES` — and re-check they don't misfire (a
     consumer-court refund once matched an advertising rule).
3. **AI, note only** — if none of the above produced a note, one short call
   (`max_tokens` 450; the prompt carries the native summary and facts instead of
   asking for them again). Order: legal/reliance → Anthropic, Gemini, OpenAI;
   everything else → Gemini, OpenAI, Anthropic; then the optional `custom`
   provider. A missing key just skips that provider.
4. **Nothing** — no note beats a canned one. `CONTEXT_TEMPLATES` is only kept
   to recognise (and refuse to reuse) old canned notes. Don't reintroduce a
   silent generic fallback.

Spend controls (env vars / repo *variables*; all optional):
`AI_MAX_CALLS` (default 40/run, spent legal-first), `AI_PROVIDER_ORDER`
(e.g. `gemini,custom,openai`), and a per-run circuit breaker: quota/credit
errors disable a provider immediately, `AI_MAX_FAILS` (3) consecutive failures
also do. The run log ends with an `Enrichment:` line (reused / native / AI /
no brief) — read it after a refresh.

**Adding a fallback AI** needs no code: set `AI_FALLBACK_BASE_URL` (any
OpenAI-compatible `/chat/completions`, e.g. Groq, OpenRouter, DeepSeek, or a
local Ollama at `http://localhost:11434/v1`), `AI_FALLBACK_MODEL`, and
`AI_FALLBACK_API_KEY` (secret; may be blank for local). `generate-briefing.mjs`
honours the same three variables.

- Needs `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` as GitHub
  Actions secrets (passed through in `refresh.yml`) for the AI tier; the native
  engine works with none.
- `python3 -m unittest discover -s tests` (offline, ~1s) covers reuse, the call
  cap, the circuit breaker, fallback order and "no canned note"; `refresh.yml`
  runs it before fetching. The AI HTTP calls themselves are only exercised by a
  real refresh — check the `Enrichment:` log line after changing them.
- **The prompt bans generic hedging language** ("may affect", "worth
  tracking", etc.) and retries once if the model uses it anyway.
- **Model names drift** — Gemini's has already changed once
  (`gemini-2.5-flash` → `gemini-3.6-flash`). If a provider fails 100% of
  calls, read the actual error body (`fetch-log.txt` or the Action's job log)
  before assuming the key is bad.
- Each story records `enrichedBy` (who wrote the note) and `summaryBy`; the
  reader shows which, so spot-checking is easy.

## Git & deploy workflow — this repo auto-commits itself

- **`refresh.yml`** runs on a cron (3x/day) *and* is manually triggerable,
  and commits straight to `main` (`chore: refresh <timestamp>`). This means
  **`main` moves on its own, independent of anything you push.** Always
  `git fetch origin main` immediately before pushing to it — assume it has
  diverged, especially if any real time has passed since you last checked.
- **`deploy.yml`** runs on every push to `main` and redeploys the live
  GitHub Pages site. A push to `main` is a production action, not a dev
  commit — treat it accordingly (this repo doesn't use PR review; direct
  pushes to `main` are the normal workflow here, but still worth a beat of
  care).
- This session's GitHub integration can push code and read Actions
  runs/logs, but **cannot trigger or cancel a workflow run via the API**
  (`actions_run_trigger` returns 403 `Resource not accessible by
  integration`). Triggering/canceling a run always needs the user to click
  "Run workflow" in the Actions tab — don't assume you can do this
  yourself, and don't retry the same call expecting a different result.
- If `git push` to `main` is rejected as non-fast-forward, it's almost
  certainly a `refresh.yml` auto-commit that landed in the meantime, not a
  real conflict — `git fetch origin main && git rebase origin/main` is
  normally sufficient and conflict-free, since those commits only touch
  `stories.json` / `stories.fallback.json` / `src/data/*.json` /
  `fetch-log.txt`.

## Engineering defaults for this repo

- No hardcoded credentials, ever — API keys live in GitHub Actions secrets
  (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`), read via
  `os.environ`/`process.env`.
- Prefer surgical, targeted edits over rewriting whole files — most of this
  codebase is already deliberately structured (see the file-level comments
  in `Card.tsx`, `fetch_stories.py`); read the existing reasoning before
  changing it.
- Before saying a change is done: actually run it — `python3 -m py_compile`
  for Python changes, `npx tsc -b` for TypeScript, `node --check` for the
  `.mjs` scripts. For anything UI-facing, run the dev server and look at it
  (headless browser screenshots work fine in this environment) rather than
  asserting it looks right from reading the code.
- Don't claim more certainty than you have. "Builds cleanly, haven't
  clicked through the UI yet" is more useful than an unqualified "done" —
  this project has bitten itself before on exactly that gap (silent AI
  fallback to generic content wasn't visible until someone actually read
  the live data).
- No new npm/pip dependencies without a reason worth stating — this is a
  small, mostly-static personal project; keep it that way unless there's a
  concrete need.
