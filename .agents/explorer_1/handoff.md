# Handoff Report — NitroCine Native Hero Production Repair Investigation

## 1. Observation

### API Infrastructure & Environment (`VITE_BASE_URL`, Axios, fetch):
- `client/.env.example` line 4 specifies `VITE_BASE_URL=http://localhost:3000`.
- `client/src/context/AppContext.jsx` lines 8-15 & line 16 define:
  ```javascript
  const getNormalizedApiBase = (url) => {
    let base = (url || '').trim().replace(/\/$/, '');
    if (base.endsWith('/api')) {
      base = base.slice(0, -4);
    }
    return base;
  };
  const baseURL = getNormalizedApiBase(import.meta.env.VITE_BASE_URL);
  const api = axios.create({ baseURL: baseURL });
  ```
- `client/src/services/tmdb.js` lines 16-23 define an identical `getNormalizedApiBase` function and set `const API_BASE = getNormalizedApiBase(runtimeEnv.VITE_BASE_URL);`.
- `client/src/components/hero/heroImages.js` line 5 defines `const runtimeApiBase = (import.meta.env?.VITE_BASE_URL || '').replace(/\/$/, '');` without handling trailing `/api`.
- `AppContext.jsx` line 141 exports `axios: api`. Context consumers include `ProfileContext.jsx` (L16), `MyBookings.jsx` (L18), `SeatLayout.jsx` (L107), `AddShows.jsx` (L11), `DashBoard.jsx` (L11), `HeroSettings.jsx` (L51), `HeroVideoUploader.jsx` (L42), `ListBookings.jsx` (L10), and `ListShows.jsx` (L10).
- `client/src/services/fetchWithTimeout.js` provides low-level `requestWithTimeout`. `tmdb.js` wraps this as `fetchWithTimeout` (L84) and `fetchBackendJson` (L88).
- `tests/apiClientConfig.test.js` lines 10-21 assert that `tmdb.js` derives `API_BASE` from `VITE_BASE_URL` using `getNormalizedApiBase` and `AppContext.jsx` creates Axios using `baseURL`.

### YouTube & Hero Component Audit:
- `client/src/pages/Home.jsx` line 11 imports `const TrailerSection = lazy(() => import('../components/TrailerSection'));` and line 63 renders `<TrailerSection sectionId="home-trailer-section" featuredMovie={requestedTrailerMovie} />`.
- `client/src/components/TrailerSection.jsx`:
  - Line 3 imports `fetchLatestTrailers, fetchMovieTrailers` from `../services/tmdb`.
  - Line 6 imports `CinematicTrailerPlayer`.
  - Line 7 imports `extractYouTubeVideoId` from `../lib/youtubeVideo`.
  - Line 30 executes `candidates.map(extractYouTubeVideoId).find(Boolean)`.
- `client/src/hooks/useYouTubePlayer.js` line 3 & 99 inject `<script src="https://www.youtube.com/iframe_api">`.
- `client/src/services/tmdb.js` line 249 calls `/api/show/tmdb/movie/${movieId}/videos` and lines 270-292 filter YouTube site videos, building `https://www.youtube.com/embed/${video.videoId}` and `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`.
- `client/src/components/hero/HeroVideoRenderer.jsx` line 46 renders `HeroNativeVideo` only when `source?.kind === 'native'`.
- `client/src/components/hero/heroVideoSource.js` line 47 & 71 (`isIframeVideoUrl`) explicitly reject YouTube URLs (`youtube.com`, `youtu.be`, `youtube-nocookie.com`).

### Daily Shuffle & Manual Mode Audit:
- `client/src/utils/heroDailyShuffle.js` lines 138-266 define `chooseNonRepeatingDailyOrder` and `getOrComputeDailyOrder`, performing a per-viewer Fisher-Yates shuffle stored in `nitrocine:hero-order-history`.
- `client/src/components/HeroSection.jsx` lines 430-445:
  ```javascript
  const viewerKey = getOrCreateAnonymousViewerId();
  const meta = data.meta || data;
  const dailyOrderIds = getOrComputeDailyOrder({
    movies: preparedMovies,
    meta: {
      dateKey: meta.dateKey || '',
      rotationVersion: String(meta.version ?? ''),
      dailyEntropy: meta.dailyEntropy || '',
    },
    viewerKey,
  });
  const shuffledMovies = dailyOrderIds.length > 0
    ? applyDailyOrder(preparedMovies, dailyOrderIds)
    : preparedMovies;
  ```
  `HeroSection.jsx` does NOT inspect `data.settings?.mode` or `meta.mode` for `'manual'`, causing manually configured movies to be shuffled unexpectedly.

---

## 2. Logic Chain

1. **API Client Centralization (R2)**:
   - *Observation*: `getNormalizedApiBase` is duplicated in `AppContext.jsx` (L8) and `tmdb.js` (L16), while `heroImages.js` (L5) has inconsistent trailing slash normalization.
   - *Reasoning*: Creating `client/src/lib/apiClient.js` exporting `getNormalizedApiBase`, `API_BASE`, `buildApiUrl()`, `apiClient` (shared Axios instance), and `fetchApi` wrapper centralizes all API base URL normalization, prevents future URL divergence, and cleans up duplication across `AppContext.jsx`, `tmdb.js`, and `heroImages.js`.
   - *Step-by-step*:
     a. `lib/apiClient.js` normalizes `VITE_BASE_URL` (handling trailing `/` and `/api`).
     b. `AppContext.jsx` imports `apiClient` and `getNormalizedApiBase` from `lib/apiClient.js`.
     c. `tmdb.js` imports `API_BASE`, `getNormalizedApiBase`, `buildApiUrl`, `fetchApi` from `lib/apiClient.js`.
     d. `heroImages.js` imports `API_BASE` from `lib/apiClient.js`.

2. **Zero-YouTube Guarantee on Home Route (R1)**:
   - *Observation*: `Home.jsx` (L11, L63) imports and renders `TrailerSection.jsx`. `TrailerSection.jsx` fetches YouTube videos via TMDB `/videos` API and injects `https://www.youtube.com/iframe_api` script via `useYouTubePlayer.js`.
   - *Reasoning*: To enforce zero YouTube network traffic, zero YouTube iframes, and zero TMDB `/videos` API calls on the Home route, `Home.jsx` must not execute legacy `TrailerSection`.
   - *Step-by-step*:
     a. Create `client/src/components/NativeTrailerSection.jsx` which renders native HTML5 video trailer cards using verified MP4/WebM sources (e.g. from Hero catalog or Now Showing movies).
     b. Update `Home.jsx` to replace `TrailerSection` with `NativeTrailerSection`: `const NativeTrailerSection = lazy(() => import('../components/NativeTrailerSection'));` and render `<NativeTrailerSection sectionId="home-trailer-section" featuredMovie={requestedTrailerMovie} />` inside `<DeferredSection anchorId="trailers">`.
     c. Keep `TrailerSection.jsx` in `client/src/components/TrailerSection.jsx` for non-Hero routes (such as `MovieDetails.jsx`), retaining contract test compliance for `heroTrailerRequestContract.test.js` and `homeEntryContract.test.js`.

3. **Manual Mode Daily Shuffle Bypass (R3)**:
   - *Observation*: In `HeroSection.jsx` (L430-445), `getOrComputeDailyOrder` is called unconditionally for every server payload, regardless of `mode: 'manual'`.
   - *Reasoning*: When manual mode is active (`mode === 'manual'`), the server returns exact manually selected 5 movies that must render in sequence without client-side shuffling.
   - *Step-by-step*:
     a. In `HeroSection.jsx`, check if `data.settings?.mode === 'manual'` or `meta.mode === 'manual'` or `meta.configuredMode === 'manual'` or `meta.effectiveMode === 'manual'`.
     b. If `isManualMode` is true, bypass `getOrComputeDailyOrder` (setting `dailyOrderIds = []`) so `shuffledMovies` remains `preparedMovies` in server order.
     c. In `utils/heroDailyShuffle.js`, add a defensive guard in `getOrComputeDailyOrder` to return un-shuffled IDs if `meta.mode === 'manual'`.

---

## 3. Caveats

- **Existing Test Contracts**: `tests/apiClientConfig.test.js` asserts exact string regexes in `services/tmdb.js` (`const API_BASE = getNormalizedApiBase(...)`) and `context/AppContext.jsx`. When refactoring, `tmdb.js` and `AppContext.jsx` must either re-export/use `getNormalizedApiBase` from `lib/apiClient.js` or `tests/apiClientConfig.test.js` should be updated to align with `lib/apiClient.js`.
- **Non-Hero Routes**: `MovieDetails.jsx` still imports `TrailerSection.jsx`. The zero-YouTube requirement (R1) is scoped specifically to the Home route (`client/src/pages/Home.jsx`).

---

## 4. Conclusion

1. Creating `client/src/lib/apiClient.js` fulfills R2 by providing unified base URL normalization, safe URL construction (`buildApiUrl`), a shared Axios instance (`apiClient`), and a fetch wrapper (`fetchApi`).
2. Creating `NativeTrailerSection.jsx` and importing it in `Home.jsx` fulfills R1 by eliminating legacy `TrailerSection` YouTube iframe/API execution on Home while maintaining anchor `#trailers`.
3. Adding a manual mode check (`isManualMode`) in `HeroSection.jsx` and `heroDailyShuffle.js` fulfills R3 by preserving server-specified manual movie ordering on Home.

---

## 5. Verification Method

### Test Commands:
```bash
# 1. API Client Config Test
node --test client/tests/apiClientConfig.test.js

# 2. Daily Shuffle Test
node --test client/tests/heroDailyShuffle.test.js

# 3. Home Entry Contract Test
node --test client/tests/homeEntryContract.test.js

# 4. Hero Trailer Request Contract Test
node --test client/tests/heroTrailerRequestContract.test.js

# 5. Playwright E2E Tests
npx playwright test e2e/hero-native-video.spec.js
npx playwright test e2e/hero-manual-retry.spec.js
```

### Invalidation Conditions:
- If `Home.jsx` initiates network requests to `youtube.com` or `https://www.youtube.com/iframe_api`.
- If `VITE_BASE_URL="http://localhost:3000/api"` results in double `/api/api/` URLs.
- If enabling `mode: 'manual'` in HeroSettings does not preserve the exact manual 5-movie order on Home.
