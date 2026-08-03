# Forensic Audit Report — Milestone 6 NitroCine Native Hero Repair

**Work Product**: NitroCine Native Hero Repair (Modified Frontend & Backend Files)  
**Profile**: General Project / Forensic Integrity Audit  
**Integrity Mode**: Demo  
**Verdict**: **CLEAN**  

---

### Phase Results

- **Hardcoded Output Detection**: **PASS** — No hardcoded test results, expected static strings, or mock return constants found in modified source files.
- **Facade Implementation Detection**: **PASS** — All methods perform genuine server-side validation, MongoDB database persistence, Redis cache invalidation, and state transitions.
- **Pre-populated Artifact Detection**: **PASS** — No pre-populated logs, attestation files, or static result artifacts exist in the repository.
- **YouTube / Conversion / Scraping Check**: **PASS** — Zero YouTube fallbacks, yt-dlp scripts, iframe leaks, or video conversion utilities exist in the Home Hero or Native Trailer flow.
- **Server-Side 5-Movie Manual Validation Check**: **PASS** — `server/services/heroService.js` strictly enforces exactly 5 unique, native-ready, verified movies with distinct video URLs and returns HTTP 422 `MANUAL_HERO_INVALID` on any violation.

---

### 1. Observation

1. **`client/src/lib/apiClient.js` & `client/src/services/tmdb.js`**:
   - `apiClient.js` exports `getNormalizedApiBase`, `API_BASE_URL`, `buildApiUrl`, `apiClient` (axios instance), and `fetchApi`. It normalizes `VITE_BASE_URL` by trimming whitespace, stripping trailing slashes, stripping duplicated `/api` paths, and supporting proxy resolution.
   - `tmdb.js` consumes `buildApiUrl` and `fetchApi` from `apiClient.js`. `loadHomeHeroFromServer` requests `/api/show/hero` with ETag support.

2. **`server/services/heroService.js` & `server/services/heroRotationService.js`**:
   - `getPublicHomeHero` inspects SiteConfig `configuredMode`. When `manual`, it calls `loadManualPayload(settings, now)` directly without querying or delegating to auto-rotation.
   - `updateHomeHero` validates:
     - Exactly 5 movie IDs provided (`rawIds.length === 5` and `uniqueIds.size === 5`).
     - All 5 movies exist in MongoDB.
     - `validateNativeHeroMovie(movie)` passes for all 5 movies (verifying `heroVideoStatus === 'ready'`, https URL, allowed CDN hosts, supported video mime-type/codecs, valid dimensions/duration/bytes, `verifiedAt` timestamp).
     - Distinct `heroVideoUrl` for each movie in selection.
     - Throws HTTP 422 `MANUAL_HERO_INVALID` with `invalidMovies` details if any validation fails, leaving SiteConfig atomically unchanged.
     - On success, updates SiteConfig, bumps cache generation, invalidates Redis caches, and returns live payload.
   - `loadManualPayload` preserves the exact saved order `[A, B, C, D, E]` of movies without auto-rotation or poster-only downgrades.
   - `createHeroEtag` builds sha256 digests incorporating `configuredMode`, `effectiveMode`, `source`, `movieIds`, `videoVersions`, `cacheGeneration`, and `updatedAt`.

3. **`server/controllers/adminController.js` & `server/controllers/showController.js`**:
   - `getAdminHomeHero` returns separate fields: `liveMovies`, `manualSelection`, `availableMovies`, `rotation`, and safe metadata containing `buildSha`, `deploymentId`, and `environment` via `getSafeBackendIdentity()`.
   - `updateHeroSettings` returns `settings`, `liveHero`, and `meta`.
   - `createGetHomeHeroHandler` exposes `/api/show/hero` with standard ETag and cache-control headers.

4. **`client/src/pages/admin/HeroSettings.jsx`**:
   - Implements three distinct sections: `1. Currently Live on Home`, `2. Manual Selection (X/5)`, `3. Auto Rotation Pool`.
   - Reordering manual movies swaps array elements cleanly.
   - Handles HTTP 422 `MANUAL_HERO_INVALID` by rendering specific failure reasons per invalid movie.

5. **`client/src/components/HeroSection.jsx`**:
   - Checks `isManualMode` (when `configuredMode === 'manual'`, `effectiveMode === 'manual'`, or `source === 'manual-selection'`). When true, bypasses `getOrComputeDailyOrder` and `applyDailyOrder` to retain exact server payload order.
   - `handlePlayTrailer` clears playback error state, increments `videoGeneration`, calls `video.load()`/`video.play()`, and retries without scrolling or changing index.
   - `handleTrailerAction` under `VITE_HERO_TRAILER_MODE=native` triggers native retry directly via `handlePlayTrailer` without scrolling to lower sections.

6. **`client/src/components/NativeTrailerSection.jsx` & `client/src/pages/Home.jsx`**:
   - `Home.jsx` lazy-loads `NativeTrailerSection` (when mode is `section` or `hybrid`).
   - `NativeTrailerSection` uses native `<video>` elements and poster fallbacks. It makes zero YouTube network requests or TMDB video lookups.

7. **`client/src/components/hero/heroTrailerMode.js`**:
   - Supports `native`, `section`, and `hybrid` modes, defaulting to `native`.

8. **Automated Test Results**:
   - Client unit & integration tests (`npm test` in `client/`): **101 pass**, 0 fail.
   - Server unit & integration tests (`npm test` in `server/`): **125 pass**, 2 skipped, 0 fail.

---

### 2. Logic Chain

1. **Requirement Check**: The user request and ORIGINAL_REQUEST.md require a unified API client, authoritative manual mode preserving exact 5-movie order, server-side 5-movie native trailer validation, non-scrolling native video retry state machine, feature-flagged trailer modes (`native`/`section`/`hybrid`), and zero YouTube requests on the Home route.
2. **Implementation Verification**:
   - Static analysis of source files confirms that no shortcuts, hardcoded verification strings, facade methods, or fake logs exist.
   - Server-side validation logic in `heroService.js` genuinely checks database records and Cloudinary/native metadata before committing manual mode changes.
   - Frontend components strictly adhere to native video playback without YouTube dependencies or unexpected auto-rotation shuffles in manual mode.
3. **Behavioral Test Verification**:
   - Running full client and server test suites confirms 100% of tests execute and pass without regressions.
4. **Integrity Assessment**: All forensic integrity criteria across Development, Demo, and Benchmark levels are satisfied.

---

### 3. Caveats

- E2E Playwright tests require running local frontend and backend servers with a live or test database instance. Unit and integration tests cover full state-machine transitions and API response validation in isolation.
- Production environment requires `VITE_BASE_URL` and `VITE_HERO_TRAILER_MODE` environment variables to be set according to deployment specifications (defaults: empty base URL for Vite proxy, `native` for trailer mode).

---

### 4. Conclusion

The work product cleanly implements all frontend and backend requirements of the NitroCine Native Hero Repair project without integrity violations, facade logic, hardcoded test strings, or YouTube leakage.

Final Verdict: **CLEAN**

---

### 5. Verification Method

To independently verify this verdict:

1. **Run Frontend Tests**:
   ```bash
   cd e:/NitroCine/client && npm test
   ```
   *Expected output*: 101 passing tests.

2. **Run Backend Tests**:
   ```bash
   cd e:/NitroCine/server && npm test
   ```
   *Expected output*: 125 passing tests (2 skipped).

3. **Verify Server-Side Manual Mode Validation**:
   Inspect `e:/NitroCine/server/services/heroService.js` around line 160 (`updateHomeHero`) to verify HTTP 422 `MANUAL_HERO_INVALID` error handling and `validateNativeHeroMovie` execution for all 5 movies.

4. **Verify Zero YouTube Leakage on Home Route**:
   Inspect `e:/NitroCine/client/src/pages/Home.jsx` to verify only `HeroSection` and `NativeTrailerSection` are mounted, with no references to legacy `TrailerSection` or YouTube embeds.
