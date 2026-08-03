# Handoff Report — Milestone 3: Home Route Zero YouTube Guarantee (R1) & Manual Mode Daily Shuffle Bypass (R3)

## 1. Observation

- **Home Route YouTube Leakage (R1)**:
  - `client/src/pages/Home.jsx` previously imported `const TrailerSection = lazy(() => import('../components/TrailerSection'));` at line 11 and rendered `<TrailerSection sectionId="home-trailer-section" ... />` at line 63.
  - `TrailerSection.jsx` called `fetchMovieTrailers` (in `client/src/services/tmdb.js`), requesting TMDB `/api/show/tmdb/movie/:id/videos`, filtering YouTube site videos, building `https://www.youtube.com/embed/:id`, and mounting `<CinematicTrailerPlayer>` which injected `<script src="https://www.youtube.com/iframe_api">`.
  - Creating `client/src/components/NativeTrailerSection.jsx` and replacing `TrailerSection` in `Home.jsx` completely eliminates YouTube iframe API injections, YouTube embed URLs, and TMDB `/videos` network calls on the Home route.

- **Manual Mode Daily Shuffle Bypass (R3)**:
  - `client/src/components/HeroSection.jsx` lines 430-445 previously called `getOrComputeDailyOrder` unconditionally for all server responses regardless of `settings.mode` or `meta.configuredMode`.
  - When mode was `'manual'`, `getOrComputeDailyOrder` in `client/src/utils/heroDailyShuffle.js` performed a Fisher-Yates shuffle stored in `nitrocine:hero-order-history`, overwriting the server-selected 5-movie sequence.
  - Adding `isManualMode` check in `HeroSection.jsx` and guard in `getOrComputeDailyOrder` in `heroDailyShuffle.js` bypasses the daily shuffle and maintains the exact 5 saved manual movies in server order.

## 2. Logic Chain

1. **R1: Zero-YouTube Guarantee on Home Route**:
   - *Observation*: `Home.jsx` used legacy `TrailerSection`, causing YouTube iframe API scripts and TMDB `/videos` requests to fire on Home.
   - *Reasoning*: By replacing `TrailerSection` with `NativeTrailerSection.jsx` on `Home.jsx`, the Home page renders native HTML5 video previews or poster fallbacks using verified MP4/WebM sources, with zero YouTube network requests or TMDB `/videos` queries.
   - *Step-by-step*:
     a. Created `client/src/components/NativeTrailerSection.jsx` using `resolveConfiguredHeroVideoSource` and `isSafeNativeHeroVideoUrl`.
     b. Updated `client/src/pages/Home.jsx` lazy import to `NativeTrailerSection`.
     c. Retained `TrailerSection.jsx` unchanged for `MovieDetails.jsx`.

2. **R3: Manual Mode Daily Shuffle Bypass**:
   - *Observation*: `HeroSection.jsx` shuffled candidate movies even when admin set `mode === 'manual'`.
   - *Reasoning*: Manual mode requires displaying the exact 5 chosen movies in saved server order for all viewers.
   - *Step-by-step*:
     a. In `HeroSection.jsx`, added `isManualMode` check (`settings.mode === 'manual'`, `meta.configuredMode === 'manual'`, `meta.effectiveMode === 'manual'`, or `meta.source === 'manual-selection'`).
     b. When `isManualMode` is active, set `dailyOrderIds = []` to preserve `preparedMovies` in server order.
     c. In `utils/heroDailyShuffle.js`, added defensive guard in `getOrComputeDailyOrder` returning `movies.map(m => String(m._id || m.id))` when mode is manual.

3. **Validation & Quality Assurance**:
   - *Observation*: All 89 unit tests pass in `client/tests/`.
   - *Reasoning*: ESLint and Vite build pass with 0 errors, confirming production bundle generation and zero regressions.

## 3. Caveats

- `TrailerSection.jsx` is intentionally retained for non-Home routes like `MovieDetails.jsx`.
- If a movie lacks a verified ready native MP4/WebM video asset, `NativeTrailerSection.jsx` renders a styled poster fallback card with movie metadata instead of attempting external embeds.

## 4. Conclusion

- **R1 Zero YouTube Guarantee**: Fully implemented. Home route now uses `NativeTrailerSection.jsx` with zero YouTube iframes, zero YouTube API scripts, and zero TMDB `/videos` requests.
- **R3 Manual Mode Daily Shuffle Bypass**: Fully implemented. Manual mode preserves the exact 5 saved manual movies in server order.
- **Verification**: 89/89 unit tests pass (`npm test`), ESLint clean (`npm run lint`), Vite build succeeds (`npm run build`).

## 5. Verification Method

### Test Commands:
```bash
# 1. Run all client unit tests
cd client && npm test

# 2. Run client linting
cd client && npm run lint

# 3. Run client production build
cd client && npm run build
```

### Direct File Inspection:
- `client/src/components/NativeTrailerSection.jsx`
- `client/src/pages/Home.jsx`
- `client/src/utils/heroDailyShuffle.js`
- `client/src/components/HeroSection.jsx`
- `client/tests/heroShuffleBypass.test.js`
- `client/tests/homeZeroYouTube.test.js`
