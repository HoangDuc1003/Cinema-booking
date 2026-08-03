# Handoff Report — Milestone 5: Native Retry Playback State Machine & Carousel Invariants

**Agent**: `worker_m5`  
**Milestone**: M5 (Native Retry Playback State Machine & Carousel Invariants)  
**Target Directory**: `e:/NitroCine/.agents/worker_m5/`  
**Date**: 2026-08-03  

---

## 1. Observation

### 1.1 Source Inspection & Code Changes
1. **`client/src/components/HeroSection.jsx`**:
   - `handlePlayTrailer` (Lines 845–864):
     ```javascript
     const handlePlayTrailer = useCallback(() => {
       if (trailerMode === 'section') return;
       const key = getHeroMovieKey(currentMovie, currentIndex);
       failedMovieKeysRef.current.delete(key);
       setPlaybackStatus(HERO_PLAYBACK_STATUS.IDLE);
       setFailureReason(null);
       clearHandoff();
       cancelAudioRamp();
       clearTransitionTimers();
       if (!startPlaybackForIndex(currentIndex, {
         intent: PLAYBACK_INTENT.MANUAL,
       })) {
         scheduleFailureHandoff(currentIndex);
       }
     }, [...]);
     ```
     - Removes `currentMovieKey` from `failedMovieKeysRef.current`.
     - Resets `playbackStatus` to `HERO_PLAYBACK_STATUS.IDLE` and `failureReason` to `null`.
     - Clears stale timers (`clearHandoff()`, `cancelAudioRamp()`, `clearTransitionTimers()`).
     - Calls `startPlaybackForIndex(currentIndex, { intent: PLAYBACK_INTENT.MANUAL })` which increments `videoGeneration` via `nextGeneration()`.
     - Preserves `currentIndex` unchanged and performs zero scrolling.
   - `handleTrailerAction` (Lines 876–893):
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
     }, [...]);
     ```
     - In `native` and `hybrid` modes (when valid native source exists), delegates directly to `handlePlayTrailer()` without invoking `scrollToTrailerSection()`.
   - `handleEnded` & Carousel Index Wrapping (Lines 722–737, Lines 332–382):
     ```javascript
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
     }, [...]);
     ```
     - Modulo arithmetic in `switchMovie`:
       `const normalized = ((targetIndex % available.length) + available.length) % available.length;`
       For 5 movies (indices 0..4), when index 4 ends: `targetIndex = 4 + 1 = 5` -> `(5 % 5 + 5) % 5 = 0`. Movie 4 wraps to movie 0 exactly once after hold delay (`HERO_ENDED_POSTER_HOLD_MS` = 1,000ms).

2. **`client/src/components/hero/HeroContent.jsx`**:
   - Button Label & Disabled State Logic (Lines 47–63, Line 156):
     ```javascript
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
     ```javascript
     disabled={trailerLoading || trailerUnavailable}
     ```
     - Button label transitions cleanly: `Trailer` -> `Loading…` -> `Retry trailer` -> `Trailer unavailable`.
     - Button is enabled (`disabled = false`) when label is `Retry trailer` (`trailerLoading` is `false` and `trailerUnavailable` is `false`).

3. **`client/src/components/hero/HeroNativeVideo.jsx`**:
   - `useEffect` on `generation` change (Lines 357–369):
     ```javascript
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
   - Unmount Cleanup (Lines 371–384):
     ```javascript
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
     - Guarantees media buffers are released upon unmount and at most ONE `<video>` DOM element is active.

### 1.2 Verification Commands & Exact Output
1. **Unit Tests**:
   - Command: `cd client && npm test`
   - Output:
     ```
     ✔ heroRetryState: button label transitions (Trailer -> Loading… -> Retry trailer -> Trailer unavailable) (12.2056ms)
     ✔ heroRetryState: videoGeneration resets error states and increments generation counter (4.1952ms)
     ✔ heroRetryState: handlePlayTrailer clears failed keys, resets error state, and retries via videoGeneration without scroll (4.554ms)
     ✔ heroRetryState: HeroNativeVideo unmount cleanup maintains single active video element constraint (2.1059ms)
     ✔ heroRetryState: switchMovie uses modulo indexing for catalog wrap-around (movie 4 -> movie 0) (2.205ms)
     ✔ heroRetryState: heroMachine reducer transitions from FAILED to TRAILER_REQUESTED cleanly (1.1475ms)
     ✔ heroRetryState: feature flag semantics for native, section, and hybrid modes (0.6225ms)
     ℹ tests 101
     ℹ suites 0
     ℹ pass 101
     ℹ fail 0
     ℹ cancelled 0
     ℹ skipped 0
     ℹ todo 0
     ℹ duration_ms 1971.3601
     ```

2. **Linter**:
   - Command: `cd client && npm run lint`
   - Output:
     ```
     > client@0.0.0 lint
     > eslint .
     (exited with code 0)
     ```

3. **Production Build**:
   - Command: `cd client && npm run build`
   - Output:
     ```
     vite v8.0.10 building client environment for production...
     transforming...✓ 1938 modules transformed.
     rendering chunks...
     computing gzip size...
     dist/index.html                                    0.60 kB │ gzip:   0.36 kB
     dist/assets/Home-DldZSCsQ.js                      41.22 kB │ gzip:  13.90 kB
     dist/assets/index-Do8RP1WX.js                    409.84 kB │ gzip: 129.67 kB
     ✓ built in 820ms
     (exited with code 0)
     ```

---

## 2. Logic Chain

1. **State Machine Reset & Increment**:
   - On transient failure (`HERO_PLAYBACK_STATUS.FAILED`), `HeroContent` renders label `'Retry trailer'` because `effectiveTrailerFailed` is `true`.
   - When user clicks `'Retry trailer'`, `handleTrailerAction` calls `handlePlayTrailer()`.
   - `handlePlayTrailer()` clears `failedMovieKeysRef.current`, resets failure state (`IDLE`, `null`), clears stale timers, and invokes `startPlaybackForIndex(currentIndex, { intent: MANUAL })`.
   - `startPlaybackForIndex()` calls `nextGeneration()`, incrementing `generationRef.current` and updating state `videoGeneration`.
   - Updating `videoSource` with the new generation changes the React component key `hero-native-${videoGeneration}-${source.src}`, causing React to remount `<HeroNativeVideo>` with fresh state.

2. **Zero-Scroll & Index Preservation Invariants**:
   - `handlePlayTrailer` passes `currentIndex` to `startPlaybackForIndex` without mutating `currentIndex` state.
   - `handlePlayTrailer` does not invoke `scrollTo`, `scrollIntoView`, or `navigate`.
   - `handleTrailerAction` in `native` and `hybrid` modes delegates directly to `handlePlayTrailer()`, preventing legacy fallback scrolling when a valid native source exists.

3. **Carousel Wrapping**:
   - When movie index 4 finishes playback, `handleEnded` triggers `switchMovie(endedIndex + 1)` after hold delay (`HERO_ENDED_POSTER_HOLD_MS`).
   - `switchMovie` evaluates `normalized = ((5 % 5) + 5) % 5 = 0`, smoothly transitioning from movie index 4 to movie index 0.

4. **Single Active Video DOM Element**:
   - Render keying in `HeroMedia` ensures only one `<HeroVideoRenderer>` instance is rendered at any time.
   - On unmount, `<HeroNativeVideo>` pauses the element, removes `src`, and calls `video.load()`, releasing hardware video decoders and maintaining the single active `<video>` element invariant.

---

## 3. Caveats

- **Autoplay Browser Policies**:
  - Browser policies (`NotAllowedError`) on initial autoplay will trigger muted fallback attempt (`onAutoplayBlocked`), preserving playback state without showing failure unless both unmuted and muted attempts reject.
- **SaveData & Reduced Motion**:
  - Devices with `SaveData` or slow network constraints bypass automatic preview and require manual user tap to initiate playback.

---

## 4. Conclusion

The Hero playback state machine, retry mechanism (`videoGeneration`), button labeling, zero-scroll behavior, single active `<video>` element invariant, and carousel wrapping logic (`movie 4 -> movie 0`) have been verified, refined, and fully covered by 101 passing unit tests, zero lint errors, and a successful Vite production build.

---

## 5. Verification Method

To independently verify this implementation:

1. **Run Unit Tests**:
   ```bash
   cd client
   npm test
   ```
   Confirm all 101 tests pass, including the 7 test cases in `tests/heroRetryState.test.js`.

2. **Run Linter**:
   ```bash
   cd client
   npm run lint
   ```
   Confirm ESLint completes with zero errors or warnings.

3. **Run Production Build**:
   ```bash
   cd client
   npm run build
   ```
   Confirm Vite build succeeds cleanly without bundle errors.
