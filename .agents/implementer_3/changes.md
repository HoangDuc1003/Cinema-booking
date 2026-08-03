# Implementation Changes — Milestone 3 (R1 & R3)

## Summary of Changes

### 1. Home Route Zero-YouTube Guarantee (R1)
- **Created `client/src/components/NativeTrailerSection.jsx`**:
  - Implemented a zero-YouTube native HTML5 trailer section component specifically for the Home route.
  - Fetches and resolves native HTML5 trailers (verified ready MP4/WebM sources) using `resolveConfiguredHeroVideoSource` and `isSafeNativeHeroVideoUrl`.
  - Renders a native `<video>` element with poster fallback, poster backdrop cards, movie titles, ratings, release years, and thumbnail carousel.
  - Contains zero references to YouTube iframe API, `youtube.com`, `youtu.be`, `iframe_api`, or TMDB `/movie/:id/videos` endpoint calls.
- **Updated `client/src/pages/Home.jsx`**:
  - Replaced lazy import of `TrailerSection` with `NativeTrailerSection`: `const NativeTrailerSection = lazy(() => import('../components/NativeTrailerSection'));`
  - Replaced `<TrailerSection sectionId="home-trailer-section" ... />` with `<NativeTrailerSection sectionId="home-trailer-section" ... />` inside `<DeferredSection anchorId="trailers">`.
  - Preserved `TrailerSection.jsx` unchanged for non-Home routes (e.g., `MovieDetails.jsx`).

### 2. Manual Mode Daily Shuffle Bypass (R3)
- **Updated `client/src/utils/heroDailyShuffle.js`**:
  - Added guard in `getOrComputeDailyOrder`: when `meta.mode === 'manual'`, `meta.configuredMode === 'manual'`, `meta.effectiveMode === 'manual'`, or `meta.source === 'manual-selection'`, bypasses Fisher-Yates daily shuffle and returns the exact 5 saved manual movie IDs in server order (`movies.map(m => String(m._id || m.id))`).
- **Updated `client/src/components/HeroSection.jsx`**:
  - Added `isManualMode` detection (`settings.mode === 'manual'`, `meta.configuredMode === 'manual'`, etc.).
  - When `isManualMode` is true, bypasses `getOrComputeDailyOrder` so `shuffledMovies` remains `preparedMovies` in exact server order for all viewers.

### 3. API Client Normalization Refactoring Fixes
- **Updated `client/src/lib/apiClient.js`**:
  - Used `globalThis.process?.env` check to prevent `no-undef` lint errors while retaining compatibility.

### 4. Tests Added / Updated
- **Created `client/tests/heroShuffleBypass.test.js`**:
  - Validates `getOrComputeDailyOrder` returns exact server order for all manual mode variants (`mode`, `configuredMode`, `effectiveMode`, `source`).
  - Validates `HeroSection.jsx` contains `isManualMode` bypass check.
- **Created `client/tests/homeZeroYouTube.test.js`**:
  - Validates `Home.jsx` imports `NativeTrailerSection` and zero legacy YouTube `TrailerSection`.
  - Validates `NativeTrailerSection.jsx` contains zero YouTube provider strings, zero TMDB video calls, zero iframes, and uses native `<video>`.

## Files Modified / Created
| File Path | Action | Description |
|---|---|---|
| `client/src/components/NativeTrailerSection.jsx` | Created | Zero-YouTube native trailer section component |
| `client/src/pages/Home.jsx` | Modified | Replaced TrailerSection with NativeTrailerSection |
| `client/src/utils/heroDailyShuffle.js` | Modified | Added manual mode guard in `getOrComputeDailyOrder` |
| `client/src/components/HeroSection.jsx` | Modified | Added manual mode bypass check in daily shuffle |
| `client/src/lib/apiClient.js` | Modified | Fixed global process reference for lint compliance |
| `client/tests/heroShuffleBypass.test.js` | Created | Unit test suite for R3 manual mode shuffle bypass |
| `client/tests/homeZeroYouTube.test.js` | Created | Unit test suite for R1 zero-YouTube Home guarantee |

## Test Verification Output
```
> client@0.0.0 test
> node --test

✔ R3: getOrComputeDailyOrder returns exact server order when mode is manual
✔ R3: HeroSection contains manual mode shuffle bypass check
✔ R1: Home route uses NativeTrailerSection and does not import legacy YouTube TrailerSection
✔ R1: NativeTrailerSection has zero YouTube references and zero TMDB videos calls
...
ℹ tests 89
ℹ suites 0
ℹ pass 89
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1809.264
```
All 89 tests passing, 0 failures, `npm run lint` clean (0 errors), `npm run build` successful.
