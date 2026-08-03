# Handoff Report — Milestone 2: Backend Authoritative Manual Mode & Validation

## 1. Observation

### 1.1 `server/services/heroService.js`
- **Current Flow of `getPublicHomeHero()`** (Line 79):
  ```js
  export const getPublicHomeHero = async (options = {}) => getPublicHeroRotation({
      now: options.now ? new Date(options.now) : new Date(),
  });
  ```
  `getPublicHomeHero()` delegates unconditionally to `getPublicHeroRotation()`. While `getPublicHeroRotation()` checks `settings.mode === 'manual'`, Section 5.1 mandates that `getPublicHomeHero()` explicitly check `getHomeHeroConfig()` first: if `configuredMode === 'manual'`, call canonical manual payload builder; otherwise call `getPublicHeroRotation()`.
- **Current Behavior of `getAdminHomeHero()`** (Lines 106–128):
  ```js
  export const getAdminHomeHero = async () => {
      const [rotation, settings, availableMovies, publicPayload] = await Promise.all([
          getAdminHeroRotation(),
          getHomeHeroConfig(),
          getLegacyAvailableMovies(),
          getPublicHomeHero(),
      ]);
      const rawManualMovies = await loadMoviesByIds(settings.movieIds);
      const manualMoviesNormalized = rawManualMovies.map((movie) => normalizeHeroMovie(movie));
      const liveMovies = publicPayload?.movies || [];
      const manualSelection = {
          movieIds: settings.movieIds,
          movies: manualMoviesNormalized,
      };
      return {
          settings,
          liveMovies,
          manualSelection,
          selectedMovies: manualMoviesNormalized,
          availableMovies,
          rotation,
      };
  };
  ```
  It returns `settings`, `liveMovies`, `manualSelection`, `selectedMovies`, `availableMovies`, and `rotation`. However, it lacks root-level `meta` containing the safe backend identity (`configuredMode`, `effectiveMode`, `source`, `version`, `buildSha`, `deploymentId`, `environment`). Also `settings` currently only returns `mode`, not explicit `configuredMode` and `effectiveMode`.
- **Current Validation in `updateHomeHero()`** (Lines 133–207):
  ```js
  if (nextMode === 'manual') {
      if (rawIds.length !== HERO_LIMIT || uniqueIds.size !== HERO_LIMIT) {
          throw createHttpError(422, 'Manual hero selection requires exactly five unique movies with ready native video trailers.');
      }
      const movies = await Movie.find({ _id: { $in: ids } }).select(MOVIE_SELECT).lean();
      if (movies.length !== HERO_LIMIT) {
          throw createHttpError(422, 'Manual hero selection requires exactly five unique movies with ready native video trailers.');
      }
      const allReady = movies.every(
          (movie) => movie.heroVideoStatus === 'ready' && validateNativeHeroMovie(movie).valid,
      );
      if (!allReady) {
          throw createHttpError(422, 'Manual hero selection requires exactly five unique movies with ready native video trailers.');
      }
  }
  ```
  Validation throws a generic 422 error without `code: "MANUAL_HERO_INVALID"` or detailed `invalidMovies` reasons (such as `movie-not-found`, `status-not-ready`, `not-verified`, `duplicate-video-url`, etc.).
  Atomic preservation holds because validation occurs before `SiteConfig.findOneAndUpdate(...)`, but error reporting is incomplete.

### 1.2 `server/services/heroRotationService.js`
- **Current `loadManualPayload()`** (Lines 592–632):
  Loads ordered movies with `loadOrderedMovies(settings.movieIds)` which preserves original array order via `ids.map((id) => byId.get(id))`.
  Returns `settings.mode = 'manual'`, `settings.configuredMode = 'manual'`, `settings.effectiveMode = 'manual'`, `meta.source = 'manual-selection'`.
  Does not include `cacheGeneration` or `validateNativeHeroMovie()` check on every movie in the manual selection.
- **Current `createHeroEtag()`** (Lines 728–746):
  ```js
  export const createHeroEtag = (payload) => {
      const identity = JSON.stringify({
          batchId: payload?.batchId || 'poster',
          version: payload?.version ?? 0,
          dateKey: payload?.dateKey || '',
          dailyEntropy: payload?.dailyEntropy || '',
          movies: (payload?.movies || []).map((movie) => ({
              id: movie.id || movie._id,
              videoVersion: movie.heroVideoVersion || '',
          })),
          sound: payload?.settings?.heroSoundDefaultEnabled,
          volume: payload?.settings?.heroDefaultVolume,
          settingsUpdatedAt: payload?.settings?.updatedAt || null,
          generatedAt: payload?.generatedAt || null,
          nextRefreshAt: payload?.nextRefreshAt || null,
      });
      const digest = createHash('sha256').update(identity).digest('hex').slice(0, 24);
      return `"hero-${digest}"`;
  };
  ```
  Does NOT include `configuredMode`, `effectiveMode`, `source`, or `cacheGeneration`. If mode changes between `auto` and `manual` while batch ID and movie list remain unchanged, the ETag could collide.

### 1.3 `server/controllers/adminController.js`
- **Current `updateHeroSettings()`** (Lines 91–98):
  ```js
  export const updateHeroSettings = async (req,res) =>{
      try {
          const settings = await updateHomeHero(req.body || {});
          res.json({success:true,message:"Hero updated successfully.",settings});
      } catch (error) {
          return res.status(error.status || 500).json({ success: false, message: error.message });
      }
  }
  ```
  Does not include `liveHero` or `meta` in the success response payload. On failure, does not pass `code` or `invalidMovies`.

### 1.4 `server/controllers/showController.js`
- **Current `createGetHomeHeroHandler()`** (Lines 108–141):
  Returns `success`, `version`, `batchId`, `batchKey`, `generatedAt`, `nextRefreshAt`, `timezone`, `settings`, `movies`, `rotation`, `meta`, `cache`.
  Uses ETag from `createHeroEtag` and handles HTTP 304 Not Modified.

### 1.5 `server/tests/`
- Existing backend test files: `heroService.test.js`, `heroController.test.js`, `heroRotationService.test.js`, `heroRotationModel.test.js`, `heroVideoService.test.js`.
- Current tests cover basic R2 and R3 capabilities but need expansion to assert HTTP 422 `MANUAL_HERO_INVALID` response structure (`code`, `invalidMovies`), ETag sensitivity to mode changes, Redis cache invalidation, and backend identity parity.

---

## 2. Logic Chain

1. **Explicit Mode Selection Flow in `getPublicHomeHero()`**:
   - Reading `SiteConfig` first allows `getPublicHomeHero()` to evaluate `configuredMode` before choosing the execution path.
   - If `configuredMode === 'manual'`, call `loadManualPayload(settings, now)` directly.
   - If `configuredMode === 'auto'`, call `getPublicHeroRotation({ now })`.
   - This satisfies Section 5.1: auto-rotation is bypassed entirely when configured mode is manual.

2. **Canonical Manual Payload Construction**:
   - `loadManualPayload(settings, now)` accepts 5 ordered IDs.
   - `loadOrderedMovies(movieIds)` fetches movies via MongoDB `$in` and restores the exact input order.
   - Normalization uses `normalizeHeroMovie(movie, { posterOnly: false })`, preserving all native video fields (`heroVideoUrl`, `heroVideoMimeType`, `heroVideoPosterUrl`, `heroVideoStatus`, `heroVideoVersion`, `heroVideoMetadata`).
   - `settings` exposes `mode: 'manual'`, `configuredMode: 'manual'`, `effectiveMode: 'manual'`.
   - `meta` exposes `configuredMode`, `effectiveMode`, `source: 'manual-selection'`, `version: 1`, `cacheGeneration`, and safe backend identity (`buildSha`, `deploymentId`, `environment`).

3. **5-Movie Validation & HTTP 422 `MANUAL_HERO_INVALID`**:
   - In `updateHomeHero()`, when `mode === 'manual'`:
     - Sanitize array: trim IDs, filter empty entries.
     - Require `rawIds.length === 5` and `uniqueIds.size === 5`.
     - Load movies from DB via `Movie.find({ _id: { $in: ids } })`.
     - Validate each movie document using `validateNativeHeroMovie(movie)`.
     - Check for distinct native video URLs (`heroVideoUrl`) across the 5 movies.
     - Collect per-movie failures into an `invalidMovies` array of shape: `{ movieId, title, reasons: [...] }`.
     - If `invalidMovies` is non-empty, throw an error with `status: 422`, `code: 'MANUAL_HERO_INVALID'`, `message: 'All five Manual Hero movies require verified native trailers.'`, and `invalidMovies`.
   - Validation occurs BEFORE any update to `SiteConfig`, ensuring atomic preservation of the live configuration if validation fails.

4. **Admin Response Contract**:
   - In `getAdminHomeHero()`:
     - Return `settings` with explicit `configuredMode` and `effectiveMode`.
     - Return `liveMovies` (effective live movies currently served to public).
     - Return `manualSelection` (`{ movieIds, movies }` preserving exact saved order).
     - Return `rotation` (auto pool & active batch info).
     - Return `meta` with safe backend identity matching public responses.
   - In `updateHeroSettings()` controller action:
     - Return `{ success: true, message: "Hero updated successfully.", settings, liveHero, meta }`.
     - On error (e.g. 422), return `{ success: false, code: error.code, message: error.message, invalidMovies: error.invalidMovies }`.

5. **ETag Sensitivity**:
   - Include `configuredMode`, `effectiveMode`, `source`, and `cacheGeneration` in `createHeroEtag()`.
   - When mode changes (e.g. `auto` -> `manual`), order changes, or cache generation bumps, ETag hash changes, forcing clients to re-fetch without manual browser cache clearing.

6. **Redis Cache Invalidation**:
   - On successful manual save, call `bumpHeroCacheGeneration()` and `invalidateHeroCaches()`.
   - Next GET `/api/show/hero` yields the newly persisted manual selection immediately.

---

## 3. Caveats

- **Native Media Dependency**: Manual activation strictly requires 5 valid native MP4/WebM movies in the database (`heroVideoStatus === 'ready'` with passing `validateNativeHeroMovie()`). If test databases lack 5 seeded native movies, test fixtures must mock or seed them.
- **Frontend Alignment**: Milestone 2 targets backend authoritative mode and API contracts. Milestone 3/4 frontend tasks must consume the exact payload shapes specified here.
- **Read-Only Scope**: This report is produced under read-only exploration guidelines; no production files outside of `.agents/explorer_m2_1/` have been modified during this phase.

---

## 4. Conclusion

A complete, robust implementation plan for Milestone 2 has been designed. Below are the precise technical specifications for each file to be modified by implementers.

### 4.1 Specification for `server/services/heroService.js`
1. **Helper Function `getSafeBackendIdentity()`**:
   ```js
   export const getSafeBackendIdentity = () => ({
       buildSha: String(process.env.BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'dev-local'),
       deploymentId: String(process.env.VERCEL_DEPLOYMENT_ID || 'local-dev'),
       environment: process.env.NODE_ENV || 'development',
   });
   ```
2. **`getHomeHeroConfig()`**:
   Ensure returned settings object contains:
   ```js
   {
       mode: config?.homeHero?.mode === 'manual' ? 'manual' : 'auto',
       configuredMode: config?.homeHero?.mode === 'manual' ? 'manual' : 'auto',
       effectiveMode: config?.homeHero?.mode === 'manual' ? 'manual' : 'auto',
       movieIds: sanitizeMovieIds(config?.homeHero?.movieIds),
       heroSoundDefaultEnabled: Boolean(config?.homeHero?.heroSoundDefaultEnabled),
       heroDefaultVolume: Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 1) : defaultVolume,
       updatedAt: config?.updatedAt || null,
   }
   ```
3. **`getPublicHomeHero()`**:
   ```js
   export const getPublicHomeHero = async (options = {}) => {
       const settings = await getHomeHeroConfig();
       const now = options.now ? new Date(options.now) : new Date();
       if (settings.configuredMode === 'manual') {
           return loadManualPayload(settings, now);
       }
       return getPublicHeroRotation({ now });
   };
   ```
4. **`updateHomeHero()`**:
   - If `nextMode === 'manual'`:
     - Sanitize `rawIds` from `movieIds`.
     - Initialize `invalidMovies = []`.
     - If `rawIds.length !== 5` or `new Set(rawIds).size !== 5`:
       - Throw HTTP 422 error with `code: 'MANUAL_HERO_INVALID'`, `message: 'All five Manual Hero movies require verified native trailers.'`, `invalidMovies`.
     - Load movies: `const loadedMovies = await Movie.find({ _id: { $in: ids } }).select(MOVIE_SELECT).lean();`
     - Build map `byId = new Map(loadedMovies.map(m => [String(m._id), m]))`.
     - For each `id` of the 5 `ids`:
       - If `!byId.has(id)`: add `{ movieId: id, title: 'Unknown', reasons: ['movie-not-found'] }` to `invalidMovies`.
       - Else:
         - `const movie = byId.get(id);`
         - `const val = validateNativeHeroMovie(movie);`
         - If `!val.valid`: add `{ movieId: id, title: movie.title || 'Untitled', reasons: val.reasons }` to `invalidMovies`.
     - Check duplicate `heroVideoUrl`:
       - `const urls = ids.map(id => String(byId.get(id)?.heroVideoUrl || ''));`
       - Identify duplicate URLs and add `duplicate-video-url` to affected movies in `invalidMovies`.
     - If `invalidMovies.length > 0`:
       - Throw error:
         ```js
         const error = new Error('All five Manual Hero movies require verified native trailers.');
         error.status = 422;
         error.statusCode = 422;
         error.code = 'MANUAL_HERO_INVALID';
         error.invalidMovies = invalidMovies;
         throw error;
         ```
   - On validation success:
     - Update `SiteConfig` for `homeHero.mode` and `homeHero.movieIds`.
     - Call `bumpHeroCacheGeneration()` and `invalidateHeroCaches()`.
     - Fetch `livePayload = await getPublicHomeHero()`.
     - Return `{ settings, liveHero: livePayload, meta: livePayload.meta }`.
5. **`getAdminHomeHero()`**:
   - Fetch `[rotation, settings, availableMovies, publicPayload]`.
   - `rawManualMovies = await loadMoviesByIds(settings.movieIds)`.
   - `manualMoviesNormalized = rawManualMovies.map(movie => normalizeHeroMovie(movie))`.
   - Return `{ settings, liveMovies: publicPayload?.movies || [], manualSelection: { movieIds: settings.movieIds, movies: manualMoviesNormalized }, selectedMovies: manualMoviesNormalized, availableMovies, rotation, meta: { configuredMode: settings.configuredMode, effectiveMode: publicPayload?.settings?.effectiveMode || settings.effectiveMode, source: settings.configuredMode === 'manual' ? 'manual-selection' : 'auto-rotation', version: publicPayload?.version || 1, cacheGeneration: publicPayload?.meta?.cacheGeneration || 0, ...getSafeBackendIdentity() } }`.

### 4.2 Specification for `server/services/heroRotationService.js`
1. **`loadManualPayload()`**:
   - Load ordered movies: `rawMovies = await loadOrderedMovies(settings.movieIds)`.
   - Fetch current `SiteConfig` for `heroRotation.cacheGeneration`.
   - Return payload:
     ```js
     {
         version: 1,
         batchId: 'manual',
         batchKey: `manual-${dateKey}`,
         generatedAt: settings.updatedAt || now,
         nextRefreshAt: window.nextRefreshAt,
         timezone: window.timezone,
         dateKey,
         dailyEntropy: 'manual',
         settings: {
             mode: 'manual',
             configuredMode: 'manual',
             effectiveMode: 'manual',
             heroSoundDefaultEnabled: settings.heroSoundDefaultEnabled,
             heroDefaultVolume: settings.heroDefaultVolume,
             updatedAt: settings.updatedAt,
         },
         movies: rawMovies.map((movie) => normalizeHeroMovie(movie, { posterOnly: false })),
         rotation: {
             key: `manual-${dateKey}`,
             startsAt: window.startsAt,
             endsAt: window.nextRefreshAt,
             batchSize: rawMovies.length,
             poolSize: rawMovies.length,
         },
         meta: {
             configuredMode: 'manual',
             effectiveMode: 'manual',
             source: 'manual-selection',
             version: 1,
             cacheGeneration: cacheGen,
             ...getSafeBackendIdentity(),
         },
         cache: 'manual',
     }
     ```
2. **`createHeroEtag()`**:
   Update hash identity to include:
   ```js
   const identity = JSON.stringify({
       configuredMode: payload?.settings?.configuredMode || payload?.settings?.mode || 'auto',
       effectiveMode: payload?.settings?.effectiveMode || payload?.meta?.effectiveMode || 'auto',
       source: payload?.meta?.source || 'auto-rotation',
       batchId: payload?.batchId || 'poster',
       version: payload?.version ?? 0,
       cacheGeneration: payload?.meta?.cacheGeneration ?? 0,
       dateKey: payload?.dateKey || '',
       dailyEntropy: payload?.dailyEntropy || '',
       movies: (payload?.movies || []).map((movie) => ({
           id: movie.id || movie._id,
           videoVersion: movie.heroVideoVersion || '',
       })),
       sound: payload?.settings?.heroSoundDefaultEnabled,
       volume: payload?.settings?.heroDefaultVolume,
       settingsUpdatedAt: payload?.settings?.updatedAt || null,
       generatedAt: payload?.generatedAt || null,
       nextRefreshAt: payload?.nextRefreshAt || null,
   });
   ```

### 4.3 Specification for `server/controllers/adminController.js`
1. **`updateHeroSettings()`**:
   ```js
   export const updateHeroSettings = async (req, res) => {
       try {
           const result = await updateHomeHero(req.body || {});
           return res.json({
               success: true,
               message: "Hero updated successfully.",
               settings: result.settings,
               liveHero: result.liveHero,
               meta: result.meta,
           });
       } catch (error) {
           return res.status(error.status || error.statusCode || 500).json({
               success: false,
               code: error.code || 'HERO_UPDATE_FAILED',
               message: error.message,
               invalidMovies: error.invalidMovies || undefined,
           });
       }
   };
   ```

### 4.4 Specification for `server/tests/heroService.test.js` & new backend tests
Add and update tests for:
- Manual public Hero bypassing active rotation and returning exact 5 ordered movies.
- `updateHomeHero` in manual mode rejecting invalid selections with HTTP 422, `code: 'MANUAL_HERO_INVALID'`, and `invalidMovies` details.
- ETag updating on mode change, movie reordering, and sound changes.
- Admin response contract checking separation of `liveMovies` and `manualSelection`.
- Redis cache invalidation and generation bumping.

---

## 5. Verification Method

To verify the implementation independently once code changes are made:

1. **Run Backend Hero Unit & Integration Tests**:
   ```bash
   node --test server/tests/heroService.test.js server/tests/heroController.test.js server/tests/heroRotationService.test.js
   ```
   *Expected result*: All tests pass with exit code 0.

2. **Verify 422 Invalid Manual Activation**:
   - Send PUT to `/api/admin/hero` with 4 movies or unready movies.
   - Response status must be `422 Unprocessable Entity`.
   - Response body must contain `code: "MANUAL_HERO_INVALID"` and `invalidMovies` array.

3. **Verify ETag Change on Order & Mode Change**:
   - Inspect ETag header on `GET /api/show/hero` in Auto mode.
   - Switch to Manual mode via PUT `/api/admin/hero`.
   - Perform `GET /api/show/hero` again and verify ETag value is updated.

4. **Verify Backend Identity Parity**:
   - Compare `meta` block in `GET /api/admin/hero` and `GET /api/show/hero`.
   - `buildSha`, `deploymentId`, and `environment` must be identical.
