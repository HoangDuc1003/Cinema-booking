## 2026-08-03T19:38:19Z

<USER_REQUEST>
You are worker_m5, a worker agent implementing Milestone 5 (Native Retry Playback State Machine & Carousel Invariants) for the NitroCine Native Hero Repair project.
Your working directory is `e:/NitroCine/.agents/worker_m5/`. Create this directory if it does not exist, and write your progress.md and handoff.md there.

Task Objective: Implement and verify the native retry playback state machine, button labels, `videoGeneration` increments, zero-scroll retry behavior, single active `<video>` element, and carousel wrapping invariants (movie 4 to 0) per ORIGINAL_REQUEST.md Sections 12 & 13 and the Explorer specification in `e:/NitroCine/.agents/explorer_m5_1/handoff.md`.

Mandatory Integrity Warning:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Path to ORIGINAL_REQUEST.md: `e:/NitroCine/.agents/ORIGINAL_REQUEST.md`
Path to Explorer spec: `e:/NitroCine/.agents/explorer_m5_1/handoff.md`

Instructions:
1. Verify & Refine Hero State Machine Components:
   - `client/src/components/HeroSection.jsx`:
     - Ensure `handlePlayTrailer` resets failure state (`trailerFailed = false`), clears stale timers (`clearHandoff()`, `cancelAudioRamp()`, `clearTransitionTimers()`), removes current key from `failedMovieKeysRef`, increments `videoGeneration`, and calls `startPlaybackForIndex(currentIndex, { intent: MANUAL })`.
     - Ensure `handleTrailerAction` in `native` and `hybrid` modes calls `handlePlayTrailer()` for valid native sources without scrolling.
     - Verify `handleEnded` normalizes target index (`(4 + 1) % 5 = 0`), wrapping movie 4 to movie 0 exactly once after hold delay.
   - `client/src/components/hero/HeroContent.jsx`:
     - Ensure button labels: `Trailer` (idle), `Loading…` (loading), `Retry trailer` (retryable error), `Trailer unavailable` (missing source).
     - Ensure button is enabled when label is `Retry trailer`.
   - `client/src/components/hero/HeroNativeVideo.jsx`:
     - Ensure `useEffect` on `generation` change triggers `video.load()`.
     - Ensure unmount cleanup pauses video, clears `src`, and calls `video.load()`.

2. Add / Update Component Unit Tests:
   - Create or update unit test files in `client/tests/heroRetryState.test.js` or `client/src/components/hero/__tests__/` covering:
     - Button label transitions (`Trailer` -> `Loading…` -> `Retry trailer` -> `Trailer unavailable`).
     - Native retry execution: transient play failure displays `Retry trailer`, user click calls `handlePlayTrailer`, increments `videoGeneration`, calls `video.play()` second time, keeps `currentIndex` unchanged, and does NOT call `scrollTo`.
     - Carousel wrap: movie 4 ending transitions to movie 0 after hold delay.
     - Single active `<video>` element in DOM.
   - Run `cd client && npm test`
   - Run `cd client && npm run lint`
   - Run `cd client && npm run build`

3. Document all changed files, test commands, and exact outputs in `e:/NitroCine/.agents/worker_m5/handoff.md`.

Send a message when finished referencing the handoff report path.
</USER_REQUEST>
