# Handoff Report — Milestone 5 Review (Native Retry Playback State Machine & Carousel Invariants)

**Agent**: `reviewer_m5_1`  
**Milestone**: M5 Review  
**Target Directory**: `e:/NitroCine/.agents/reviewer_m5_1/`  
**Date**: 2026-08-03  
**Verdict**: **APPROVE**

---

## 1. Observation

### 1.1 Source Code Verification & Contract Compliance
1. **Button Labels & Disabled State (`client/src/components/hero/HeroContent.jsx`)**:
   - Lines 47–63:
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
   - Line 156:
     ```javascript
     disabled={trailerLoading || trailerUnavailable}
     ```
   - **Verification**: Button label transitions cleanly through `Trailer` -> `Loading…` -> `Retry trailer` -> `Trailer unavailable`. Button is enabled (`disabled = false`) when rendering `Retry trailer`.

2. **State Machine Reset & Zero-Scroll Retry (`client/src/components/HeroSection.jsx`)**:
   - `handlePlayTrailer` (Lines 870–893):
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
   - **Verification**: `failedMovieKeysRef.current.delete(key)` removes current movie from failed keys. Resets `playbackStatus` to `HERO_PLAYBACK_STATUS.IDLE` and `failureReason` to `null`. Clears stale handoff and transition timers. Calls `startPlaybackForIndex(currentIndex)` which invokes `nextGeneration()`, incrementing `videoGeneration`. Preserves `currentIndex` without scrolling or navigating away.

3. **Trailer Action Delegation (`client/src/components/HeroSection.jsx`)**:
   - `handleTrailerAction` (Lines 907–924):
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
   - **Verification**: In `native` and `hybrid` (when native source is available) modes, delegates directly to `handlePlayTrailer()`. Eliminates legacy fallback scrolling when a valid native source exists.

4. **Carousel Wrapping Invariant (`client/src/components/HeroSection.jsx`)**:
   - `handleEnded` & `switchMovie` (Lines 722–737, Lines 339):
     ```javascript
     const normalized = ((targetIndex % available.length) + available.length) % available.length;
     ```
   - **Verification**: For 5 movies (indices 0..4), when movie 4 ends (`targetIndex = 4 + 1 = 5`), `(5 % 5 + 5) % 5 = 0`. Movie 4 wraps to movie 0 exactly once after hold delay (`HERO_ENDED_POSTER_HOLD_MS` = 1,000ms).

5. **Single Active `<video>` Element & Resource Cleanup (`client/src/components/hero/HeroNativeVideo.jsx`)**:
   - Lines 357–369 (`useEffect` on `generation` / `src` change):
     Calls `video.load()`.
   - Lines 371–384 (Unmount cleanup):
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
   - **Verification**: Keying on `<HeroVideoRenderer key={`hero-native-${videoGeneration}-${videoSource.version || videoSource.src}`}>` in `HeroSection.jsx` guarantees that React unmounts the old video player instance upon `videoGeneration` change, pausing video playback, stripping the `src` attribute, and executing `video.load()` to release hardware resources and enforce a single active `<video>` DOM node.

### 1.2 Verification Commands & Results

1. **Unit Test Suite**:
   - Command: `cd client && npm test`
   - Exit Code: `0`
   - Output Summary:
     ```
     ✔ heroRetryState: button label transitions (Trailer -> Loading… -> Retry trailer -> Trailer unavailable) (14.1798ms)
     ✔ heroRetryState: videoGeneration resets error states and increments generation counter (2.5646ms)
     ✔ heroRetryState: handlePlayTrailer clears failed keys, resets error state, and retries via videoGeneration without scroll (3.5795ms)
     ✔ heroRetryState: HeroNativeVideo unmount cleanup maintains single active video element constraint (1.7094ms)
     ✔ heroRetryState: switchMovie uses modulo indexing for catalog wrap-around (movie 4 -> movie 0) (1.5059ms)
     ✔ heroRetryState: heroMachine reducer transitions from FAILED to TRAILER_REQUESTED cleanly (1.0073ms)
     ✔ heroRetryState: feature flag semantics for native, section, and hybrid modes (0.3499ms)
     ℹ tests 101
     ℹ suites 0
     ℹ pass 101
     ℹ fail 0
     ℹ duration_ms 2070.1279
     ```

2. **Linter Verification**:
   - Command: `cd client && npm run lint`
   - Exit Code: `0`
   - Output: `eslint .` (0 errors, 0 warnings)

3. **Production Build Verification**:
   - Command: `cd client && npm run build`
   - Exit Code: `0`
   - Output: `vite build` completed successfully in 786ms.

---

## 2. Logic Chain

1. **Integrity & Implementation Audit**:
   - Checked for integrity violations (hardcoded test outputs, dummy implementations, shortcuts): None detected.
   - `videoGeneration` is dynamically incremented by `nextGeneration()` inside `startPlaybackForIndex`, which changes the React component `key` on `<HeroVideoRenderer>`, triggering a real DOM unmount/remount cycle.
   - `HeroNativeVideo` unmount cleanup releases decoders by calling `pause()`, removing `src`, and invoking `load()`.
   - `handlePlayTrailer` resets state without calling any scrolling methods (`scrollTo`, `scrollIntoView`, or `navigate`).

2. **Contract Compliance**:
   - Meets all requirements specified in `ORIGINAL_REQUEST.md` Sections 12 & 13.
   - All 101 unit tests in `client` (including the 7 focused `heroRetryState` test cases) pass without regressions.

---

## 3. Caveats

- **Browser Autoplay Policies**: Initial unmuted autoplay blocks trigger a single muted retry fallback (`handleAutoplayBlocked`) before declaring failure, consistent with modern browser security policies.

---

## 4. Conclusion

The native retry playback state machine, button labeling transitions, zero-scroll retry behavior, `videoGeneration` keying, single active `<video>` element resource management, and carousel index wrapping invariants implemented in Milestone 5 strictly adhere to requirements.

**Final Verdict**: **APPROVE**

---

## 5. Verification Method

To independently verify:
```bash
cd client
npm test
npm run lint
npm run build
```
Confirm all 101 tests pass, linter exits with code 0, and Vite production build succeeds cleanly.
