# Comprehensive Codebase Analysis & Refactoring Strategy

## Executive Summary
This document details the read-only investigation of NitroCine frontend codebase (`client/src/`) for Native Hero Production Repair. It maps:
1. All client API calls, `VITE_BASE_URL` usages, Axios/fetch instances, services, context, and requirements for `client/src/lib/apiClient.js` (R2).
2. YouTube iframes, YouTube Player API calls, TMDB video endpoints in `client/src/components/` & `client/src/pages/Home.jsx`, and the architecture for `NativeTrailerSection` (R1) to achieve a zero-YouTube guarantee on the Home route.
3. The per-user daily shuffle mechanism in `client/src/utils/heroDailyShuffle.js` and the bypass logic for manual mode (R3).

---

## 1. Client API Architecture & Environment Variable Audit (R2)

### 1.1 `VITE_BASE_URL` Usages and Normalization Gaps
- **`client/.env.example`** (Line 4):
  ```env
  VITE_BASE_URL=http://localhost:3000
  ```
- **`client/src/components/hero/heroImages.js`** (Line 5):
  ```javascript
  const runtimeApiBase = (import.meta.env?.VITE_BASE_URL || '').replace(/\/$/, '');
  ```
  *Defect*: Uses simple trailing slash removal without normalizing trailing `/api` suffixes.
- **`client/src/context/AppContext.jsx`** (Lines 8-15, 15-21):
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
- **`client/src/services/tmdb.js`** (Lines 16-23):
  ```javascript
  const getNormalizedApiBase = (url) => {
    let base = (url || '').trim().replace(/\/$/, '');
    if (base.endsWith('/api')) {
      base = base.slice(0, -4);
    }
    return base;
  };
  const API_BASE = getNormalizedApiBase(runtimeEnv.VITE_BASE_URL);
  ```
  *Observation*: `getNormalizedApiBase` is duplicated verbatim between `AppContext.jsx` and `tmdb.js`.

### 1.2 Full Axios Inventory
- **Instance Creation**: `AppContext.jsx` (L16) creates `api = axios.create({ baseURL })`.
- **Context Export**: `AppContext.jsx` (L141) exports `axios: api` via `useAppContext()`.
- **Consumers**:
  - `client/src/context/ProfileContext.jsx` (L16, L67, L122): Accesses `axios` from `useAppContext()`.
  - `client/src/pages/MyBookings.jsx` (L18, L36, L63, L89, L108): `/api/booking/my-bookings`, `/api/booking/pay-now`, `/api/booking/:id`, `/api/booking/pay-all`.
  - `client/src/pages/SeatLayout.jsx` (L107, L181, L205): `/api/booking/seat/:showId`, `/api/booking/create`.
  - `client/src/pages/admin/AddShows.jsx` (L11, L22, L95): `/api/show/now-playing`, `/api/show/add`.
  - `client/src/pages/admin/DashBoard.jsx` (L11, L47): `/api/admin/dashboard`.
  - `client/src/pages/admin/HeroSettings.jsx` (L51, L74, L92, L115, L134, L153, L209, L276): `/api/admin/hero/randomize`, `/api/admin/hero/refresh`, `/api/admin/hero/sound`, `/api/admin/catalog/refresh`, `/api/admin/hero`.
  - `client/src/pages/admin/HeroVideoUploader.jsx` (L42, L79, L119, L142): `/api/admin/hero/upload-signature`, `/api/admin/hero/:id/commit`, `/api/admin/hero/:id/video`.
  - `client/src/pages/admin/ListBookings.jsx` (L10, L17): `/api/admin/all-bookings`.
  - `client/src/pages/admin/ListShows.jsx` (L10, L17): `/api/admin/all-shows`.

### 1.3 Full Fetch Inventory
- **`client/src/services/fetchWithTimeout.js`** (L1-45): Core fetch wrapper handling timeouts with `AbortController`.
- **`client/src/services/tmdb.js`**:
  - L84: `fetchWithTimeout` helper.
  - L88-100: `fetchBackendJson` calling `${API_BASE}/api/show/tmdb${path}`.
  - L139-143: `loadHomeHeroFromServer` calling `${API_BASE}/api/show/hero`.
  - L249: `fetchMovieTrailers` calling `/movie/:movieId/videos`.
  - L617: `fetchMovieShowtimes` calling `${API_BASE}/api/show/showtimes/:id`.
  - Service functions: `fetchHomeHero`, `fetchHomeNowShowing`, `fetchPopularMovies`, `fetchMovieDetails`, `fetchSimilarMovies`, `fetchLatestTrailers`, `fetchUpcomingMovies`, `fetchNowPlayingMovies`.
- **Consumers**:
  - `CatalogCollectionPage.jsx` (L17): `fetchMovies`
  - `FeatureSection.jsx` (L107): `fetchHomeNowShowing`
  - `HeroSection.jsx` (L498): `fetchHomeHero`
  - `TrailerSection.jsx` (L139, L167, L192, L222): `fetchLatestTrailers`, `fetchMovieTrailers`
  - `useMobileHomeData.js` (L32, L33, L51, L52): `fetchHomeHero`, `fetchHomeNowShowing`, `fetchPopularMovies`, `fetchUpcomingMovies`
  - `useSearchMovies.js` (L68): `fetchSearchMovies`
  - `MovieDetails.jsx` (L74, L75, L122): `fetchMovieDetails`, `fetchMovieShowtimes`, `fetchSimilarMovies`
  - `Movies.jsx` (L14): `fetchPopularMovies`
  - `MyBookings.jsx` (L29): `fetchPopularMovies`

### 1.4 Architecture Blueprint for `client/src/lib/apiClient.js` (R2)
To eliminate duplication and establish a single source of truth for API communications:
```javascript
// client/src/lib/apiClient.js
import axios from 'axios';
import { fetchWithTimeout as requestWithTimeout } from '../services/fetchWithTimeout.js';

export const getNormalizedApiBase = (url) => {
  let base = (url || '').trim().replace(/\/$/, '');
  if (base.endsWith('/api')) {
    base = base.slice(0, -4);
  }
  return base;
};

export const API_BASE = getNormalizedApiBase(
  import.meta.env?.VITE_BASE_URL || process.env.VITE_BASE_URL || ''
);

export const buildApiUrl = (path = '') => {
  const cleanPath = String(path).startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
};

export const apiClient = axios.create({
  baseURL: API_BASE,
});

export const fetchApi = async (path, options = {}, timeoutMs = 4500) => {
  const url = buildApiUrl(path);
  return requestWithTimeout(url, options, { timeoutMs });
};
```
**Integration Plan**:
- Refactor `AppContext.jsx` to import `apiClient` and `getNormalizedApiBase` from `lib/apiClient.js`.
- Refactor `tmdb.js` to import `API_BASE`, `getNormalizedApiBase`, `buildApiUrl`, `fetchApi` from `lib/apiClient.js`.
- Refactor `heroImages.js` to import `API_BASE` from `lib/apiClient.js`.

---

## 2. Hero & Trailer Component Audit & Zero-YouTube Strategy (R1)

### 2.1 YouTube & External Embed Audit Findings
- **`TrailerSection.jsx`**:
  - Line 3: imports `fetchLatestTrailers, fetchMovieTrailers` from `tmdb.js`.
  - Line 7: imports `extractYouTubeVideoId` from `lib/youtubeVideo.js`.
  - Line 30: parses YouTube video IDs.
  - Line 6: renders `<CinematicTrailerPlayer>` which imports `useYouTubePlayer.js`.
  - `useYouTubePlayer.js` (L3, L37, L99): injects `<script src="https://www.youtube.com/iframe_api">`.
- **`tmdb.js`**:
  - Line 249: calls TMDB videos endpoint `/api/show/tmdb/movie/:id/videos`.
  - Lines 270-292: filters YouTube site videos and builds `https://www.youtube.com/embed/:id` and `https://img.youtube.com/vi/:id/hqdefault.jpg`.
- **`Home.jsx`**:
  - Line 11: `const TrailerSection = lazy(() => import('../components/TrailerSection'));`
  - Line 63: `<TrailerSection sectionId="home-trailer-section" featuredMovie={requestedTrailerMovie} />`
  *Impact*: Loading `Home.jsx` triggers YouTube iframe API script downloads, YouTube embed requests, and TMDB video endpoint calls, violating the zero-YouTube Home route invariant.

### 2.2 Hero Subcomponent Compliance Verification
- `HeroSection.jsx`: Native-only pipeline. No YouTube imports.
- `HeroVideoRenderer.jsx`: Renders `HeroNativeVideo` only when `source?.kind === 'native'`.
- `HeroNativeVideo.jsx`: Native HTML5 `<video>` player.
- `heroVideoSource.js`: Explicit validator `isIframeVideoUrl` which rejects YouTube hostnames (`youtube.com`, `youtu.be`, `youtube-nocookie.com`).

### 2.3 Zero-YouTube Guarantee Strategy for Home Route (`NativeTrailerSection`)
1. **Create `client/src/components/NativeTrailerSection.jsx`**:
   - A zero-YouTube native trailer section component designed specifically for the Home page.
   - Fetches and displays native HTML5 trailers (verified ready MP4/WebM sources from Hero catalog or Now Showing movies).
   - Renders native `<video>` preview elements or native video player without any YouTube iframes, YouTube API scripts, or TMDB video API calls.
2. **Update `client/src/pages/Home.jsx`**:
   - Replace lazy import of `TrailerSection` with `NativeTrailerSection`:
     ```javascript
     const NativeTrailerSection = lazy(() => import('../components/NativeTrailerSection'));
     ```
   - Render `<NativeTrailerSection sectionId="home-trailer-section" featuredMovie={requestedTrailerMovie} />` inside `<DeferredSection anchorId="trailers">`.
3. **Preserve Legacy `TrailerSection` for Non-Hero Pages**:
   - Keep `TrailerSection.jsx` intact for non-Home routes (e.g. `MovieDetails.jsx`), maintaining test compatibility for `heroTrailerRequestContract.test.js` and `homeEntryContract.test.js`.

---

## 3. Hero Daily Shuffle & Manual Mode Bypass Audit (R3)

### 3.1 `utils/heroDailyShuffle.js` Architecture
- **Location**: `client/src/utils/heroDailyShuffle.js`
- **Functions**:
  - `getVietnamDateKey(date)`: Formats Asia/Ho_Chi_Minh YYYY-MM-DD date key.
  - `getOrCreateAnonymousViewerId()`: Generates/retrieves UUID from `nitrocine:hero-viewer-id`.
  - `chooseNonRepeatingDailyOrder(...)`: Performs Fisher-Yates shuffle with `mulberry32` PRNG using seed input `${rotationVersion}:${dateKey}:${viewerKey}:${dailyEntropy}`. Enforces anti-repeat rules against previous day.
  - `getOrComputeDailyOrder(...)`: Orchestrates computing and storing order history in `nitrocine:hero-order-history`.
  - `applyDailyOrder(movies, orderedIds)`: Maps ordered IDs back to movie objects.

### 3.2 Detected Defect in Manual Mode Execution
- **`HeroSection.jsx`** (Lines 430-445):
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
- **Analysis**: `HeroSection.jsx` calls `getOrComputeDailyOrder` regardless of whether `data.settings?.mode === 'manual'` or `meta.mode === 'manual'`. As a result, manually selected 5 movies are re-ordered by client daily shuffle, breaking the manual mode requirement that manual mode displays the exact 5 chosen movies in sequence.

### 3.3 Strategy for Manual Mode Bypass
1. **`HeroSection.jsx` Refactoring**:
   ```javascript
   const settings = data.settings || {};
   const meta = data.meta || data;
   const isManualMode = settings.mode === 'manual'
     || settings.configuredMode === 'manual'
     || settings.effectiveMode === 'manual'
     || meta.mode === 'manual'
     || meta.configuredMode === 'manual'
     || meta.effectiveMode === 'manual'
     || meta.source === 'manual-selection';

   const dailyOrderIds = !isManualMode
     ? getOrComputeDailyOrder({
         movies: preparedMovies,
         meta: {
           dateKey: meta.dateKey || '',
           rotationVersion: String(meta.version ?? ''),
           dailyEntropy: meta.dailyEntropy || '',
         },
         viewerKey,
       })
     : [];

   const shuffledMovies = dailyOrderIds.length > 0
     ? applyDailyOrder(preparedMovies, dailyOrderIds)
     : preparedMovies;
   ```
2. **`heroDailyShuffle.js` Guard Clause**:
   Add guard in `getOrComputeDailyOrder`:
   ```javascript
   if (meta.mode === 'manual' || meta.configuredMode === 'manual' || meta.effectiveMode === 'manual') {
     return movies.map(m => String(m._id || m.id));
   }
   ```

---

## 4. Summary of Proposed Files to Create / Modify (For Implementer)

| File Path | Action | Rationale |
|---|---|---|
| `client/src/lib/apiClient.js` | Create (R2) | Centralize base URL normalization, `buildApiUrl`, shared Axios instance, `fetchApi` wrapper |
| `client/src/context/AppContext.jsx` | Modify (R2) | Use `apiClient` and `getNormalizedApiBase` from `lib/apiClient.js` |
| `client/src/services/tmdb.js` | Modify (R2) | Use `API_BASE`, `buildApiUrl`, `fetchApi` from `lib/apiClient.js` |
| `client/src/components/hero/heroImages.js` | Modify (R2) | Use `API_BASE` from `lib/apiClient.js` |
| `client/src/components/NativeTrailerSection.jsx` | Create (R1) | Zero-YouTube native trailer section component for Home route |
| `client/src/pages/Home.jsx` | Modify (R1) | Replace `TrailerSection` import with `NativeTrailerSection` |
| `client/src/components/HeroSection.jsx` | Modify (R3) | Add manual mode check to bypass `getOrComputeDailyOrder` |
| `client/src/utils/heroDailyShuffle.js` | Modify (R3) | Add manual mode guard in `getOrComputeDailyOrder` |

---

## 5. Verification Plan
1. **Unit Tests**:
   - `node --test tests/apiClientConfig.test.js`
   - `node --test tests/heroDailyShuffle.test.js`
   - `node --test tests/homeEntryContract.test.js`
   - `node --test tests/heroTrailerRequestContract.test.js`
2. **E2E Tests**:
   - `npx playwright test e2e/hero-native-video.spec.js`
   - `npx playwright test e2e/hero-manual-retry.spec.js`
