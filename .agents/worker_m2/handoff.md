# Handoff Report — Milestone 2: Backend Authoritative Manual Mode & Validation

## 1. Observation

### 1.1 Changed Files
- `server/services/heroService.js`:
  - Implemented `getSafeBackendIdentity()` exporting `buildSha`, `deploymentId`, and `environment`.
  - Updated `getHomeHeroConfig()` to expose `mode`, `configuredMode`, and `effectiveMode`.
  - Updated `getPublicHomeHero()`: checks `configuredMode` first. If `manual`, delegates directly to `loadManualPayload(settings, now)`, bypassing auto rotation.
  - Updated `updateHomeHero()`: validates manual mode requiring exactly 5 unique, valid native-ready movies (`validateNativeHeroMovie(movie)`), checks for distinct `heroVideoUrl` values, throws HTTP 422 with `code: 'MANUAL_HERO_INVALID'`, `message: 'All five Manual Hero movies require verified native trailers.'`, and detailed `invalidMovies` array (`movieId`, `title`, `reasons`). On validation success, updates `SiteConfig`, bumps cache generation (`bumpHeroCacheGeneration()`), invalidates Redis caches (`invalidateHeroCaches()`), and returns `{ settings, liveHero, meta, ... }`.
  - Updated `getAdminHomeHero()`: returns `settings`, `liveMovies`, `manualSelection` (exact 5 saved movies preserving order), `rotation`, `availableMovies`, and safe `meta`.
- `server/services/heroRotationService.js`:
  - Exported `loadManualPayload()` and ensured it includes `configuredMode: 'manual'`, `effectiveMode: 'manual'`, `source: 'manual-selection'`, `cacheGeneration`, and safe `meta` backend identity.
  - Updated `toPublicPayload()` to include `cacheGeneration` in `meta`.
  - Updated `createHeroEtag()` to include `configuredMode`, `effectiveMode`, `source`, `cacheGeneration`, `dateKey`, `movies` (IDs and video versions), and settings timestamps.
- `server/controllers/adminController.js`:
  - Updated `updateHeroSettings()` controller action to return `success`, `message`, `settings`, `liveHero`, and `meta` on success, and status 422 with `code`, `message`, `invalidMovies` on validation errors.
- `server/tests/heroService.test.js`:
  - Added unit test covering HTTP 422 `MANUAL_HERO_INVALID` response structure (`code`, `invalidMovies`).
  - Added unit test covering `getAdminHomeHero()` safe `meta` backend identity parity (`buildSha`, `deploymentId`, `environment`).
- `server/tests/heroController.test.js`:
  - Added unit test covering `updateHeroSettings` controller response contract on success (`settings`, `liveHero`, `meta`).
  - Added unit test covering `updateHeroSettings` controller HTTP 422 error structure (`code: 'MANUAL_HERO_INVALID'`, `invalidMovies`).
- `server/tests/heroRotationService.test.js`:
  - Added unit test covering `createHeroEtag` sensitivity to `configuredMode`, `effectiveMode`, `source`, and manual movie order changes.
  - Added unit test covering `loadManualPayload` metadata contract and safe identity.

### 1.2 Command Outputs

#### 1. Focused Node Unit Tests
```
Command: node --test server/tests/heroService.test.js server/tests/heroController.test.js server/tests/heroRotationService.test.js
Output:
✔ Home Hero controller returns cache headers, stable metadata, meta identity, and five server-ordered movies (1.2661ms)
✔ Home Hero controller returns 304 without a response body for a matching ETag (0.2098ms)
✔ every Hero admin route applies protectAdmin before its action handler (0.1854ms)
✔ updateHeroSettings controller action returns settings, liveHero, and meta on success (12.4065ms)
✔ updateHeroSettings controller action returns 422 with code MANUAL_HERO_INVALID and invalidMovies on failure (0.6681ms)
✔ seeded Hero selection returns five unique movies covering all three categories (1.5025ms)
✔ same Hero seed is reproducible and previous selection is avoided when capacity permits (0.9182ms)
✔ Hero selection rejects overlapping or incomplete category pools (0.5105ms)
✔ Vietnam midnight refresh calculations cross month and year boundaries (3.866ms)
✔ daily scheduler due-check waits until persisted nextRefreshAt (1.1109ms)
✔ native asset validation rejects mock, generic, unbound, and incomplete sources (0.6595ms)
✔ native asset validation enforces limits, codec pair, version, and poster metadata (0.2161ms)
✔ Hero runtime configuration rejects malformed or contract-breaking environment values (0.9511ms)
✔ unknown operational refresh failures retry while known permanent validation failures do not (0.4971ms)
✔ If-None-Match supports weak and comma-separated semantic Hero ETags (0.7622ms)
✔ manual Hero idempotency identity is stable across scheduling windows (3.9389ms)
✔ Hero ETag changes when scheduling metadata changes (0.3909ms)
✔ catalog pool builder persists exact disjoint 5/5/5 groups and rejects an incomplete native set (5.1103ms)
✔ activation preflight rejects a pool whose bound asset changed after selection (0.6183ms)
✔ createHeroEtag incorporates configuredMode, effectiveMode, source, and manual order (0.3359ms)
✔ loadManualPayload returns complete authoritative manual metadata and safe identity (3.5128ms)
✔ active Hero batch is server-authoritative in auto mode, preserves order, and ignores heroOffset (5.9128ms)
✔ R2: manual mode is authoritative, returns exact 5 saved movies in order, retaining native video metadata (1.85ms)
✔ missing active batch returns five ordered posters and never exposes mock/generic media as playable (1.7393ms)
✔ semantic Hero ETag changes for movie order, video version, and sound settings (0.6282ms)
✔ R2: getAdminHomeHero populates selectedMovies using saved settings.movieIds without forcing poster-only strip (3.4329ms)
✔ R3: updateHomeHero in manual mode enforces 5 unique native-ready movies with HTTP 422 and preserves SiteConfig atomically on failure (3.3582ms)
✔ R3/R4: getAdminHomeHero returns liveMovies and manualSelection in response object (2.8363ms)
✔ updateHomeHero throws HTTP 422 with MANUAL_HERO_INVALID and invalidMovies details on validation failure (0.5448ms)
✔ getAdminHomeHero includes safe meta with buildSha, deploymentId, and environment (1.6398ms)
ℹ tests 30
ℹ pass 30
ℹ fail 0
```

#### 2. Server Test Suite (`cd server && npm test`)
```
Command: npm test (in server/)
Result: Exit Code 0
Summary: 125 passed, 0 failed, 2 skipped (out of 127 total tests)
```

#### 3. Client Test Suite (`cd client && npm test`)
```
Command: npm test (in client/)
Result: Exit Code 0
Summary: 95 passed, 0 failed (out of 95 total tests)
```

---

## 2. Logic Chain

1. **Explicit Authoritative Manual Selection**:
   - `getPublicHomeHero()` reads `getHomeHeroConfig()` first. If `configuredMode === 'manual'`, it invokes `loadManualPayload(settings, now)` directly without querying `getPublicHeroRotation()`.
   - `loadManualPayload()` fetches the 5 saved movie IDs via `loadOrderedMovies()`, preserving the exact array index order and attaching `configuredMode: 'manual'`, `effectiveMode: 'manual'`, `source: 'manual-selection'`, `cacheGeneration`, and safe backend identity (`buildSha`, `deploymentId`, `environment`).

2. **5-Movie Validation & HTTP 422 Contract**:
   - In `updateHomeHero()`, when `nextMode === 'manual'`:
     - IDs are trimmed and sanitized.
     - Selection size is validated for `rawIds.length === 5` and `uniqueIds.size === 5`.
     - Movies are queried from DB and validated via `validateNativeHeroMovie(movie)`.
     - `heroVideoUrl` values are checked across the 5 movies for uniqueness.
     - Per-movie failures are aggregated into `invalidMovies` (`movieId`, `title`, `reasons`).
     - On any failure, an Error with `status: 422`, `code: 'MANUAL_HERO_INVALID'`, `message: 'All five Manual Hero movies require verified native trailers.'`, and `invalidMovies` is thrown.
   - Validation occurs BEFORE any `SiteConfig` modification, maintaining atomic state preservation.

3. **Admin Response Contract**:
   - `getAdminHomeHero()` returns separate keys for `liveMovies`, `manualSelection` (`movieIds` & `movies`), `rotation`, `settings`, `availableMovies`, and safe `meta`.
   - `updateHeroSettings()` controller action returns `{ success: true, message, settings, liveHero, meta }` on success, and handles HTTP 422 with `{ success: false, code: 'MANUAL_HERO_INVALID', message, invalidMovies }`.

4. **ETag & Cache Invalidation**:
   - `createHeroEtag()` incorporates `configuredMode`, `effectiveMode`, `source`, `cacheGeneration`, `dateKey`, `movies` (IDs and video versions), and settings timestamps.
   - Any mode switch (`auto` <-> `manual`) or reordering of manual movie IDs modifies the ETag hash.
   - Successful manual save calls `bumpHeroCacheGeneration()` and `invalidateHeroCaches()`, invalidating Redis keys so subsequent `GET /api/show/hero` requests return the updated payload immediately.

---

## 3. Caveats

No caveats. All instructions, constraints, and test suites pass 100% cleanly without warnings or skips in hero functionality.

---

## 4. Conclusion

Milestone 2 (Backend Authoritative Manual Mode & Validation) implementation is complete, accurate, and verified against all unit and integration test suites.

- `server/services/heroService.js`: Updated with `getSafeBackendIdentity`, manual bypass in `getPublicHomeHero`, 5-movie HTTP 422 `MANUAL_HERO_INVALID` validation in `updateHomeHero`, and safe `meta` in `getAdminHomeHero`.
- `server/services/heroRotationService.js`: Updated with `loadManualPayload` exports/metadata, `toPublicPayload` cache generation, and multi-factor `createHeroEtag`.
- `server/controllers/adminController.js`: Updated `updateHeroSettings` controller for success and 422 error payloads.
- `server/tests/`: Added unit tests covering all required backend scenarios.

---

## 5. Verification Method

To re-verify all backend hero changes:

1. **Focused Hero Unit Tests**:
   ```bash
   node --test server/tests/heroService.test.js server/tests/heroController.test.js server/tests/heroRotationService.test.js
   ```
   *Expected Output*: 30 passed, 0 failed.

2. **Full Server Test Suite**:
   ```bash
   cd server && npm test
   ```
   *Expected Output*: 125 passed, 0 failed, 2 skipped.

3. **Full Client Test Suite**:
   ```bash
   cd client && npm test
   ```
   *Expected Output*: 95 passed, 0 failed.
