## 2026-08-03T19:12:19Z

You are worker_m3, a worker agent implementing Milestone 3 (Frontend Admin UI & Exact Manual Order Preservation) for the NitroCine Native Hero Repair project.
Your working directory is `e:/NitroCine/.agents/worker_m3/`. Create this directory if it does not exist, and write your progress.md and handoff.md there.

Task Objective: Implement Admin UI section separation, HTTP 422 `MANUAL_HERO_INVALID` error handling, instant live update after save, and Home exact manual order preservation (daily shuffle bypass) per ORIGINAL_REQUEST.md Sections 7 & 8 and the Explorer specification in `e:/NitroCine/.agents/explorer_m3_1/handoff.md`.

Mandatory Integrity Warning:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Path to ORIGINAL_REQUEST.md: `e:/NitroCine/.agents/ORIGINAL_REQUEST.md`
Path to Explorer spec: `e:/NitroCine/.agents/explorer_m3_1/handoff.md`

Instructions:
1. Update `client/src/pages/admin/HeroSettings.jsx`:
   - Add `liveMovies`, `liveMeta`, `invalidMoviesError` states.
   - Separate Admin UI into 3 clearly labeled sections:
     1. "1. Currently Live on Home" (`liveMovies` & `liveMeta?.effectiveMode` badge)
     2. "2. Manual Selection" (`manualSelection` / `selectedIds`, reorderable 1-5 list, native status badges)
     3. "3. Auto Rotation Pool" (`rotation.pool` & `rotation.activeBatch`)
   - Ensure `selectedIds` state initializes strictly from `settings.movieIds` / `manualSelection`, NEVER from `rotation.activeMovies`.
   - Update `handleSave` catch block to parse HTTP 422 `MANUAL_HERO_INVALID` response and display specific `invalidMovies` reasons (toast notification & inline alert box).
   - Update `liveMovies` state immediately after successful save using `data.liveHero?.movies`.
   - Replace any obsolete copy with updated copy reflecting authoritative manual mode.

2. Update `client/src/components/HeroSection.jsx` & `client/src/utils/heroDailyShuffle.js`:
   - Verify that when effective/configured mode is `manual` or `meta.source === 'manual-selection'`, `getOrComputeDailyOrder` and `applyDailyOrder` are bypassed.
   - Preserve exact server payload order [A, B, C, D, E] for all viewers and reloads.

3. Tests & Quality Checks:
   - Add or update frontend unit tests in `client/tests/` verifying Admin initialization and manual order preservation.
   - Run `cd client && npm test`
   - Run `cd client && npm run lint`
   - Run `cd client && npm run build`

4. Document all changed files, test commands, and exact outputs in `e:/NitroCine/.agents/worker_m3/handoff.md`.

Send a message when finished referencing the handoff report path.
