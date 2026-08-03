# Handoff Report — Milestone 4 (Zero YouTube on Home, NativeTrailerSection Security & Feature Flag)

## 1. Observation

### 1.1 `client/src/pages/Home.jsx`
- **File path**: `e:/NitroCine/client/src/pages/Home.jsx` (lines 1–70)
- **Observed Behavior**:
  - `Home.jsx` currently lazy-loads `NativeTrailerSection` (line 11) and mounts it unconditionally inside `DeferredSection` (lines 62–64).
  - `Home.jsx` does **not** import or check `getHeroTrailerMode()`.
  - `Home.jsx` does **not** import `TrailerSection` (legacy YouTube component is absent from imports), but it lacks trailer-mode feature flag awareness to suppress `NativeTrailerSection` when `VITE_HERO_TRAILER_MODE=native`.
- **Code snippet (lines 53–67)**:
  ```jsx
  const Home = () => {
    const [requestedTrailerMovie, setRequestedTrailerMovie] = useState(null);

    return (
      <>
        <HeroSection autoPreview onTrailerRequest={setRequestedTrailerMovie} />
        <DeferredSection fallback={<SectionSkeleton />}>
          <FeatureSection />
        </DeferredSection>
        <DeferredSection anchorId="trailers" fallback={<SectionSkeleton trailer />}>
          <NativeTrailerSection sectionId="home-trailer-section" featuredMovie={requestedTrailerMovie} />
        </DeferredSection>
      </>
    );
  };
  ```

### 1.2 `client/src/components/NativeTrailerSection.jsx`
- **File path**: `e:/NitroCine/client/src/components/NativeTrailerSection.jsx` (lines 12–37)
- **Observed Behavior**:
  - `resolveNativeTrailerSource(movie)` calls `resolveConfiguredHeroVideoSource(movie, ...)` on lines 15–19.
  - However, on lines 22–35, if `configured?.src` is null, it falls back to raw unverified fields:
    `const rawUrl = movie.heroVideoUrl || movie.background_video_url || movie.videoUrl || movie.trailerUrl || '';`
    and performs client-side string regex checks (`/\.(mp4|webm)(\?.*)?$/i`) and client-side MIME assignment.
  - This fallback bypasses server status verification (`heroVideoStatus === 'ready'`), allowed hosts checks, and canonical source contracts.
- **Code snippet (lines 12–37)**:
  ```javascript
  const resolveNativeTrailerSource = (movie) => {
    if (!movie || typeof movie !== 'object') return null;

    const configured = resolveConfiguredHeroVideoSource(movie, {
      mockEnabled: isHeroTrailerMockEnabled(),
      isProduction: import.meta.env.PROD,
      allowRelative: true,
    });
    if (configured?.src) return configured;

    const rawUrl = movie.heroVideoUrl || movie.background_video_url || movie.videoUrl || movie.trailerUrl || '';
    if (typeof rawUrl === 'string' && rawUrl.trim()) {
      const src = rawUrl.trim();
      if (isSafeNativeHeroVideoUrl(src, { allowRelative: true })) {
        if (/\.(mp4|webm)(\?.*)?$/i.test(src) || src.startsWith('/mock/')) {
          return {
            kind: 'native',
            src,
            mimeType: src.endsWith('.webm') ? 'video/webm' : 'video/mp4',
            poster: movie.heroVideoPoster || movie.poster_path || movie.backdrop_path || '',
          };
        }
      }
    }
    return null;
  };
  ```

### 1.3 `client/src/components/hero/heroTrailerMode.js`
- **File path**: `e:/NitroCine/client/src/components/hero/heroTrailerMode.js` (lines 1–7)
- **Observed Behavior**:
  - `getHeroTrailerMode` currently defaults missing or unknown modes to `'hybrid'` on lines 4 & 5.
  - Missing the constant export `HERO_TRAILER_MODES = { NATIVE: 'native', SECTION: 'section', HYBRID: 'hybrid' }`.
  - Lacks warning log in development mode when an unknown mode string is supplied.
- **Code snippet (lines 1–7)**:
  ```javascript
  export const getHeroTrailerMode = (
    envMode = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_HERO_TRAILER_MODE : undefined,
  ) => {
    const normalized = String(envMode || 'hybrid').trim().toLowerCase();
    return ['native', 'section', 'hybrid'].includes(normalized) ? normalized : 'hybrid';
  };
  ```

### 1.4 `client/.env.example`
- **File path**: `e:/NitroCine/client/.env.example` (lines 1–9)
- **Observed Behavior**:
  - Contains `VITE_BASE_URL`, `VITE_HERO_API_TIMEOUT_MS`, `VITE_HERO_VIDEO_ALLOWED_HOSTS`, but does **not** include `VITE_HERO_TRAILER_MODE`.

---

## 2. Logic Chain

1. **Zero YouTube Leakage on Home**:
   - To guarantee zero YouTube network requests or TMDB video lookups on the Home route (Section 9), legacy `TrailerSection` (which imports TMDB video services and YouTube video utilities) must remain 100% disconnected from `Home.jsx`.
   - `NativeTrailerSection` uses only native MP4/WebM video players (`<video>` tag) and fetches public Hero/NowShowing catalog endpoints, completely avoiding YouTube iframe APIs or TMDB `/videos` requests.

2. **Feature Flag Control (`VITE_HERO_TRAILER_MODE`)**:
   - `heroTrailerMode.js` must be updated per Section 11 to default to `'native'` when missing or unknown, and export `HERO_TRAILER_MODES`.
   - In `native` mode (default): `HeroSection` handles native media playback directly. Home must **not** mount `NativeTrailerSection` lower trailer section.
   - In `section` mode: `HeroSection` disables native player playback (`trailerMode === 'section'`), and Home mounts `NativeTrailerSection` below.
   - In `hybrid` mode: `HeroSection` attempts native playback first, and `NativeTrailerSection` is mounted below. If playback fails in `HeroSection`, `HeroSection` offers "Retry trailer" native retry without auto-scrolling to `NativeTrailerSection`.

3. **Native Trailer Security**:
   - Per Section 10, `resolveNativeTrailerSource(movie)` in `NativeTrailerSection.jsx` must strictly use `resolveConfiguredHeroVideoSource(movie, ...)` and eliminate all fallbacks to `background_video_url`, `videoUrl`, `trailerUrl`, and arbitrary client-side regex parsing.
   - `resolveConfiguredHeroVideoSource` enforces server-verified status (`heroVideoStatus === 'ready'`), valid MIME types (`video/mp4`, `video/webm`), allowed CDN origins, and HTTPS in production, ensuring non-verified or arbitrary media strings are rejected.

---

## 3. Caveats

1. **Non-Home YouTube Isolation**:
   - `TrailerSection.jsx` is still imported by `MovieDetails.jsx` for movie-specific trailers (`movieOnly={true}`). Per Section 9, YouTube functionality on non-Home pages is permitted as long as it is never imported, prefetched, or requested on Home.
2. **Test Updates**:
   - Existing unit tests in `client/src/components/hero/__tests__/heroTrailerMode.test.js` and `client/tests/heroTrailerMode.test.js` currently assert that `undefined`/empty mode defaults to `'hybrid'`. These must be updated to assert `'native'` to align with Section 11 specifications.

---

## 4. Conclusion & Implementation Plan

### 4.1 Changes to `client/src/components/hero/heroTrailerMode.js`
- Export `HERO_TRAILER_MODES`:
  ```javascript
  export const HERO_TRAILER_MODES = Object.freeze({
    NATIVE: 'native',
    SECTION: 'section',
    HYBRID: 'hybrid',
  });
  ```
- Update `getHeroTrailerMode(envMode)`:
  - If `envMode` is undefined, null, or empty string, return `HERO_TRAILER_MODES.NATIVE`.
  - Normalize mode via `.trim().toLowerCase()`.
  - If normalized mode is in `['native', 'section', 'hybrid']`, return normalized mode.
  - If unknown mode and in `import.meta.env.DEV`, output `console.warn('[getHeroTrailerMode] Unknown mode: ... defaulting to native')`. Return `HERO_TRAILER_MODES.NATIVE`.

### 4.2 Changes to `client/src/pages/Home.jsx`
- Import `getHeroTrailerMode` from `../components/hero/heroTrailerMode`.
- Evaluate `const trailerMode = getHeroTrailerMode();`.
- Conditionally render `NativeTrailerSection`:
  - `const showTrailerSection = trailerMode === 'section' || trailerMode === 'hybrid';`
  - Mount `NativeTrailerSection` inside `DeferredSection` only when `showTrailerSection` is true.
  - Ensure zero legacy `TrailerSection` imports exist.

### 4.3 Changes to `client/src/components/NativeTrailerSection.jsx`
- Update `resolveNativeTrailerSource(movie)`:
  ```javascript
  const resolveNativeTrailerSource = (movie) => {
    if (!movie || typeof movie !== 'object') return null;

    const configured = resolveConfiguredHeroVideoSource(movie, {
      mockEnabled: isHeroTrailerMockEnabled(),
      isProduction: import.meta.env.PROD,
      allowRelative: true,
    });
    return configured?.src ? configured : null;
  };
  ```
- Eliminate unverified fallbacks to `background_video_url`, `videoUrl`, `trailerUrl`, and raw string regex parsing.

### 4.4 Changes to `client/.env.example`
- Append `VITE_HERO_TRAILER_MODE=native` to `client/.env.example`.

### 4.5 Changes to Unit Tests
- Update `client/src/components/hero/__tests__/heroTrailerMode.test.js` and `client/tests/heroTrailerMode.test.js` test cases for `getHeroTrailerMode(undefined)` and `getHeroTrailerMode('unknown')` to assert `'native'`.

---

## 5. Verification Method

To verify the implementation once applied by implementer:

1. **Unit Tests**:
   - `npm --prefix client test tests/heroTrailerMode.test.js`
   - `npm --prefix client test tests/homeZeroYouTube.test.js`
   - `npm --prefix client test tests/homeEntryContract.test.js`
   - `npm --prefix client test`

2. **Static Code Inspection / Regex Searches**:
   - Run: `rg -n -i "youtube|youtu\.be|youtube-nocookie|googlevideo|fetchMovieTrailers|fetchLatestTrailers" client/src/pages/Home.jsx client/src/components/NativeTrailerSection.jsx`
   - Assert: Zero matches on `Home.jsx` and `NativeTrailerSection.jsx`.

3. **Lint & Build**:
   - `npm --prefix client run lint`
   - `npm --prefix client run build`
