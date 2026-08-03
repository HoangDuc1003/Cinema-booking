# Review Handoff Report — Reviewer 8: Milestone 4 Native Video State Machine & Retry Lifecycle (R5)

**Date**: 2026-08-03
**Agent**: Reviewer 8 (reviewer, critic)
**Working Directory**: `e:\NitroCine\.agents\reviewer_8`
**Target Milestone**: Milestone 4: Native Video State Machine & Retry Lifecycle (R5)
**Verdict**: **PASS**

---

## 1. Observation

1. **Source Code Code Inspection**:
   - `client/src/components/HeroSection.jsx`:
     - Line 142: `const [videoGeneration, setVideoGeneration] = useState(0);`
     - Lines 238–242: `nextGeneration` callback increments `generationRef.current` and calls `setVideoGeneration(generationRef.current)`.
     - Lines 275–284: `startPlaybackForIndex` allows manual playback intent (`intent === PLAYBACK_INTENT.MANUAL`) to proceed without being blocked by unsettled `heroVisible` or `documentVisible` states.
     - Lines 874–894: `handlePlayTrailer` deletes the current key from `failedMovieKeysRef`, increments `retryNonceRef.current`, resets `playbackStatus` to `HERO_PLAYBACK_STATUS.IDLE`, resets `failureReason` to `null`, and calls `startPlaybackForIndex(currentIndex, { intent: PLAYBACK_INTENT.MANUAL, retryNonce: retryNonceRef.current })`.
     - Lines 874–894: `handlePlayTrailer` contains no calls to `scrollToTrailerSection()`, `scrollIntoView()`, or `navigate()`, and does not alter `currentIndex`.
     - Lines 337–344: `switchMovie` calculates `const normalized = ((targetIndex % available.length) + available.length) % available.length;`, guaranteeing exact modulo wrap-around (e.g. from index `movies.length - 1` + 1 to index `0`).
     - Lines 894–926: `handleTrailerAction` respects `VITE_HERO_TRAILER_MODE` semantics (`'native'`, `'section'`, `'hybrid'`).
     - Line 1020: `<HeroVideoRenderer key={`hero-native-${videoGeneration}-${videoSource.version || videoSource.src}`}` uses `videoGeneration` in its React `key` to force unmount/remount on retry.

   - `client/src/components/hero/HeroNativeVideo.jsx`:
     - Lines 371–385: React unmount cleanup effect:
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
       Guarantees pause, attribute removal, and `video.load()` buffer clearing on component unmount, upholding the single active `<video>` element constraint in the DOM.

   - `client/src/components/hero/HeroContent.jsx`:
     - Lines 53–60: `effectiveTrailerFailed = trailerFailed && !isSectionMode;` renders button text `'Retry trailer'` when native trailer fails in `native` or `hybrid` mode.
     - Lines 147–164: Click handler invokes `onToggleTrailer()` (`handleTrailerAction`) without side effects on position or current index.

   - `client/src/components/hero/heroMachine.js`:
     - `heroReducer` handles `TRAILER_REQUESTED` and state resets cleanly, resetting `failureReason: null` and setting `playbackStatus: HERO_PLAYBACK_STATUS.IDLE` / `TRAILER_LOADING`.

2. **Test Suite Execution**:
   - Tool Command: `cd client && npm test`
   - Command Output:
     ```text
     ✔ 95 pass
     ✔ 0 fail
     ℹ duration_ms 1532.0436
     ```
   - All 6 tests in `client/tests/heroRetryState.test.js` passed cleanly:
     - `heroRetryState: videoGeneration resets error states and increments generation counter`
     - `heroRetryState: handlePlayTrailer clears failed keys, resets error state, and retries natively without scroll`
     - `heroRetryState: HeroNativeVideo unmount cleanup maintains single active video element constraint`
     - `heroRetryState: switchMovie uses modulo indexing for catalog wrap-around (last -> first trailer)`
     - `heroRetryState: heroMachine reducer transitions from FAILED to TRAILER_REQUESTED cleanly`
     - `heroRetryState: feature flag semantics for native, section, and hybrid modes`

3. **Production Build Execution**:
   - Command: `cd client && npm run build`
   - Result: Built successfully in 604ms with 0 errors/warnings.

4. **Integrity Violations Audit**:
   - Verified no hardcoded test outputs, facade implementations, or bypasses.
   - All tests execute real logic and assertion checks on state transitions and DOM cleanup mechanics.

---

## 2. Logic Chain

1. **Observation 1 & 2 (Retry Flow)** -> **Clean Error Clearing & Generation Counter Increment**:
   - Clicking "Retry trailer" triggers `handleTrailerAction` -> `handlePlayTrailer`.
   - `handlePlayTrailer` deletes the current movie key from `failedMovieKeysRef`, resets `playbackStatus` to `IDLE`, sets `failureReason` to `null`, and calls `startPlaybackForIndex(currentIndex, { intent: PLAYBACK_INTENT.MANUAL })`.
   - `startPlaybackForIndex` invokes `nextGeneration()`, updating `videoGeneration` state and `generationRef.current`.
   - Changing `videoGeneration` changes the React `key` of `<HeroVideoRenderer>`, forcing React to unmount the failed video renderer instance and mount a fresh instance.
   - `handlePlayTrailer` contains zero calls to `scrollIntoView`, `scrollToTrailerSection`, or `navigate`, and leaves `currentIndex` unchanged.

2. **Observation 1 & 2 (DOM Cleanup Invariant)** -> **Single Active `<video>` Element**:
   - When the old `<HeroVideoRenderer>` unmounts, `HeroNativeVideo` unmount cleanup pauses the video, removes `src` from `<video>` and `<source>`, and executes `video.load()`.
   - This releases media resources in the browser engine before the new video element mounts.
   - Invariant verified: exactly ONE active HTML5 `<video>` element exists in the DOM.

3. **Observation 1 & 2 (Wrap-Around Indexing)** -> **Catalog Modulo Navigation**:
   - When the trailer at `endedIndex = movies.length - 1` finishes, `handleEnded` calls `switchMovie(endedIndex + 1)`.
   - `switchMovie` computes `((targetIndex % available.length) + available.length) % available.length`.
   - For `targetIndex = 5` in a 5-movie list, `(5 % 5 + 5) % 5` resolves to `0`, wrapping seamlessly from the last trailer to the first trailer.

4. **Observation 1 & 2 (Feature Flags)** -> **`VITE_HERO_TRAILER_MODE` Semantics**:
   - `'native'`: `handleTrailerAction` calls `handlePlayTrailer()` directly.
   - `'section'`: Native auto-start is disabled (`startPlaybackForIndex` returns `false`), `effectiveTrailerFailed` is suppressed in UI, and clicking Trailer action scrolls to `#trailers`.
   - `'hybrid'`: Tries native video playback when `resolveMovieSource(currentMovie)` is available; falls back to `#trailers` scroll if missing.

---

## 3. Caveats

No caveats. All requirements for Milestone 4 (R5) Native Video State Machine & Retry Lifecycle are fully satisfied, verified by unit tests, and compliant with project constraints.

---

## 4. Conclusion

- **Verdict**: **PASS**
- Implementation meets all functional, architectural, and test requirements.
- Native video state machine correctly clears error state, resets `playbackStatus` to `IDLE`, sets `failureReason` to `null`, increments `videoGeneration`, and replays native video in-place without scrolling or route navigation.
- Unmount cleanup maintains the single active `<video>` element invariant.
- Modulo index wrap-around from last to first trailer is verified.
- `VITE_HERO_TRAILER_MODE` modes (`native`, `section`, `hybrid`) behave strictly as specified.
- Test suite passes 95/95 tests with zero failures.

---

## 5. Verification Method

To independently verify this evaluation:

1. **Run Unit Test Suite**:
   ```bash
   cd client && npm test
   ```
   *Expected Output*: 95 tests pass, 0 fail.

2. **Run Production Build**:
   ```bash
   cd client && npm run build
   ```
   *Expected Output*: Build completes with 0 errors.

3. **Inspect Implementation Files**:
   - `client/src/components/HeroSection.jsx` (lines 142, 238-242, 337-344, 874-926)
   - `client/src/components/hero/HeroNativeVideo.jsx` (lines 371-385)
   - `client/src/components/hero/HeroContent.jsx` (lines 53-60)
   - `client/src/components/hero/heroMachine.js` (lines 156-166, 297-318)
   - `client/tests/heroRetryState.test.js` (6 unit tests)
