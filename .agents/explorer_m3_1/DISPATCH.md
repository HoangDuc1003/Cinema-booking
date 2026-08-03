## 2026-08-03T12:09:19Z
You are explorer_m3_1, an exploration agent for Milestone 3 (Frontend Admin UI & Exact Manual Order Preservation) of the NitroCine Native Hero Repair project.
Your working directory is `e:/NitroCine/.agents/explorer_m3_1/`. Create this directory if it does not exist, and write your progress.md and handoff.md there.

Task Objective: Investigate `client/src/pages/admin/HeroSettings.jsx`, `client/src/components/HeroSection.jsx`, and `client/src/components/hero/heroDailyShuffle.js` to formulate a precise implementation plan for Admin UI data mapping, section separation, HTTP 422 error surfacing, obsolete copy removal, and Home daily shuffle bypass in manual mode per ORIGINAL_REQUEST.md Sections 7 & 8.

Path to ORIGINAL_REQUEST.md: `e:/NitroCine/.agents/ORIGINAL_REQUEST.md`

Instructions:
1. Code Analysis:
   - `client/src/pages/admin/HeroSettings.jsx`: Inspect state initialization (`selectedIds`), data mapping (`liveMovies`, `manualSelection`, `rotation`), section rendering, Publish button validation checks, HTTP 422 handling, and existing UI copy.
   - `client/src/components/HeroSection.jsx`: Inspect movie ordering logic (`getOrComputeDailyOrder`, `applyDailyOrder`, `heroDailyShuffle.js`), checking where movie order is applied for rendered hero slides.
   - `client/src/components/hero/heroDailyShuffle.js`: Inspect how daily shuffle computes per-viewer ordering.

2. Design the Specification:
   - `HeroSettings.jsx`:
     - Explicit data mapping for "Currently live on Home" (`hero.liveMovies`), "Manual selection" (`hero.manualSelection` or `settings.movieIds`), and "Auto rotation pool" (`hero.rotation.pool`/`activeMovies`).
     - Ensure editable `selectedIds` initializes from `hero.settings?.movieIds` or `hero.manualSelection`, NEVER from `hero.rotation.activeMovies`.
     - Update error handler for PUT `/api/admin/hero` to parse HTTP 422 `MANUAL_HERO_INVALID` response and display specific `invalidMovies` failure reasons per movie.
     - Replace obsolete copy ("Manual mode only defines the ordered emergency poster fallback") with updated copy reflecting authoritative manual mode.
     - Update "Currently live on Home" immediately after successful save using returned `liveHero`.
   - `HeroSection.jsx`:
     - When `settings.effectiveMode === 'manual'` OR `settings.configuredMode === 'manual'` OR `meta?.source === 'manual-selection'`, bypass `getOrComputeDailyOrder()` and `applyDailyOrder()`. Render movies in their exact server payload order [A, B, C, D, E] for all viewers and reloads.

3. Document all findings and specifications in `e:/NitroCine/.agents/explorer_m3_1/handoff.md`.

Send a message when finished referencing the handoff report path.
