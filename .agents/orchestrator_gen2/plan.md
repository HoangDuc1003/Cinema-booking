# Execution Plan: Precomputed Weekly Movie Catalog with Twice-Daily Rotation and Instant Home Entry

## Objective
Implement a precomputed weekly movie catalog pool of exactly 150 unique active movies, rotated twice daily and refreshed every Monday at 03:00 (Asia/Ho_Chi_Minh), removing all live TMDB dependencies from the Home page initial rendering, and removing the HomeBootLoader for immediate Home page rendering.

## Milestones & Steps

### Milestone 1: Database Schemas and SiteConfig Updates
- Create `server/models/CatalogBatch.js` schema.
- Update `server/models/SiteConfig.js` to include catalog rotation state fields (`activeBatchId`, `refreshing`, `activeSlot`, `lastRotationAt`, `lastSuccessfulRefreshAt`).

### Milestone 2: Shared Catalog Refresh Service
- Create `server/services/catalogRefreshService.js`.
- Core Functions:
  - `buildWeeklyCatalogBatch(weekKey)`: Fetch 50 theatrical/recently released movies for NEWEST, 50 high-vote classics for CLASSICS, 50 deterministic randomized popular movies using `weekKey` seed for POPULAR. Deduplicate, backfill, fetch details with concurrency 5, validate movies.
  - `activateCatalogBatch(batchId)`: Lock with Redis, stage, upsert Movies, atomically swap `SiteConfig` fields, update batch state, cache warming.
  - `getCurrentCatalogRotation()`: Determine the slot index (0-13) based on current Asia/Ho_Chi_Minh time. Permute 150 movie IDs deterministically via `weekKey + slotIndex`.
  - `warmCatalogCaches(batchId, slotIndex)`: Warm Redis caches for the slot.

### Milestone 3: CLI Seeder & Package configuration
- Implement `server/scripts/seed.js` using `catalogRefreshService.js`.
- Support `--dry-run`.
- Add `"seed:catalog"` to `server/package.json`.

### Milestone 4: Background Jobs Integration (Inngest)
- Add cron functions to `server/inngest/index.js`:
  - `weekly-catalog-refresh` (`TZ=Asia/Ho_Chi_Minh 0 3 * * 1`)
  - `rotate-active-catalog-slot` (`TZ=Asia/Ho_Chi_Minh 0 8,20 * * *`)
- Disable `dailyTrendingImport` from catalog modification (either disable entirely or isolate it).

### Milestone 5: Home Endpoints & Cache Logic
- Update `server/services/homeNowShowingService.js` and `server/services/heroService.js` to serve movies from the active batch and slot permutation.
- Implement Redis cache strategy: slot-specific caching (`nitrocine:v1:catalog:slot:<batchId>:<slot>`) and `nitrocine:v1:catalog:active`.
- Respect `catalog.refreshing === true` by ensuring the Hero remains poster-only (no video).
- Add protected admin route `POST /api/admin/catalog/refresh` to manually trigger refresh via `refreshWeeklyCatalog()`.

### Milestone 6: Smart Home Entry & Admin UI Trigger (Client)
- Implement smart loading strategy on `client/src/pages/Home.jsx`: wait for Hero, FeatureSection (Now Showing), and TrailerSection to load. Render page immediately once all are loaded, using per-section skeletons while loading. Use a 5s fallback timeout to show whatever is ready.
- Add a trigger button in the Admin panel UI (e.g. `/admin/hero` or a new catalog section) to post to `/api/admin/catalog/refresh`, with real-time status feedback (refreshing, success, failure) and a dry-run checkbox option.
- Replace `HomeBootLoader` usage in `client/src/App.jsx` with standard `Loading` indicator.
- Delete `client/src/components/HomeBootLoader.jsx` and its CSS file.

### Milestone 7: Final Project Cleanup & Optimization
- Scan and remove any unused files, dead imports, orphaned components, or temporary development/diagnostic scripts.
- Optimize client bundle size (lazy load admin panels, check code splitting).
- Clean up console.log noise in production builds.
- Refactor duplicate helpers or controllers.

### Milestone 8: Tests & Forensic Audit
- Add and run server unit/integration tests for batch preparation, deduplication, deterministic rotation, and atomic activation.
- Add client E2E tests for immediate rendering, poster-only during refresh, and smart entry.
- Run Forensic Auditor to guarantee work integrity.
