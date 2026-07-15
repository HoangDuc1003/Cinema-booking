## 2026-07-15T16:08:30Z
You are teamwork_preview_worker.
Your working directory is: e:\NitroCine\.agents\worker_catalog_services\
Your task is to implement Milestones 2, 3, 4, and 5 of the Weekly Movie Catalog project:

1. Create a shared catalog refresh service: `server/services/catalogRefreshService.js` that implements:
   - Seeded random helper (Mulberry32 or LCG) and deterministic permuter `getDeterministicPermutation(movieIds, seedString)`.
   - `getISOWeekKey(date)` and `calculateCurrentSlot(date)` based on Asia/Ho_Chi_Minh timezone.
   - `buildWeeklyCatalogBatch(weekKey)`:
     - Bucket NEWEST: 50 active movies (from theatrical/now playing/upcoming).
     - Bucket CLASSICS: 50 classics (older than 15 years, e.g. release_date <= 2011-12-31, vote_count >= 500, vote_average >= 7.0, sorted by popularity/rating).
     - Bucket POPULAR: 50 popular movies (using seeded randomized pages derived from weekKey).
     - Globally deduplicate by TMDB ID (buckets precedence: newest, classics, popular).
     - Fetch details/credits with timeout 3s, exponential backoff retry, concurrency limit 5, and validate movie properties: valid numeric TMDB ID, non-empty title, non-empty overview, release_date, poster_path, backdrop_path, adult !== true, runtime from details > 0, genres array, vote_average, original_language.
     - Backfill candidates until all 3 buckets have exactly 50 movies. Fail staging batch if unable to reach 150 unique validated movies.
     - Save staging CatalogBatch.
   - `activateCatalogBatch(batchId)`:
     - Safe staging and atomic activation using distributed Redis lock (`nitrocine:v1:lock:catalog-refresh`, wait timeout 10s, lock expire 30s).
     - Set `catalog.refreshing = true` in SiteConfig.
     - Upsert Movie documents to MongoDB (never hard clear Movie collection or delete historical movies).
     - Set SiteConfig `activeBatchId`, `activeSlot`, `lastSuccessfulRefreshAt`, `lastRotationAt`.
     - Update CatalogBatch statuses (staging -> active, previous active -> retired).
     - Set `catalog.refreshing = false` in SiteConfig.
     - Invalidate Redis caches and warm cache for the current slot.
     - Handle failure and rollback: set staging batch status to 'failed', keep previous batch active, release lock.
   - `rotateActiveCatalogSlot()`:
     - Identify active batch, calculate slot, set SiteConfig `activeSlot` and `lastRotationAt`, invalidate slot-sensitive cache, and warm new current slot.
   - `getPublicHomePayload(limit, region, now)`:
     - Fetch movies for the active batch and slot permutation.
     - Partition: Hero candidates (0-5), Now Showing (5-25), Popular (25-45), Classics (45-65), Recommended (65-85) ensuring zero overlap in the same response.
     - If `catalog.refreshing` is true, continue serving old batch, but set `heroVideoStatus` of hero movies to empty/refreshing so they are poster-only.
     - Use slot-specific cache key: `nitrocine:v1:catalog:slot:<batchId>:<slot>`. Save to cache and update `nitrocine:v1:catalog:last-good`.

2. Create CLI Seeder: `server/scripts/seed.js`
   - Run via `node scripts/seed.js` or `npm run seed:catalog` (add script to `server/package.json`).
   - Supports dry-run: `npm run seed:catalog -- --dry-run` which fetches and validates but does not write to MongoDB/Redis.
   - Returns exit code 0 on success, 1 on failure.

3. Update Inngest schedules: `server/inngest/index.js`
   - Cron functions:
     - `weekly-catalog-refresh` on schedule `"TZ=Asia/Ho_Chi_Minh 0 3 * * 1"`
     - `rotate-active-catalog-slot` on schedule `"TZ=Asia/Ho_Chi_Minh 0 8,20 * * *"`
   - Disable/remove daily catalog changes from `dailyTrendingImport`.

4. Update `server/services/homeNowShowingService.js`, `server/services/heroService.js`, and `server/controllers/showController.js`:
   - Use the precomputed weekly catalog and rotation slot instead of live TMDB requests.
   - Make sure no live TMDB calls are made during Home initial load.

5. Add unit and integration tests under `server/tests/` to verify:
   - Bucket counts, deduplication, backfilling, atomic activation, lock safety, deterministic rotations, and cache strategies.

Once completed, run all unit tests in the server directory and ensure everything passes successfully. Save a progress report in your working directory and notify me.
