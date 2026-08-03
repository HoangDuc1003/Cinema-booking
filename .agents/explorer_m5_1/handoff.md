# Handoff Report — Milestone 5: Native Retry Playback State Machine & Carousel Invariants

**Agent**: `explorer_m5_1`  
**Milestone**: M5 (Native Retry Playback State Machine & Carousel Invariants)  
**Target Repository**: `e:/NitroCine`  
**Date**: 2026-08-03  

---

## 1. Observation

Direct investigation of the codebase was conducted on `client/src/components/HeroSection.jsx`, `client/src/components/hero/HeroContent.jsx`, `client/src/components/hero/HeroNativeVideo.jsx`, `client/src/components/hero/heroMachine.js`, and `client/src/components/hero/heroVideoSource.js`.

### 1.1 `client/src/components/HeroSection.jsx`
- **`handleTrailerAction` (Lines 901–918)**:
  ```js
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
  - In `native` mode: delegates directly to `handlePlayTrailer()`.
  - In `hybrid` mode: delegates to `handlePlayTrailer()` whenever `trailerAvailable` is `true`.
  - In `section` mode: delegates to `scrollToTrailerSection()`.
  - **Key Observation**: Legacy code that scrolled to `TrailerSection` when `trailerFailed` was true has been eliminated from `handleTrailerAction`.

- **`handlePlayTrailer` (Lines 870–887)**:
  ```js
  const handlePlayTrailer = useCallback(() => {
    if (trailerMode === 'section') return;
    const key = getHeroMovieKey(currentMovie, currentIndex);
    failedMovieKeysRef.current.delete(key);
    setPlaybackStatus(HERO_PLAYBACK_STATUS.IDLE);
    setFailureReason(null);
    if (!startPlaybackForIndex(currentIndex, {
      intent: PLAYBACK_INTENT.MANUAL,
    })) {
      scheduleFailureHandoff(currentIndex);
    }
  }, [currentIndex, currentMovie, scheduleFailureHandoff, startPlaybackForIndex, trailerMode]);
  ```
  - Removes the current movie key from `failedMovieKeysRef.current`.
  - Resets `playbackStatus` to `HERO_PLAYBACK_STATUS.IDLE` and `failureReason` to `null`.
  - Keeps `currentIndex` unchanged.
  - Calls `startPlaybackForIndex(currentIndex, { intent: PLAYBACK_INTENT.MANUAL })`.

- **`startPlaybackForIndex` & `videoGeneration` Tracking (Lines 273–330)**:
  ```js
  clearHandoff();
  cancelAudioRamp();
  const generation = nextGeneration();
  manualPlaybackRef.current = manual;
  playerRef.current = null;
  setFailureReason(null);
  setPlaybackStatus(HERO_PLAYBACK_STATUS.REQUESTED);
  setVideoVisible(false);
  setVideoSource({ ...source, generation });
  ```
  - `nextGeneration()` increments `generationRef.current` and sets `videoGeneration` state.
  - Updating `videoSource` with new `generation` forces the React element `key={`hero-native-${videoGeneration}-${source.version || source.src}`}` to change, which remounts `<HeroNativeVideo>` with the new generation.

- **`handleEnded` & Carousel Index Wrapping (Lines 722–737, Lines 332–382)**:
  ```js
  const handleEnded = useCallback(({ generation }) => {
    if (generation !== generationRef.current) return;
    const endedIndex = currentIndexRef.current;
    stopPlayback();
    if (moviesRef.current.length < 2) return;
    clearHandoff();
    handoffTimerRef.current = window.setTimeout(() => {
      handoffTimerRef.current = null;
      if (!mountedRef.current || currentIndexRef.current !== endedIndex) return;
      switchMovie(endedIndex + 1, {
        animate: true,
        continuePlayback: true,
        intent: PLAYBACK_INTENT.CONTINUATION,
      });
    }, HERO_ENDED_POSTER_HOLD_MS);
  }, [clearHandoff, stopPlayback, switchMovie]);
  ```
  - Index calculation in `switchMovie`:
    `const normalized = ((targetIndex % available.length) + available.length) % available.length;`
    For 5 movies (indices 0..4), when index 4 ends: `endedIndex + 1` = 5 -> `5 % 5` = 0. Movie 4 wraps to movie 0.
  - Guarded by `if (generation !== generationRef.current) return;` so stale `ended` events are ignored.
  - Stale handoff timers are cleared via `clearHandoff()`.

### 1.2 `client/src/components/hero/HeroContent.jsx`
- **Button Label Calculation (Lines 47–64)**:
  ```js
  const trailerUnavailable = failureReason === HERO_FAILURE_REASONS.MISSING_VIDEO
    || trailerAvailable === false;
  const isSectionMode = trailerMode === 'section';
  const effectiveTrailerFailed = trailerFailed && !isSectionMode;

  const trailerLabel = trailerLoading
    ? 'Loading\u2026'
    : trailerUnavailable
      ? 'Trailer unavailable'
      : effectiveTrailerFailed
        ? 'Retry trailer'
        : 'Trailer';
  ```
  - Button state:
    - Disabled when `trailerLoading` or `trailerUnavailable` is `true`.
    - Active / clickable when `effectiveTrailerFailed` is `true` (displaying `'Retry trailer'`).

### 1.3 `client/src/components/hero/HeroNativeVideo.jsx`
- **Lifecycle & Single Video Node (Lines 357–435)**:
  - Component mounts a single `<video>` element with `autoPlay`, `playsInline`, `preload="metadata"`, `controls={false}`.
  - On `generation` or `src` change:
    ```js
    useEffect(() => {
      failedGenerationRef.current = null;
      automaticResumeCountRef.current = 0;
      clearTimers();
      const video = videoRef.current;
      if (video) {
        try { video.load(); } catch {}
      }
    }, [clearTimers, generation, src]);
    ```
  - On unmount cleanup:
    ```js
    useEffect(() => () => {
      latestRef.current = { ...latestRef.current, enabled: false, active: false };
      clearTimers();
      const video = videoRef.current;
      if (!video) return;
      try {
        video.pause();
        video.removeAttribute('src');
        sourceRef.current?.removeAttribute('src');
        video.load();
      } catch {}
    }, [clearTimers]);
    ```
  - Ensures previous media stream/buffers are released and at most ONE `<video>` DOM element exists across the entire Hero section.

- **Playback Verification (`currentTime` advancement, Lines 176–226)**:
  - Uses `hasAdvancedPlayback` (`currentTime - initialTime >= 0.35s`), `videoWidth > 0 && videoHeight > 0`, and playing state before triggering `onPlaybackStable` and `onVisualReady`.

### 1.4 `client/src/components/hero/heroMachine.js`
- Defines canonical state machine constants:
  - `HERO_PHASES`: `POSTER`, `TRAILER_LOADING`, `TRAILER_ENTERING`, `TRAILER_EXPANDED`, `TRAILER_COMPACT`, `TRAILER_FAILED`.
  - `HERO_PLAYBACK_STATUS`: `IDLE`, `REQUESTED`, `PLAYING`, `STABLE`, `PAUSED`, `FAILED`.
  - `HERO_FAILURE_REASONS`: `AUTOPLAY_BLOCKED`, `TIMEOUT`, `VIDEO_ERROR`, `MISSING_VIDEO`.
  - Helpers: `hasAdvancedPlayback`, `isExpectedPlayback`, `heroReducer`.

### 1.5 `client/src/components/hero/heroVideoSource.js`
- Source Resolver & Security Rules:
  - `resolveConfiguredHeroVideoSource(movie, options)` requires `movie.heroVideoStatus === 'ready'`, safe native MIME type (`video/mp4` or `video/webm`), HTTPS in production, host validation (matching `res.cloudinary.com` or configured hosts).
  - Explicitly rejects iframe URLs, YouTube hostnames (`youtube.com`, `youtu.be`, `youtube-nocookie.com`, `googlevideo.com`), unsafe protocols (`javascript:`, `data:`, `blob:`), and missing sources.

---

## 2. Logic Chain

### 2.1 Failure Classification Logic
1. **Observation**: `heroVideoSource.js` returns `null` for unverified, missing, YouTube, or invalid sources. `HeroSection.jsx` sets `failureReason = MISSING_VIDEO` when no source is returned.
2. **Reasoning**: Failures fall into two distinct operational classes:
   - **Retryable Failure**: Occurs when a valid native source exists (`resolveConfiguredHeroVideoSource(movie)` returns valid object), but runtime execution fails due to network transient error (`VIDEO_ERROR`), startup timeout (`TIMEOUT`), or initial autoplay policy rejection (`AUTOPLAY_BLOCKED` / play rejection). In this state, `trailerAvailable` remains `true`, and `trailerFailed` becomes `true`.
   - **Permanent Unavailable**: Occurs when no valid native source exists (missing `heroVideoUrl`, `heroVideoStatus !== 'ready'`, unsupported MIME, unapproved domain, YouTube URL). In this state, `trailerAvailable` is `false` (or `failureReason === MISSING_VIDEO`).
3. **Conclusion**: The UI can cleanly differentiate retryable state from permanent absence by checking `trailerAvailable` and `failureReason`.

### 2.2 Button Labeling State Machine
1. **Observation**: `HeroContent.jsx` evaluates button label using `trailerLoading`, `trailerUnavailable`, `effectiveTrailerFailed`.
2. **Reasoning**:
   - When media is loading: show `Loading…` (disabled = true).
   - When media is permanently unavailable: show `Trailer unavailable` (disabled = true).
   - When media attempt failed transiently (`effectiveTrailerFailed` is true): show `Retry trailer` (disabled = false).
   - When idle with valid source: show `Trailer` (disabled = false).
   - When trailer is actively playing (`trailerActive` is true): hide trailer action button and display audio volume control.
3. **Conclusion**: The button labels conform strictly to ORIGINAL_REQUEST.md Section 12 specifications.

### 2.3 Native Retry Execution Flow & Invariants
1. **Observation**: User clicks `Retry trailer` -> `handleTrailerAction()` -> `handlePlayTrailer()`.
2. **Reasoning Step-by-Step**:
   - `currentIndex` remains unchanged.
   - `failedMovieKeysRef.current.delete(currentMovieKey)` removes failure mark.
   - `setPlaybackStatus(HERO_PLAYBACK_STATUS.IDLE)` clears failure state.
   - `clearHandoff()`, `cancelAudioRamp()`, `clearTransitionTimers()` clear stale timers.
   - `nextGeneration()` increments `videoGeneration` (`generationRef.current += 1`).
   - `setVideoSource({ ...source, generation })` triggers React render with updated key `hero-native-${videoGeneration}-...`.
   - `HeroNativeVideo` remounts, resets `failedGenerationRef.current`, executes `video.load()`, and calls `video.play()` on metadata/canplay event.
   - No scroll (`scrollToTrailerSection` is NOT called), no navigation, no movie index modification, no legacy trailer fallback.

### 2.4 Mode Semantics (`native`, `hybrid`, `section`)
1. **Observation**: `VITE_HERO_TRAILER_MODE` controls trailer behavior via `getHeroTrailerMode()`.
2. **Reasoning**:
   - Mode `native`: Hero handles native playback. Retry performs another native attempt. If no source, displays `Trailer unavailable`. Never scrolls to `TrailerSection`.
   - Mode `hybrid`: Tries native Hero playback first for valid source. Clicking Retry performs native retry without scrolling. Legacy auto-scroll on failure is completely disabled.
   - Mode `section`: Opens/scrolls to `NativeTrailerSection` (or section element). Does not display `Retry trailer` for native player.

### 2.5 Carousel Wrapping & Single `<video>` Element Invariants
1. **Observation**: Carousel index calculation uses modulo arithmetic `normalized = ((targetIndex % N) + N) % N`.
2. **Reasoning**:
   - For 5 movies (indices 0..4), when index 4 ends, `endedIndex + 1` = 5. Normalized index = `5 % 5 = 0`.
   - `handleEnded` checks `if (generation !== generationRef.current) return;` so stale ended events cannot trigger state changes.
   - Holds poster for `HERO_ENDED_POSTER_HOLD_MS` (1,000ms) before advancing to movie 0.
   - Auto carousel timer (`HERO_AUTO_CAROUSEL_MS` = 5,000ms) is paused while `videoSource` is non-null, preventing race conditions or double-advancing.
   - React keying ensures exactly ONE `<video>` element is rendered. Unmount cleanup explicitly pauses media and resets `src`.

---

## 3. Caveats

1. **Network Handoff & Startup Timeout**:
   - The native player startup timeout is set to 12,000ms (`HERO_PLAYBACK_TIMEOUT_MS`). On extremely slow networks, media metadata loading might hit timeout, setting `playbackStatus = FAILED` with reason `TIMEOUT`. This is correctly classified as a retryable failure (`Retry trailer`).
2. **Browser Autoplay & Audio Policy**:
   - If initial audible autoplay is blocked by browser policy (`NotAllowedError`), `HeroNativeVideo` automatically retries once muted (`handleAutoplayBlocked`). If unmuted gesture fails, user can click `Turn trailer sound on` control.
3. **Mock Video Fixture Flag**:
   - Development mock video (`/mock/hero-trailer.mp4`) is active ONLY when `?heroMock=1` is present in URL in dev mode. In production, HTTPS CDN sources are strictly required.

---

## 4. Conclusion & Precise Specification

The Hero component architecture in `HeroSection.jsx`, `HeroContent.jsx`, `HeroNativeVideo.jsx`, `heroMachine.js`, and `heroVideoSource.js` fully defines the state machine, retry semantics, button labeling, `videoGeneration` tracking, and carousel wrapping invariants required for Milestone 5.

### 4.1 Recommended Implementation Checklist for M5 Implementer
1. **`HeroSection.jsx`**:
   - Verify `handlePlayTrailer` clears `failedMovieKeysRef`, resets failure state, clears stale timers (`clearHandoff()`, `cancelAudioRamp()`, `clearTransitionTimers()`), and increments `videoGeneration`.
   - Confirm `handleTrailerAction` in `native` and `hybrid` modes calls `handlePlayTrailer()` without scrolling when a valid native source exists.
   - Confirm index wrapping `switchMovie(endedIndex + 1)` normalizes index 4 -> index 0.
2. **`HeroContent.jsx`**:
   - Confirm trailer action button labels: `Trailer`, `Loading…`, `Retry trailer`, `Trailer unavailable`.
   - Ensure button is enabled when label is `Retry trailer`.
3. **`HeroNativeVideo.jsx`**:
   - Ensure `useEffect` on `generation` change calls `video.load()`.
   - Ensure unmount cleanup pauses video, strips `src`, and calls `video.load()`.
4. **`heroMachine.js`**:
   - Ensure state transition helper functions (`hasAdvancedPlayback`, `isExpectedPlayback`) remain exportable and covered by unit tests.

---

## 5. Verification Method

### 5.1 Unit Tests Verification
Run existing hero component unit tests:
```bash
npm test -- client/src/components/hero/__tests__/heroTrailerMode.test.js
```
Add/Verify tests covering:
- **Button Labels**: `Trailer` (idle), `Loading…` (loading), `Retry trailer` (retryable error), `Trailer unavailable` (missing source).
- **Retry Action**: Mocking `video.play()` rejection on first attempt -> verifying `Retry trailer` label -> clicking button -> verifying `videoGeneration` incremented, `video.play()` called second time, `currentIndex` unchanged, `scrollTo` NOT called.
- **Carousel Wrap**: Simulating `onEnded` on index 4 -> verifying next index is 0 after hold delay, transition occurs exactly once.

### 5.2 Integration / E2E Verification
Run Playwright retry & carousel scenarios:
```bash
npx playwright test --grep "Hero Native Retry"
```
Verify:
1. First `play()` promise rejection displays "Retry trailer".
2. User click on "Retry trailer" re-attempts playback on the exact same movie.
3. No `scrollIntoView` or section navigation occurs.
4. `currentTime` advances past 0.35s on second attempt.
5. Final movie (index 4) ending wraps to index 0 smoothly.
6. Zero requests to `youtube.com`, `youtu.be`, `googlevideo.com`, or TMDB video endpoints.
