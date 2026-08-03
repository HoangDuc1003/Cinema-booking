## 2026-08-03T19:00:00Z

You are worker_m2, a worker agent implementing Milestone 2 (Backend Authoritative Manual Mode & Validation) for the NitroCine Native Hero Repair project.
Your working directory is `e:/NitroCine/.agents/worker_m2/`. Create this directory if it does not exist, and write your progress.md and handoff.md there.

Task Objective: Implement backend authoritative manual mode, 5-movie validation with HTTP 422 `MANUAL_HERO_INVALID`, Redis cache invalidation, ETag updates, Admin response contract, and safe backend identity parity per ORIGINAL_REQUEST.md Sections 5 & 6 and the Explorer specification in `e:/NitroCine/.agents/explorer_m2_1/handoff.md`.

Mandatory Integrity Warning:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Path to ORIGINAL_REQUEST.md: `e:/NitroCine/.agents/ORIGINAL_REQUEST.md`
Path to Explorer spec: `e:/NitroCine/.agents/explorer_m2_1/handoff.md`

Instructions:
1. Update `server/services/heroService.js`:
   - Implement `getSafeBackendIdentity()` exporting `buildSha`, `deploymentId`, and `environment`.
   - Update `getHomeHeroConfig()` to expose `mode`, `configuredMode`, and `effectiveMode`.
   - Update `getPublicHomeHero()`: check `configuredMode` first. If `manual`, return `loadManualPayload(settings, now)` directly, bypassing auto rotation.
   - Update `updateHomeHero()`:
     - Validate manual mode requires exactly 5 unique, valid native-ready movies (`validateNativeHeroMovie(movie)`).
     - Check for distinct `heroVideoUrl` values.
     - On validation failure, throw HTTP 422 with `code: 'MANUAL_HERO_INVALID'`, `message`, and detailed `invalidMovies` array (`movieId`, `title`, `reasons`).
     - On validation success, update `SiteConfig`, bump cache generation, invalidate Redis caches, and return `{ settings, liveHero, meta }`.
   - Update `getAdminHomeHero()`: return `settings`, `liveMovies`, `manualSelection` (exact 5 saved movies preserving order), `rotation`, `availableMovies`, and safe `meta`.

2. Update `server/services/heroRotationService.js`:
   - Ensure `loadManualPayload()` includes `configuredMode`, `effectiveMode`, `source: 'manual-selection'`, `cacheGeneration`, and safe `meta`.
   - Update `createHeroEtag()` to include `configuredMode`, `effectiveMode`, `source`, `cacheGeneration`, `dateKey`, `movies` (IDs and video versions), and settings timestamps.

3. Update `server/controllers/adminController.js`:
   - Update `updateHeroSettings()` controller action to return `success`, `message`, `settings`, `liveHero`, and `meta` on success.
   - Return HTTP 422 with `code: 'MANUAL_HERO_INVALID'`, `message`, and `invalidMovies` on validation errors.

4. Add/Update Backend Tests:
   - Add/update tests in `server/tests/heroService.test.js`, `server/tests/heroController.test.js`, `server/tests/heroRotationService.test.js` covering:
     - Manual public Hero bypassing auto rotation.
     - HTTP 422 invalid manual activation response structure (`code`, `invalidMovies`).
     - ETag updates on mode change and order change.
     - Admin contract (`liveMovies` vs `manualSelection`).
     - Redis cache invalidation and cache generation bump.

5. Run Verification:
   - `node --test server/tests/heroService.test.js server/tests/heroController.test.js server/tests/heroRotationService.test.js`
   - `cd server && npm test`
   - `cd client && npm test`

6. Document all changed files, test commands, and exact outputs in `e:/NitroCine/.agents/worker_m2/handoff.md`.

Send a message when finished referencing the handoff report path.
