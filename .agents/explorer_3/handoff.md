# Handoff Report — Explorer 3: R5 Native Video State Machine & Test Landscape

**Date**: 2026-08-03
**Explorer**: Explorer 3
**Working Directory**: `e:\NitroCine\.agents\explorer_3`
**Handoff Type**: Hard (Task Complete)

---

## 1. Observation

1. **Native Video Player State Machine Files & Line Numbers**:
   - `client/src/components/HeroSection.jsx`:
     - Line 142–144: `[videoGeneration, setVideoGeneration] = useState(0);` and `generationRef = useRef(0);`.
     - Line 238–242: `nextGeneration` callback increments `generationRef.current` and calls `setVideoGeneration(generationRef.current)`.
     - Line 860–880: `handlePlayTrailer` deletes key from `failedMovieKeysRef`, increments `retryNonceRef.current`, sets `playbackStatus` to `HERO_PLAYBACK_STATUS.IDLE`, sets `failureReason` to `null`, and calls `startPlaybackForIndex(currentIndex, { intent: PLAYBACK_INTENT.MANUAL })` which triggers `nextGeneration()`.
     - Line 894–911: `handleTrailerAction` routes trailer button clicks based on `trailerMode` (`'native'`, `'section'`, `'hybrid'`).
     - Line 1005–1026: `<HeroVideoRenderer>` element keyed as `key={`hero-native-${videoGeneration}-${videoSource.version || videoSource.src}`}`.
   - `client/src/components/hero/HeroNativeVideo.jsx`:
     - Line 176–226: `beginPlaybackVerification` checks `currentTime` advancement (`currentTime - initialTime >= 0.35` seconds) every 500ms (`HERO_PLAYING_HYSTERESIS_MS`) and verifies `videoWidth > 0`, `videoHeight > 0`, `!paused`, `!ended`, `readyState >= 2`.
     - Line 228–252: `handleLoadedMetadata` checks `videoWidth > 0 && videoHeight > 0`, initializes 12s timeout, calls `requestPlay()`.
     - Line 320–326: `handleEnded` hides visual and emits `onEnded` event.
     - Line 328–336: `handleError` reads `video.error` and calls `fail(HERO_FAILURE_REASONS.VIDEO_ERROR, ...)`.
     - Line 371–385: `useEffect` unmount cleanup pauses video, removes `src` attribute, and calls `video.load()` to free memory.
   - `client/src/components/hero/heroMachine.js`:
     - Line 24–31: `HERO_PLAYBACK_STATUS` (`IDLE`, `REQUESTED`, `PLAYING`, `STABLE`, `PAUSED`, `FAILED`).
     - Line 41–46: `HERO_FAILURE_REASONS` (`AUTOPLAY_BLOCKED`, `TIMEOUT`, `VIDEO_ERROR`, `MISSING_VIDEO`).
     - Line 51: `HERO_MIN_PLAYBACK_ADVANCE_SECONDS = 0.35`.

2. **Test Suite Landscape**:
   - **Test Runners**: Node.js native test runner (`node --test`) for unit/integration; Playwright (`@playwright/test`) for E2E.
   - **Unit / Integration Files**:
     - `client/src/components/hero/__tests__/heroTrailerMode.test.js`
     - `client/tests/heroTrailerMode.test.js`
     - `client/tests/heroMachine.test.js`
     - `client/tests/heroE2EIntegration.test.js`
   - **Playwright Configuration & E2E Files**:
     - `client/playwright.config.js` (`baseURL: 'http://127.0.0.1:4174'`, `testDir: './e2e'`).
     - `client/e2e/hero-native-video.spec.js` (lines 179–192 assert no network requests to `youtube.com`, `youtu.be`, `youtube-nocookie.com`, `/tmdb/movie/*/videos`).
     - `client/e2e/hero-manual-retry.spec.js` (lines 103–164 test 5 manual movies, 1st native rejection, clicking Retry replays natively without scroll or index change).

---

## 2. Logic Chain

1. **Observation 1 (State & Lifecycle)** -> **State Machine Flow**:
   - `HeroSection.jsx` manages `videoGeneration` state and `generationRef`. When a trailer retry is requested, `handlePlayTrailer` calls `startPlaybackForIndex`, which executes `nextGeneration()`.
   - Incrementing `videoGeneration` updates the React `key` on `<HeroVideoRenderer>`, forcing React to unmount the previous `<HeroNativeVideo>` component and mount a new one.
   - The unmount cleanup function in `HeroNativeVideo` (`line 371`) explicitly pauses the old video and removes its `src` attribute. This guarantees the single active `<video>` element constraint.

2. **Observation 1 (Event Handlers & Verification)** -> **Playback Verification & Wrap-Around**:
   - Upon metadata load, `handleLoadedMetadata` sets a 12s timeout and triggers `requestPlay()`.
   - When playback starts, `onPlaying` triggers `beginPlaybackVerification`, which polls `currentTime` every 500ms until `currentTime - previousTime >= 0.35`s is confirmed alongside non-zero video dimensions.
   - On trailer completion, `handleEnded` in `HeroSection.jsx` waits 1,000ms and calls `switchMovie(endedIndex + 1)`. The modulo arithmetic `(endedIndex + 1) % movies.length` wraps around from the last trailer (`movies.length - 1`) back to index `0` (first trailer).

3. **Observation 1 (Retry Logic)** -> **Retry Without Scroll/Navigation**:
   - `handlePlayTrailer` clears `failedMovieKeysRef`, resets `playbackStatus` to `IDLE` and `failureReason` to `null`, and triggers `startPlaybackForIndex(currentIndex)` with manual intent.
   - It does not invoke `scrollToTrailerSection()`, `scrollIntoView()`, or route navigation, maintaining the current `currentIndex` and keeping the user in the Hero section.

4. **Observation 2 (Test Landscape & Network Assertions)** -> **Testing Strategy**:
   - Both unit tests (`client/tests/heroTrailerMode.test.js`) and E2E tests (`client/e2e/hero-manual-retry.spec.js`, `client/e2e/hero-native-video.spec.js`) are configured and active.
   - Network assertions in Playwright intercept all HTTP requests via `page.on('request')` and assert that no requests match YouTube hostnames (`youtube.com`, `youtu.be`, `youtube-nocookie.com`, `googlevideo.com`) or TMDB video API endpoints (`/tmdb/movie/*/videos`, `/api/tmdb/trailers`).

---

## 3. Caveats

- **No Code Modifications Made**: As an Explorer agent, no files in `client/src/` or `server/` were modified during this investigation.
- **Browser Autoplay Policies**: Native video playback depends on browser autoplay rules. `HeroNativeVideo.jsx` handles blocked audible autoplay by falling back to muted video and waiting for user gesture interaction.

---

## 4. Conclusion

- The native video player state machine and lifecycle (R5) are robustly designed around `videoGeneration` state keying, clean unmounting of old media elements, and strict 0.35s `currentTime` advancement tracking.
- The "Retry trailer" button logic (`handlePlayTrailer`) properly clears error states, increments `videoGeneration`, and re-triggers native HTML5 video playback without scrolling, navigating, or changing movie index.
- Single `<video>` element containment and last trailer wrap-around to first trailer are enforced by React keying and `switchMovie` modulo indexing.
- The test suite landscape across `client/tests/` and `client/e2e/` is well-established, with Playwright network assertions verifying that zero YouTube or TMDB video network requests occur during Hero trailer playback.

---

## 5. Verification Method

1. **Unit & Integration Tests**:
   - Run from `client/`:
     ```bash
     npm test
     ```
   - Verifies structural invariant tests (`heroTrailerMode.test.js`, `heroMachine.test.js`).

2. **Playwright E2E Tests**:
   - Run from `client/`:
     ```bash
     npx playwright test e2e/hero-native-video.spec.js e2e/hero-manual-retry.spec.js
     ```
   - Verifies native video mounting, `currentTime` advancement, manual retry flow without scroll, and forbidden network request assertions.

3. **Files to Inspect**:
   - `client/src/components/HeroSection.jsx`
   - `client/src/components/hero/HeroNativeVideo.jsx`
   - `client/src/components/hero/heroMachine.js`
   - `client/e2e/hero-native-video.spec.js`
   - `client/e2e/hero-manual-retry.spec.js`
