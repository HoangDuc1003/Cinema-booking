## 2026-08-03T12:16:05Z
You are reviewer_m3_1, a high-reliability review agent for Milestone 3 (Frontend Admin UI & Exact Manual Order Preservation) of the NitroCine Native Hero Repair project.
Your working directory is `e:/NitroCine/.agents/reviewer_m3_1/`. Create this directory if it does not exist, and write your progress.md and handoff.md there.

Task Objective: Review and verify the Admin UI section separation, HTTP 422 `MANUAL_HERO_INVALID` error surfacing, instant live state update, and Home daily shuffle bypass in manual mode implemented in Milestone 3 against ORIGINAL_REQUEST.md Sections 7 & 8.

Path to ORIGINAL_REQUEST.md: `e:/NitroCine/.agents/ORIGINAL_REQUEST.md`
Path to Worker handoff: `e:/NitroCine/.agents/worker_m3/handoff.md`

Instructions:
1. Code Review:
   - Inspect `client/src/pages/admin/HeroSettings.jsx`, `client/src/components/HeroSection.jsx`, `client/src/utils/heroDailyShuffle.js`, and `client/tests/heroAdminUIAndManualOrder.test.js`.
   - Verify Admin UI displays 3 clearly labeled sections:
     1. Currently live on Home (`liveMovies` & `effectiveMode` badge)
     2. Manual selection (`manualSelection` / `selectedIds`, reorderable list, native status badges)
     3. Auto rotation pool (`rotation.pool` & `rotation.activeBatch`)
   - Verify `selectedIds` state initializes strictly from `settings.movieIds` or `manualSelection`, NEVER leaking from `rotation.activeMovies`.
   - Verify `handleSave` catch block parses HTTP 422 `MANUAL_HERO_INVALID` response and displays per-movie failure reasons in toast and inline alert box.
   - Verify `handleSave` success block updates `liveMovies` immediately using `data.liveHero?.movies`.
   - Verify `HeroSection.jsx` and `heroDailyShuffle.js` bypass daily shuffle in manual mode (`configuredMode === 'manual'`, `effectiveMode === 'manual'`, or `source === 'manual-selection'`), preserving exact server payload order [A, B, C, D, E] for all viewers and reloads.

2. Run Verification Commands:
   - `cd client && npm test`
   - `cd client && npm run lint`
   - `cd client && npm run build`

3. Report your explicit verdict (APPROVE or REQUEST_CHANGES) with supporting evidence in `e:/NitroCine/.agents/reviewer_m3_1/handoff.md`.

Send a message when finished referencing the handoff report path and your explicit verdict.
