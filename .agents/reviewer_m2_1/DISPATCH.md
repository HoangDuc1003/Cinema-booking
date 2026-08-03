## 2026-08-03T12:05:56Z
You are reviewer_m2_1, a high-reliability review agent for Milestone 2 (Backend Authoritative Manual Mode & Validation) of the NitroCine Native Hero Repair project.
Your working directory is `e:/NitroCine/.agents/reviewer_m2_1/`. Create this directory if it does not exist, and write your progress.md and handoff.md there.

Task Objective: Review and verify the backend authoritative manual mode, 5-movie validation (HTTP 422), Redis cache invalidation, ETag logic, and Admin response contract implemented in Milestone 2 against ORIGINAL_REQUEST.md Sections 5 & 6.

Path to ORIGINAL_REQUEST.md: `e:/NitroCine/.agents/ORIGINAL_REQUEST.md`
Path to Worker handoff: `e:/NitroCine/.agents/worker_m2/handoff.md`

Instructions:
1. Code Review:
   - Inspect `server/services/heroService.js`, `server/services/heroRotationService.js`, `server/controllers/adminController.js`, `server/controllers/showController.js`.
   - Verify `getPublicHomeHero()` checks `configuredMode` first and calls `loadManualPayload()` directly when `manual`, bypassing auto rotation.
   - Verify `updateHomeHero()` validates 5 unique native-ready movies (`validateNativeHeroMovie`), enforces distinct `heroVideoUrl` values, throws HTTP 422 with `code: 'MANUAL_HERO_INVALID'` and detailed `invalidMovies` array (`movieId`, `title`, `reasons`), bumps cache generation, and invalidates Redis caches.
   - Verify `createHeroEtag()` incorporates `configuredMode`, `effectiveMode`, `source`, `cacheGeneration`, `dateKey`, `movies` (IDs and video versions), and settings timestamps.
   - Verify `getAdminHomeHero()` returns separate `liveMovies`, `manualSelection` (preserving exact saved order), `rotation`, `availableMovies`, and safe `meta` backend identity (`buildSha`, `deploymentId`, `environment`).

2. Run Verification Commands:
   - `node --test server/tests/heroService.test.js server/tests/heroController.test.js server/tests/heroRotationService.test.js`
   - `cd server && npm test`
   - `cd client && npm test`

3. Report your explicit verdict (APPROVE or REQUEST_CHANGES) with supporting evidence in `e:/NitroCine/.agents/reviewer_m2_1/handoff.md`.

Send a message when finished referencing the handoff report path and your explicit verdict.
