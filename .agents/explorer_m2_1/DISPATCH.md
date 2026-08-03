## 2026-08-03T11:59:13Z
You are explorer_m2_1, an exploration agent for Milestone 2 (Backend Authoritative Manual Mode & Validation) of the NitroCine Native Hero Repair project.
Your working directory is `e:/NitroCine/.agents/explorer_m2_1/`. Create this directory if it does not exist, and write your progress.md and handoff.md there.

Task Objective: Investigate backend files (`server/services/heroService.js`, `server/services/heroRotationService.js`, `server/controllers/adminController.js`, `server/controllers/showController.js`, `server/tests/`) and design a precise implementation plan for authoritative manual mode, 5-movie validation (HTTP 422), Redis cache invalidation, ETag logic, and safe backend identity per ORIGINAL_REQUEST.md Sections 5 & 6.

Path to ORIGINAL_REQUEST.md: `e:/NitroCine/.agents/ORIGINAL_REQUEST.md`

Instructions:
1. Code Inspection:
   - `server/services/heroService.js`: Analyze `getPublicHomeHero()`, `getAdminHomeHero()`, `updateHomeHero()`, `validateNativeHeroMovie()`, movie normalization, and payload creation.
   - `server/services/heroRotationService.js`: Analyze `getPublicHeroRotation()`, `loadManualPayload()`, `toPublicPayload()`, `getAdminHeroRotation()`.
   - `server/controllers/adminController.js`: Analyze Admin Hero endpoint responses and payload structure.
   - `server/controllers/showController.js`: Analyze public GET `/api/show/hero`, ETag generation (`createHeroEtag`), caching headers, and `meta` diagnostic response.
   - `server/tests/`: Check existing backend hero unit and integration test files.

2. Design the Implementation Plan:
   - Specify `getPublicHomeHero()` flow: load `SiteConfig` first; if `configuredMode === 'manual'`, call canonical manual payload builder; else call `getPublicHeroRotation()`.
   - Specify canonical manual payload builder: 5 ordered IDs, MongoDB `$in` lookup order restoration, 5 distinct native-ready movies (`validateNativeHeroMovie()`), `posterOnly: false`, safe `meta` (`configuredMode`, `effectiveMode`, `source`, `version`, `buildSha`, `deploymentId`, `environment`).
   - Specify `updateHomeHero()` validation: HTTP 422 `MANUAL_HERO_INVALID` with detailed `invalidMovies` reasons when 5 valid native movies are not provided. Atomic preservation of previous config on failure.
   - Specify Admin payload contract (`getAdminHomeHero` & `updateHomeHero` response with `liveHero`, `manualSelection`, `liveMovies`, `rotation`).
   - Specify ETag updates (`createHeroEtag`) including mode, order, cache generation, and updatedAt.

3. Document all findings and specifications in `e:/NitroCine/.agents/explorer_m2_1/handoff.md`.

Send a message when finished referencing the handoff report path.
