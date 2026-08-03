# R5 & Test Suite Landscape Investigation Analysis Report

**Date**: 2026-08-03
**Explorer**: Explorer 3
**Working Directory**: `e:\NitroCine\.agents\explorer_3`

---

## 1. Native Video Player State Machine & Lifecycle (R5)

### A. Component Hierarchy & Architecture
- **`HeroSection.jsx`** (`client/src/components/HeroSection.jsx`): Top-level container managing catalog data, active movie index (`currentIndex`), carousel timer, `videoGeneration` counter, playback status state machine (`HERO_PLAYBACK_STATUS`), sound consent, and button interaction handlers (`handleTrailerAction`, `handlePlayTrailer`).
- **`HeroContent.jsx`** (`client/src/components/hero/HeroContent.jsx`): Renders movie details, metadata badges, and action buttons (`Book Now`, `Trailer` / `Retry trailer`, `Details`, sound mute/volume controls).
- **`HeroMedia.jsx`** (`client/src/components/hero/HeroMedia.jsx`): Shell rendering poster images, gradient overlays, and hosting the video renderer container.
- **`HeroVideoRenderer.jsx`** (`client/src/components/hero/HeroVideoRenderer.jsx`): Pure React wrapper matching video source (`kind === 'native'`) and rendering `<HeroNativeVideo>`.
- **`HeroNativeVideo.jsx`** (`client/src/components/hero/HeroNativeVideo.jsx`): Mounts native HTML5 `<video>` element, manages native DOM media event listeners (`onLoadedMetadata`, `onCanPlay`, `onPlaying`, `onPause`, `onEnded`, `onWaiting`, `onError`), startup/verification timers, volume/mute states, and cleanup on unmount.
- **`heroMachine.js`** (`client/src/components/hero/heroMachine.js`): Constants for phases (`HERO_PHASES`), playback statuses (`HERO_PLAYBACK_STATUS`), failure reasons (`HERO_FAILURE_REASONS`), and pure helper functions (`hasAdvancedPlayback`, `heroReducer`, `createInitialHeroState`).

---

### B. Trace of `videoGeneration` State & Component Lifecycle

1. **State Declaration & Reference Tracking (`HeroSection.jsx:142–165`)**:
   - `[videoGeneration, setVideoGeneration] = useState(0)` tracks the React state version.
   - `generationRef = useRef(0)` mirrors the current generation synchronously across async callbacks.
   - `nextGeneration()` function:
     ```javascript
     const nextGeneration = useCallback(() => {
       generationRef.current += 1;
       setVideoGeneration(generationRef.current);
       return generationRef.current;
     }, []);
     ```

2. **React Keying & Unmount/Remount Trigger (`HeroSection.jsx:1005–1026`)**:
   - `<HeroVideoRenderer>` is passed `generation={videoGeneration}` and keyed as:
     `key={`hero-native-${videoGeneration}-${videoSource.version || videoSource.src}`}`
   - Whenever `nextGeneration()` is invoked (e.g. during manual retry or switching movies), React treats the new `key` as a new component subtree.
   - **Old Component Unmount Cleanup (`HeroNativeVideo.jsx:371–385`)**:
     The unmount cleanup function runs before the new element mounts:
     ```javascript
     video.pause();
     video.removeAttribute('src');
     sourceRef.current?.removeAttribute('src');
     video.load();
     ```
     This purges media buffers and guarantees that only ONE HTML5 `<video>` element remains active in the DOM.

3. **In-Flight Callback Verification (`HeroNativeVideo.jsx:61–68`)**:
   - Every async callback or DOM handler checks `isCurrent(targetGeneration, targetSrc)`:
     ```javascript
     const isCurrent = (targetGeneration = generation, targetSrc = src) => (
       latestRef.current.enabled &&
       latestRef.current.generation === targetGeneration &&
       latestRef.current.src === targetSrc
     );
     ```
   - Any late-arriving event from a superseded generation is immediately discarded.

4. **Generation Effect Reset (`HeroNativeVideo.jsx:357–369`)**:
   - `useEffect` watching `[clearTimers, generation, src]`:
     Resets `failedGenerationRef.current = null`, `automaticResumeCountRef.current = 0`, clears pending timers, and triggers `video.load()`.

---

### C. Native Video Event Handlers & `currentTime` Advancement Tracking

1. **`onLoadedMetadata` (`HeroNativeVideo.jsx:228–252`)**:
   - Validates `video.videoWidth > 0 && video.videoHeight > 0`.
   - Fires `onPlayerReady({ generation, player: video })`.
   - Starts 12,000ms (`HERO_PLAYBACK_TIMEOUT_MS`) startup timeout (`startupTimerRef`).
   - If `active` is true, calls `requestPlay()`.

2. **`onCanPlay` (`HeroNativeVideo.jsx:420–423`)**:
   - If `active` is true, calls `requestPlay()`.

3. **`onPlaying` (`HeroNativeVideo.jsx:254–262`)**:
   - Clears buffering and recovery timers.
   - Emits `onPlaybackPlaying({ generation, now: now() })`.
   - Invokes `beginPlaybackVerification(event.currentTarget)`.

4. **`currentTime` Advancement Verification (`HeroNativeVideo.jsx:176–226`)**:
   - Captures initial `currentTime` at playback start.
   - Sets a verification timer (`verificationTimerRef`) running every 500ms (`HERO_PLAYING_HYSTERESIS_MS`).
   - Evaluates `hasAdvancedPlayback`:
     ```javascript
     const advanced = hasAdvancedPlayback({
       playerState: playing ? 1 : 2,
       playingState: 1,
       previousTime: initialTime,
       currentTime,
       minimumAdvance: HERO_MIN_PLAYBACK_ADVANCE_SECONDS, // 0.35 seconds
     });
     ```
   - Checks that:
     a) `video.videoWidth > 0 && video.videoHeight > 0` (decoded frame geometry present)
     b) `playing` is true (`!paused && !ended && readyState >= 2 && !error`)
     c) `currentTime` has advanced by `>= 0.35` seconds.
   - Once confirmed, clears startup timer, resets `automaticResumeCountRef`, updates state to `STABLE`, and fires `onVisualReady` to transition poster opacity to 0 and reveal native video.

5. **`onError` (`HeroNativeVideo.jsx:328–336`)**:
   - Reads `video.error` (`code`, `message`).
   - Calls `fail(HERO_FAILURE_REASONS.VIDEO_ERROR, { stage: 'native-player', code, message })`.
   - Emits `onPlaybackPaused` and `onFailure` to `HeroSection.jsx`.

6. **`onEnded` (`HeroNativeVideo.jsx:320–326` & `HeroSection.jsx:712–727`)**:
   - Clears timers, hides visual, emits `onEnded`.
   - `HeroSection.jsx` `handleEnded` receives the event:
     Waits `HERO_ENDED_POSTER_HOLD_MS` (1,000ms), then calls `switchMovie(endedIndex + 1, { animate: true, continuePlayback: true, intent: PLAYBACK_INTENT.CONTINUATION })`.

---

### D. "Retry Trailer" Button Refactoring Logic (R3 / R5 Requirements)

Current implementation in `HeroSection.jsx` (lines 860–911) & `HeroContent.jsx` (lines 53–60):

1. **Error Clearing & `videoGeneration` Increment**:
   - When native trailer fails, `playbackStatus` is `HERO_PLAYBACK_STATUS.FAILED` and button label displays `"Retry trailer"`.
   - User click invokes `onToggleTrailer()` -> `handleTrailerAction()`.
   - `handleTrailerAction()` checks mode:
     - `native` mode: directly calls `handlePlayTrailer()`.
     - `section` mode: calls `scrollToTrailerSection()`.
     - `hybrid` mode: if native source available (`trailerAvailable`), calls `handlePlayTrailer()`; otherwise calls `scrollToTrailerSection()`.
   - `handlePlayTrailer()` logic (`HeroSection.jsx:860–880`):
     ```javascript
     const handlePlayTrailer = useCallback(() => {
       if (trailerMode === 'section') return;
       const key = getHeroMovieKey(currentMovie, currentIndex);
       failedMovieKeysRef.current.delete(key);
       retryNonceRef.current += 1;
       setRetryNonce(retryNonceRef.current);
       setPlaybackStatus(HERO_PLAYBACK_STATUS.IDLE);
       setFailureReason(null);
       if (!startPlaybackForIndex(currentIndex, {
         intent: PLAYBACK_INTENT.MANUAL,
         retryNonce: retryNonceRef.current,
       })) {
         scheduleFailureHandoff(currentIndex);
       }
     }, ...);
     ```
   - Calling `startPlaybackForIndex` executes `nextGeneration()`, updating `videoGeneration` and constructing a new `videoSource` object with the fresh generation and `retryNonce`.

2. **No-Scroll, No-Navigation, Same Index Requirement**:
   - `handlePlayTrailer()` does NOT call `scrollToTrailerSection()`, does NOT invoke `scrollIntoView()`, does NOT trigger `onTrailerRequest`, and does NOT navigate or alter `currentIndex`.
   - `currentIndex` remains unchanged, keeping the active movie displayed while native `<video>` re-initializes and attempts playback.

3. **Single Active `<Video>` & Last Trailer Wrap-Around**:
   - **Single Active `<video>` Element**: Guaranteed because `HeroSection` renders exactly one `<HeroVideoRenderer>`, and React unmounts the previous `HeroNativeVideo` before mounting the new one via `key={`hero-native-${videoGeneration}-${videoSource.version || videoSource.src}`}`.
   - **Last Trailer Wrap-Around to First Trailer**:
     In `switchMovie(targetIndex)` (`HeroSection.jsx:337–344`):
     ```javascript
     const normalized = ((targetIndex % available.length) + available.length) % available.length;
     ```
     When the last trailer in the catalog (`targetIndex = movies.length - 1`) ends, `handleEnded` calls `switchMovie(endedIndex + 1)`. `(movies.length - 1 + 1) % movies.length = 0`, smoothly wrapping around to index 0 (the first movie trailer).

---

## 2. Test Suite Landscape Inspection

### A. Test Runner Configuration
- **Unit / Integration Tests**: Node.js native test runner (`node --test`).
  - `client/package.json`: `"test": "node --test"`
  - `server/package.json`: `"test": "node --test"`
- **End-to-End Tests**: Playwright (`@playwright/test`).
  - `client/package.json`: `"test:e2e": "playwright test"`

---

### B. Unit & Integration Test Files Inventory

#### Client Side (`client/tests/` & `client/src/components/hero/__tests__/`)
1. `client/src/components/hero/__tests__/heroTrailerMode.test.js`: Co-located structural invariant test for `getHeroTrailerMode` and retry/flag semantics.
2. `client/tests/heroTrailerMode.test.js`: Tests flag handling (`native`, `section`, `hybrid`), `handleTrailerAction` native retry on failure, `HeroNativeVideo` `video.load()` trigger.
3. `client/tests/heroMachine.test.js`: Comprehensive state machine test for `heroReducer`, `createInitialHeroState`, `hasAdvancedPlayback`, failure reasons, compaction.
4. `client/tests/heroE2EIntegration.test.js`: Integration tests for catalog payload handling and fallback states.
5. `client/tests/heroVideoSource.test.js`: Source resolution and allowed hosts validation (`allowedHosts`).
6. `client/tests/heroCatalogCache.test.js`: Catalog storage and cache retrieval.
7. `client/tests/heroDailyShuffle.test.js`: Vietnam timezone daily shuffle logic.
8. `client/tests/heroImages.test.js`: Responsive image candidate building.
9. `client/tests/heroMock.test.js`: Mock fixture flags (`?heroMock=1`).
10. `client/tests/heroMovieIndex.test.js` & `heroViewportContract.test.js`: Layout and contract bounds.
11. `client/tests/homeEntryContract.test.js`, `homeNowShowingCache.test.js`, `mobileExperienceContract.test.js`, `useYouTubePlayer.test.js`, `apiClientConfig.test.js`, `cinematicTrailerVolume.test.js`, `fetchWithTimeout.test.js`.

#### Server Side (`server/tests/`)
1. `server/tests/heroController.test.js`, `heroRotationModel.test.js`, `heroRotationRuntime.test.js`, `heroRotationService.test.js`, `heroService.test.js`, `heroVideoEnrichmentService.test.js`, `heroVideoService.test.js`, `tmdbVideosController.test.js`.

---

### C. Playwright E2E Test Suite & Configuration

- **Configuration File**: `client/playwright.config.js`
  - `testDir`: `./e2e`
  - `webServer`: command `npm run dev -- --host 127.0.0.1 --port 4174`, baseURL `http://127.0.0.1:4174`.
  - Environment overrides: `VITE_E2E_PROFILE_TEST: 'true'`, `VITE_HERO_VIDEO_ALLOWED_HOSTS: '127.0.0.1'`.
  - Projects: `chrome` (Chromium channel 'chrome') and `webkit`.

- **E2E Test Files (`client/e2e/`)**:
  1. `client/e2e/hero-native-video.spec.js`:
     - Verifies single native HTML5 `<video>` element mounted.
     - Verifies zero `<iframe>` elements in Hero.
     - Verifies `currentTime` advances by `> 0.35`s.
     - Asserts forbidden network requests (`youtube.com`, `youtu.be`, `youtube-nocookie.com`, TMDB `/videos` endpoints).
     - Verifies wrap-around, audio volume slider, gesture recovery, and fallback.
  2. `client/e2e/hero-manual-retry.spec.js`:
     - Tests manual 5-movie catalog rendering.
     - Simulates 1st native playback rejection via `play()` patch.
     - Verifies button becomes `"Retry trailer"`.
     - Clicks `"Retry trailer"` and verifies playback retries natively with no `scrollIntoView` and no change in active movie title.
  3. `client/e2e/catalog-home.spec.js`, `catalog-pages.spec.js`, `mobile-experience.spec.js`, `movie-details-real-showtimes.spec.js`, `now-showing-development-mock.spec.js`, `now-showing-mock-reproduction.spec.js`.

---

### D. Strategy for YouTube & TMDB Network Request Assertion in Playwright

To strictly enforce project invariants in E2E tests (zero YouTube network requests, zero TMDB video endpoint lookups in Hero flow):

```javascript
// Pattern for forbidden network requests during Hero native video tests
const FORBIDDEN_NETWORK_PATTERNS = [
  /^https?:\/\/(?:[^/]+\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be|googlevideo\.com)\//i,
  /\/tmdb\/movie\/[^/]+\/videos/i,
  /\/api\/tmdb\/movie\/[^/]+\/videos/i,
  /\/api\/tmdb\/trailers/i,
];

test('Hero native video flow makes zero YouTube or TMDB video network requests', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.goto('/?heroMock=1');

  const hero = page.locator('.hero-section');
  const video = hero.locator('video');
  await expect(video).toHaveCount(1);

  // Filter captured requests against forbidden patterns
  const forbiddenRequests = requests.filter((url) => (
    FORBIDDEN_NETWORK_PATTERNS.some((pattern) => pattern.test(url))
  ));

  expect(forbiddenRequests).toEqual([]);
});
```

---

## 3. Summary & Findings Matrix

| Requirement | Inspect Location | Finding / Status |
|---|---|---|
| **R5 Video Lifecycle & State Machine** | `HeroSection.jsx`, `HeroNativeVideo.jsx`, `heroMachine.js` | Fully traced. `videoGeneration` state + ref increments on retry; keying forces clean unmount/remount; `currentTime` advancement verified via 500ms hysteresis. |
| **R3 Retry Button Logic** | `HeroSection.jsx:860–911` | `handlePlayTrailer()` clears error state, increments `retryNonceRef`, calls `nextGeneration()`, replays natively in Hero with zero scroll/navigation. |
| **R5 Single Active `<video>` & Wrap-Around** | `HeroNativeVideo.jsx:371`, `HeroSection.jsx:340` | React keying on `videoGeneration` ensures 1 active video; `(index + 1) % movies.length` ensures wrap-around to first trailer. |
| **Test Landscape Inventory** | `client/tests/`, `client/e2e/`, `client/playwright.config.js` | Unit/integration via `node --test`; E2E via `@playwright/test`. Existing tests already cover structural contracts and manual retry. |
| **Playwright Network Assertions** | `client/e2e/hero-native-video.spec.js` | Network request assertions check against YouTube & TMDB patterns using `page.on('request')`. |

