# Backend Architecture & Refactoring Analysis: Manual Mode (R3) & Backend Identity (R4)

## Executive Summary
This analysis details the backend investigation of NitroCine's Home Hero production repair focused on **Manual Mode (R3)** and **Backend Identity & Cache Refetch Discipline (R4)**. The investigation covers API routes, controllers, services, Mongoose models, Redis caching, ETag versioning, and cache invalidation mechanics.

---

## 1. Codebase Inventory & Endpoint Mapping

### 1.1 API Routes
- **`server/routes/showRoutes.js` (Line 29)**: `showRouter.get('/hero', getHomeHero)` — Public Home Hero endpoint.
- **`server/routes/adminRoutes.js` (Lines 24–28)**:
  - Line 24: `adminRouter.get('/hero', protectAdmin, getHeroSettings)` — Fetches admin hero config & rotation state.
  - Line 25: `adminRouter.put('/hero', protectAdmin, updateHeroSettings)` — Updates hero mode and manual selections.
  - Line 26: `adminRouter.post('/hero/randomize', protectAdmin, randomizeHeroAction)` — Re-randomizes active 5-movie subset from auto-rotation pool.
  - Line 27: `adminRouter.post('/hero/refresh', protectAdmin, refreshHeroRotationAction)` — Triggers manual hero batch refresh.
  - Line 28: `adminRouter.put('/hero/sound', protectAdmin, updateHeroSoundAction)` — Updates default sound preferences.

### 1.2 Controllers & Handlers
- **`server/controllers/showController.js` (Lines 108–140)**:
  `createGetHomeHeroHandler` handles `GET /api/show/hero`:
  - Calls `getPublicHomeHero()` service.
  - Computes ETag via `createHeroEtag(payload)`.
  - Sets HTTP cache headers (`Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=86400`).
  - Returns HTTP 304 if `If-None-Match` header matches ETag.
  - Returns JSON payload: `version`, `batchId`, `batchKey`, `generatedAt`, `nextRefreshAt`, `timezone`, `settings`, `movies`, `rotation`, `cache`.
  - **Identified Gap**: Line 123 filters response fields and omits `meta: payload.meta`.
- **`server/controllers/adminController.js` (Lines 81–98)**:
  - `getHeroSettings` (Line 81): Calls `getAdminHomeHero()` and returns `{ success: true, hero }`.
  - `updateHeroSettings` (Line 91): Calls `updateHomeHero(req.body)` and returns `{ success: true, message, settings }`.

### 1.3 Core Backend Services
- **`server/services/heroService.js`**:
  - `getHomeHeroConfig` (Lines 49–72): Retrieves/upserts `SiteConfig` document (`key: 'homeHero'`). Returns mode (`'auto'` | `'manual'`), `movieIds`, sound settings.
  - `getPublicHomeHero` (Lines 78–80): Calls `getPublicHeroRotation()`.
  - `getAdminHomeHero` (Lines 105–120): Queries rotation state (`getAdminHeroRotation`), hero config (`getHomeHeroConfig`), available movies (`getLegacyAvailableMovies`), and manual selection (`loadMoviesByIds`).
  - `updateHomeHero` (Lines 125–186): Validates inputs, updates `SiteConfig`, increments cache generation, invalidates Redis caches, and returns updated settings.
- **`server/services/heroRotationService.js`**:
  - `getPublicHeroRotation` (Lines 691–726): If `mode === 'manual'`, calls `loadManualPayload()`. Otherwise, loads active `HeroRotationBatch` and calls `toPublicPayload()`.
  - `loadManualPayload` (Lines 592–632): Constructs manual mode response with 5 ordered movies and metadata (`meta`).
  - `validateNativeHeroMovie` (Lines 298–358): Validates movie trailer status (`heroVideoStatus === 'ready'`), URL protocol, allowed host, MIME type, duration, dimensions, bytes, codecs, version, and verification timestamp.
  - `toPublicPayload` (Lines 530–590): Normalizes active auto-rotation batch into public payload format.
  - `loadPosterOnlyFallback` (Lines 634–689): Fallback payload returning 5 poster-only movies when active auto-rotation batch is missing or invalid.
  - `createHeroEtag` (Lines 728–746): Generates SHA-256 ETag from batch identity, version, movie IDs/video versions, and sound settings.
  - `invalidateHeroCaches` (Lines 933–937): Deletes Redis cache keys `heroActivePattern()`, `homeHero()`, `homeHeroPattern()`.
  - `bumpHeroCacheGeneration` (Lines 939–946): Increments `heroRotation.cacheGeneration` integer in `SiteConfig`.

### 1.4 Mongoose Models & Schemas
- **`server/models/SiteConfig.js` (Lines 8–57)**:
  - `homeHero.mode`: String enum `['auto', 'manual']`, default `'auto'`.
  - `homeHero.movieIds`: Array of String IDs for manual selection (max 5).
  - `homeHero.heroSoundDefaultEnabled`: Boolean.
  - `homeHero.heroDefaultVolume`: Number (0–1).
  - `heroRotation.activeBatchId`: ObjectId reference to `HeroRotationBatch`.
  - `heroRotation.cacheGeneration`: Integer counter for invalidating cached payloads.
- **`server/models/HeroRotationBatch.js` (Lines 34–169)**:
  - Auto-rotation batch model containing status (`'building'|'active'|'retired'|'failed'`), 15-movie pool (`movieIds`), active 5-movie subset (`activeHeroMovieIds`), categories (`newestMovieIds`, `hotMovieIds`, `discoveryMovieIds`), `version`, `fencingToken`, and `batchKey`.
- **`server/models/Movie.js` (Lines 20–38)**:
  - Native video metadata fields: `heroVideoStatus`, `heroVideoUrl`, `heroVideoMimeType`, `heroVideoPosterUrl`, `heroVideoVersion`, `heroVideoDuration`, `heroVideoWidth`, `heroVideoHeight`, `heroVideoBytes`, `heroVideoCodec`, `heroVideoVerifiedAt`.

### 1.5 Caching & Redis Integration
- **`server/services/redisKeys.js` (Lines 46–52)**:
  - `heroActive`: `nitrocine:v1:hero:active:<batchId>:<version>:<generation>`
  - `heroLastGood`: `nitrocine:v1:hero:last-good`
  - `homeHero`: `nitrocine:v1:cache:hero:home`
  - `homeHeroPattern`: `nitrocine:v1:cache:hero:home:*`

---

## 2. Requirement Gaps & Technical Analysis

### 2.1 Manual Mode (R3 Requirements)
1. **Auto-Rotation Bypass & Exact 5 Movie Order**:
   - `getPublicHeroRotation` (`heroRotationService.js` Line 693) correctly routes to `loadManualPayload` when `configuredMode === 'manual'`.
   - `loadManualPayload` preserves the exact 5 saved movie IDs in order and returns normalized movie objects with native video status (`heroVideoStatus === 'ready'`).
2. **`updateHomeHero` Validation & Error Handling (HTTP 422)**:
   - **Current Implementation (`heroService.js` Lines 133–139)**:
     ```javascript
     if (nextMode === 'manual') {
         if (ids.length !== HERO_LIMIT) {
             throw createHttpError(400, 'Manual hero selection requires exactly five unique movies.');
         }
         const count = await Movie.countDocuments({ _id: { $in: ids } });
         if (count !== ids.length) throw createHttpError(400, 'One or more selected movies no longer exist.');
     }
     ```
   - **Defects Identified**:
     - Status Code: Throws HTTP 400 instead of required HTTP 422 (`Unprocessable Entity`).
     - Validation Depth: Checks DB existence (`countDocuments`), but fails to verify `heroVideoStatus === 'ready'` and native trailer completeness (`validateNativeHeroMovie`).
     - Atomicity: Validation must run *before* `SiteConfig.findOneAndUpdate`. If validation fails, `SiteConfig` remains untouched.
3. **`getAdminHomeHero` Return Structure**:
   - **Current Implementation (`heroService.js` Lines 105–120)**:
     ```javascript
     return { settings, selectedMovies, availableMovies, rotation };
     ```
   - **Defects Identified**:
     - Missing explicit `liveMovies` field (representing current public payload returned to users).
     - Missing explicit `manualSelection` field (containing `movieIds` and populated movie details).
     - Standard R3 requirement expects `{ liveMovies, manualSelection, rotation }`.

### 2.2 Backend Identity & Refetch Discipline (R4 Requirements)
1. **Response `meta` Field Preservation**:
   - `heroRotationService.js` generates `meta` in `toPublicPayload` (Line 579), `loadManualPayload` (Line 621), and `loadPosterOnlyFallback` (Line 678) containing:
     - `configuredMode`: `'manual'` | `'auto'`
     - `effectiveMode`: `'manual'` | `'auto'` | `'poster-only'`
     - `source`: `'manual-selection'` | `'auto-rotation'` | `'poster-fallback'`
     - `version`: integer version
     - `buildSha`: `process.env.BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'dev-local'`
     - `deploymentId`: `process.env.VERCEL_DEPLOYMENT_ID || 'local-dev'`
     - `environment`: `process.env.NODE_ENV || 'development'`
   - **Defect Identified (`showController.js` Line 123)**:
     `createGetHomeHeroHandler` explicitly shapes the output object returned by `GET /api/show/hero` and **omits `meta`**:
     ```javascript
     return res.json({
         success: true,
         version: payload.version,
         batchId: payload.batchId,
         batchKey: payload.batchKey,
         generatedAt: payload.generatedAt,
         nextRefreshAt: payload.nextRefreshAt,
         timezone: payload.timezone,
         settings: payload.settings,
         movies: payload.movies,
         rotation: payload.rotation,
         // MISSING: meta: payload.meta
         cache: payload.cache,
     });
     ```
2. **Admin Save Atomicity & Immediate Refetch**:
   - `updateHomeHero` updates `SiteConfig`, calls `bumpHeroCacheGeneration()`, and calls `invalidateHeroCaches()`.
   - **Defect Identified**: `updateHomeHero` does not trigger an immediate `getPublicHomeHero()` GET refetch to warm Redis cache and compute the newly invalidated ETag before completing the HTTP response.

---

## 3. Backend Refactoring Strategy

### Strategy Component 1: Update `server/services/heroService.js`
1. **Refactor `updateHomeHero`**:
   - When `nextMode === 'manual'`, fetch all candidate movies matching `ids`:
     ```javascript
     const movies = await Movie.find({ _id: { $in: ids } }).select(MOVIE_SELECT).lean();
     ```
   - Validate that:
     1. `ids.length === 5` and all 5 IDs are unique.
     2. `movies.length === 5` (all 5 exist in database).
     3. Every movie has `heroVideoStatus === 'ready'` and passes `validateNativeHeroMovie(movie).valid`.
   - If any validation check fails, throw `createHttpError(422, 'Manual hero selection requires exactly five unique movies with ready native video trailers.')`.
   - Execute `SiteConfig.findOneAndUpdate(...)` to persist mode and movieIds atomically.
   - Call `await bumpHeroCacheGeneration()`.
   - Call `await invalidateHeroCaches()`.
   - Trigger `await getPublicHomeHero()` immediately to perform an active refetch/warming of Redis and memory cache.
   - Return response containing settings and safety-checked `meta`.

2. **Refactor `getAdminHomeHero`**:
   - Retrieve public live state: `const live = await getPublicHomeHero();`
   - Retrieve manual selection movies: `const manualMovies = await loadMoviesByIds(settings.movieIds);`
   - Retrieve rotation state: `const rotation = await getAdminHeroRotation();`
   - Return aligned structure:
     ```javascript
     return {
         settings,
         liveMovies: live.movies || [],
         manualSelection: {
             movieIds: settings.movieIds,
             movies: manualMovies.map((movie) => normalizeHeroMovie(movie)),
         },
         rotation,
         selectedMovies: manualMovies.map((movie) => normalizeHeroMovie(movie)),
         availableMovies: rotation.pool || [],
     };
     ```

### Strategy Component 2: Update `server/controllers/showController.js`
- Update `createGetHomeHeroHandler` at Line 123 to include `meta: payload.meta`:
  ```javascript
  return res.json({
      success: true,
      version: payload.version,
      batchId: payload.batchId,
      batchKey: payload.batchKey,
      generatedAt: payload.generatedAt,
      nextRefreshAt: payload.nextRefreshAt,
      timezone: payload.timezone,
      settings: payload.settings,
      movies: payload.movies,
      rotation: payload.rotation,
      meta: payload.meta,
      cache: payload.cache,
  });
  ```

---

## 4. Summary of Targeted Files
1. `server/controllers/showController.js` (Include `meta` in response JSON)
2. `server/services/heroService.js` (Validate 5 native-ready movies with HTTP 422, populate `liveMovies` & `manualSelection` in admin output, trigger immediate refetch on admin save)
