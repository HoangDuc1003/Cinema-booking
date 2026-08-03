# Changes Summary — Milestone 1 (R1 & R2)

## Modified Files

1. **`client/src/services/tmdb.js`**:
   - Replaced `DEV` mode override on `API_BASE` line 17 with `getNormalizedApiBase(runtimeEnv.VITE_BASE_URL)`.
   - Ensures all public/Home GET API requests via `fetchWithTimeout` use `VITE_BASE_URL`.

2. **`client/src/context/AppContext.jsx`**:
   - Normalized `VITE_BASE_URL` for `axios` `baseURL` instance.
   - Unifies Admin axios API requests and Home fetch requests under the same normalized base URL.

3. **`server/services/heroRotationService.js`**:
   - Updated `getPublicHeroRotation()` to check `SiteConfig.homeHero.mode`.
   - When `mode === 'manual'`, returns `loadManualPayload()` with exact 5 movies from `settings.movieIds` in saved Admin order.
   - Preserves native video metadata (`heroVideoUrl`, `heroVideoStatus`, etc.) without applying `{ posterOnly: true }`.
   - Added `configuredMode`, `effectiveMode`, and non-sensitive diagnostic `meta` object (`configuredMode`, `effectiveMode`, `source`, `version`, `environment`) to all Hero response payloads (auto, manual, poster-only).

4. **`server/services/heroService.js`**:
   - Updated `getAdminHomeHero()` to populate `selectedMovies` from saved `settings.movieIds` (not `rotation.activeMovies`), normalized preserving native video URLs.
   - Updated `updateHomeHero()` to execute `bumpHeroCacheGeneration()` and `invalidateHeroCaches()` on every settings update.

5. **`client/src/pages/admin/HeroSettings.jsx`**:
   - In `fetchHeroSettings()`, initialized `selectedIds` state with saved `settings.movieIds` (or `hero.selectedMovies`), preventing overwrite by auto-rotation batch movies.
   - Updated banner text to accurately reflect manual selection semantics on the Home page.
   - Added live status header badge (`Currently live on Home: Manual Selection` / `Auto-Rotation`).
   - Added explicit section labels and status badges for "Native Hero pool (Auto mode)" and "Manual selection".

6. **`client/tests/apiClientConfig.test.js`**:
   - Added unit tests for R1 verifying `tmdb.js` and `AppContext.jsx` derive and normalize API base URL from `VITE_BASE_URL` without `DEV` override.

7. **`server/tests/heroService.test.js`**:
   - Updated and added integration tests for R2 verifying manual mode authoritativeness, payload structure (`configuredMode`, `effectiveMode`, `meta`), video property retention, and `getAdminHomeHero` `selectedMovies` sync.
