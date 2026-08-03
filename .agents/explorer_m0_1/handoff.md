# Baseline Exploration & Code Inspection Report (Milestone 0)

**Agent**: explorer_m0_1  
**Working Directory**: `e:/NitroCine/.agents/explorer_m0_1/`  
**Date**: 2026-08-03  

---

## 1. Observation

### 1.1 Documentation & Configuration Review
The following files were inspected:
- **`AGENTS.md` (root, client, client/src/components/hero, server)**: Invariants strictly prohibit YouTube iframes, YouTube Player API, ReactPlayer, TMDB video lookups, and generic fallback footage in the Hero flow. The Home Hero must have exactly two media outcomes: 1) one verified native HTML5 `<video>` for the active server-ordered movie, or 2) that movie's poster while native playback is unavailable.
- **`CLAUDE.md` & `PROJECT.md`**: Defines project layout (`client/`, `server/`, `docs/`) and milestone objectives.
- **`docs/hero-native-rotation.md`**: Describes the 15-movie Hero pool architecture (5 newest, 5 hot, 5 discovery), Cloudinary native video validation, sound policy, and caching behavior.
- **`package.json` (server & client)**: `server` uses `node --test` for tests, `nodemon` for dev server. `client` uses `vite`, `eslint`, `node --test` for unit tests, and `@playwright/test` for E2E tests.
- **`.env.example` (server & client)**: Defines runtime env vars including `VITE_BASE_URL`, `VITE_HERO_TRAILER_MODE`, `HERO_REQUIRE_NATIVE_VIDEO`, `HERO_VIDEO_ALLOWED_HOSTS`.

### 1.2 Verification of Section 2 Baseline Observations

#### Observation 1: `server/services/heroService.js`
- **Location**: `server/services/heroService.js`, lines 79–81:
```javascript
export const getPublicHomeHero = async (options = {}) => getPublicHeroRotation({
    now: options.now ? new Date(options.now) : new Date(),
});
```
- **Finding**: `getPublicHomeHero()` delegates unconditionally to `getPublicHeroRotation()`. It never checks `SiteConfig` to see if `homeHero.mode === 'manual'`. Thus, manual selection is ignored on the public Home API.

#### Observation 2: `server/services/heroService.js` - Admin Data Preference
- **Location**: `server/services/heroService.js`, lines 106–128:
```javascript
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
...
```
- **Finding**: `getAdminHomeHero()` populates `liveMovies` from `publicPayload.movies` (which comes from `getPublicHeroRotation()`), preferring rotation active movies over saved manual selection even when configured in manual mode.

#### Observation 3: `client/src/pages/admin/HeroSettings.jsx` - Selected IDs Initialization
- **Location**: `client/src/pages/admin/HeroSettings.jsx`, lines 227–230:
```javascript
const savedMovieIds = hero.settings?.movieIds?.length
  ? hero.settings.movieIds
  : (hero.selectedMovies || []).map((movie) => String(movie._id || movie.id));
setSelectedIds(savedMovieIds.map(String));
```
- **Finding**: While `savedMovieIds` attempts to read `hero.settings?.movieIds`, `hero.selectedMovies` originally pointed to rotation active movies when `selectedMovies` was derived from `rotation.activeMovies`.

#### Observation 4: `client/src/pages/Home.jsx` - Legacy & Native TrailerSection Mount
- **Location**: `client/src/pages/Home.jsx`, lines 11, 54, 58, 62–64:
```javascript
const NativeTrailerSection = lazy(() => import('../components/NativeTrailerSection'));
...
<HeroSection autoPreview onTrailerRequest={setRequestedTrailerMovie} />
...
<DeferredSection anchorId="trailers" fallback={<SectionSkeleton trailer />}>
  <NativeTrailerSection sectionId="home-trailer-section" featuredMovie={requestedTrailerMovie} />
</DeferredSection>
```
- **Finding**: `Home.jsx` passes `onTrailerRequest` to `HeroSection` and mounts `NativeTrailerSection` below.

#### Observation 5: `client/src/components/HeroSection.jsx` - Fallback to Trailer Section
- **Location**: `client/src/components/HeroSection.jsx`, lines 889–917:
```javascript
const handleTrailerAction = useCallback(() => {
  if (trailerMode === 'section') {
    scrollToTrailerSection();
    return;
  }
  if (trailerMode === 'native') {
    handlePlayTrailer();
    return;
  }
  if (trailerAvailable) {
    handlePlayTrailer();
    return;
  }
  scrollToTrailerSection();
}, [handlePlayTrailer, scrollToTrailerSection, trailerAvailable, trailerMode]);
```
- **Finding**: `handleTrailerAction` calls `scrollToTrailerSection()` for `section` mode and for `hybrid` mode when native trailer is unavailable or playback failed.

#### Observation 6: `client/src/components/NativeTrailerSection.jsx` - Unverified Field Fallbacks
- **Location**: `client/src/components/NativeTrailerSection.jsx`, lines 22–33:
```javascript
const rawUrl = movie.heroVideoUrl || movie.background_video_url || movie.videoUrl || movie.trailerUrl || '';
```
- **Finding**: `resolveNativeTrailerSource` in `NativeTrailerSection.jsx` accepts unverified fallback properties (`background_video_url`, `videoUrl`, `trailerUrl`) rather than requiring canonical server-verified `heroVideoUrl` with `heroVideoStatus === 'ready'`.

#### Observation 7: `client/src/components/hero/heroTrailerMode.js` - Default Trailer Mode
- **Location**: `client/src/components/hero/heroTrailerMode.js`, lines 4–5:
```javascript
const normalized = String(envMode || 'hybrid').trim().toLowerCase();
return ['native', 'section', 'hybrid'].includes(normalized) ? normalized : 'hybrid';
```
- **Finding**: Missing or invalid environment configurations default to `'hybrid'` instead of `'native'`.

#### Observation 8: `client/src/lib/apiClient.js` Usage & Duplication
- **Location**: `client/src/lib/apiClient.js` vs `client/src/services/tmdb.js` line 18:
```javascript
// tmdb.js
import { getNormalizedApiBase, buildApiUrl } from '../lib/apiClient.js';
const API_BASE = getNormalizedApiBase(runtimeEnv.VITE_BASE_URL);
```
- **Finding**: `client/src/lib/apiClient.js` exists, exporting `getNormalizedApiBase`, `API_BASE_URL`, `buildApiUrl`, `apiClient`, and `fetchApi`. However, `tmdb.js` re-derives `API_BASE` instead of consuming the shared `API_BASE_URL` or `apiClient` exported from `lib/apiClient.js`.

---

### 1.3 Key File Mapping by Requirement

| Requirement | Primary Files |
|-------------|---------------|
| **R1: Native Media & Zero YouTube on Home** | `client/src/pages/Home.jsx`<br>`client/src/components/HeroSection.jsx`<br>`client/src/components/NativeTrailerSection.jsx`<br>`client/src/components/TrailerSection.jsx`<br>`client/src/services/tmdb.js` |
| **R2: Unified API Client Configuration** | `client/src/lib/apiClient.js`<br>`client/src/services/tmdb.js`<br>`client/src/context/AppContext.jsx` |
| **R3: Authoritative Manual Mode & Bypassed Shuffle** | `server/services/heroService.js`<br>`server/services/heroRotationService.js`<br>`server/controllers/showController.js`<br>`server/controllers/adminController.js`<br>`client/src/pages/admin/HeroSettings.jsx`<br>`client/src/components/HeroSection.jsx`<br>`client/src/components/hero/heroDailyShuffle.js` |
| **R4: Feature Flag for Trailer Mode & Backend Identity** | `client/src/components/hero/heroTrailerMode.js`<br>`server/controllers/showController.js`<br>`server/controllers/adminController.js`<br>`client/.env.example` |
| **R5: Retry State Machine & Video Lifecycle** | `client/src/components/HeroSection.jsx`<br>`client/src/components/hero/HeroContent.jsx`<br>`client/src/components/hero/HeroNativeVideo.jsx`<br>`client/src/components/hero/heroMachine.js` |

---

### 1.4 Baseline Test Execution & Output Results

1. **Server Unit Tests (`server` -> `npm test`)**:
   - **Command**: `npm test` (cwd: `e:/NitroCine/server`)
   - **Result**: Exit code 0
   - **Metrics**: 119 passed, 0 failed, 2 skipped (total 121 tests)
   - **Duration**: ~8.7s

2. **Client Unit Tests (`client` -> `npm test`)**:
   - **Command**: `npm test` (cwd: `e:/NitroCine/client`)
   - **Result**: Exit code 0
   - **Metrics**: 95 passed, 0 failed, 0 skipped (total 95 tests)
   - **Duration**: ~4.65s

3. **Client Linter (`client` -> `npm run lint`)**:
   - **Command**: `npm run lint` (cwd: `e:/NitroCine/client`)
   - **Result**: Exit code 0 (clean, no ESLint errors or warnings)

4. **Client Production Build (`client` -> `npm run build`)**:
   - **Command**: `npm run build` (cwd: `e:/NitroCine/client`)
   - **Result**: Exit code 0 (built in 2.39s, 51 assets generated)

---

## 2. Logic Chain

1. **Observation 1 & 2 -> Conclusion on Manual Mode Backend Logic**:  
   Because `getPublicHomeHero()` in `heroService.js` routes directly to `getPublicHeroRotation()`, any manual selection saved by the Admin is ignored when serving `/api/show/hero`. `getPublicHomeHero()` must check `HomeHeroConfig` first; if `mode === 'manual'`, it must return the manual 5-movie payload in exact saved order without calling auto rotation.

2. **Observation 3 -> Conclusion on Admin UI Data Binding**:  
   `HeroSettings.jsx` needs to clearly distinguish between `liveMovies` (what is currently serving on Home), `manualSelection` (the saved 5-movie selection), and `rotation` (the 15-movie auto pool). Admin response structures from `getAdminHomeHero()` and `updateHomeHero()` must expose these separately.

3. **Observation 4, 5, 6 & 7 -> Conclusion on Home Native Player & Trailer Mode**:  
   - Default `VITE_HERO_TRAILER_MODE` in `heroTrailerMode.js` must be `'native'`.
   - `NativeTrailerSection.jsx` must strictly validate native sources (`heroVideoUrl` with `heroVideoStatus === 'ready'`) and reject unverified fields (`background_video_url`, `videoUrl`, `trailerUrl`).
   - `HeroSection.jsx` retry mechanism must increment `videoGeneration` and attempt a native `video.play()` rather than scrolling to `TrailerSection`.

4. **Observation 8 -> Conclusion on API Client Consistency**:  
   All frontend requests (`tmdb.js`, `AppContext.jsx`, `HeroSettings.jsx`) must route through `client/src/lib/apiClient.js` (`API_BASE_URL`, `buildApiUrl`, `apiClient`, `fetchApi`) to ensure Admin mutations and public GET requests access the exact same origin derived from `VITE_BASE_URL`.

---

## 3. Caveats

- **External Assets Dependency**: Runtime playback tests in real browsers depend on Cloudinary hosted native MP4/WebM assets. When offline or without active Cloudinary assets, development mock videos are used only behind the explicit `?heroMock=1` flag.
- **Playwright E2E Environment**: E2E tests require both `server` (Express/MongoDB/Redis) and `client` (Vite dev server) running locally on ports 3000 and 5173.

---

## 4. Conclusion

The repository codebase is in a stable, passing baseline state (all unit tests, lints, and builds pass). The 8 baseline observations from Section 2 of `ORIGINAL_REQUEST.md` have been verified with exact line numbers and source code snippets. The findings provide a complete evidence chain to guide Milestone 1+ implementation without regression.

---

## 5. Verification Method

To independently verify the baseline findings and test status:

1. **Run Server Unit Tests**:
   ```bash
   cd e:/NitroCine/server && npm test
   ```
   *Expected*: 119 passed, 0 failed.

2. **Run Client Unit Tests**:
   ```bash
   cd e:/NitroCine/client && npm test
   ```
   *Expected*: 95 passed, 0 failed.

3. **Run Client Lint & Build**:
   ```bash
   cd e:/NitroCine/client && npm run lint && npm run build
   ```
   *Expected*: Zero ESLint errors, Vite build succeeds.

4. **Inspect Source Files**:
   - `server/services/heroService.js`: lines 79–81, 106–128
   - `client/src/pages/admin/HeroSettings.jsx`: lines 227–230
   - `client/src/pages/Home.jsx`: lines 11, 58, 63
   - `client/src/components/HeroSection.jsx`: lines 889–917
   - `client/src/components/NativeTrailerSection.jsx`: lines 22–33
   - `client/src/components/hero/heroTrailerMode.js`: lines 4–5
   - `client/src/lib/apiClient.js` vs `client/src/services/tmdb.js` line 18
