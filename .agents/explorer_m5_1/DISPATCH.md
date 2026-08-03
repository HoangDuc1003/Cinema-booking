## 2026-08-03T19:37:15+07:00
You are explorer_m5_1, an exploration agent for Milestone 5 (Native Retry Playback State Machine & Carousel Invariants) of the NitroCine Native Hero Repair project.
Your working directory is `e:/NitroCine/.agents/explorer_m5_1/`. Create this directory if it does not exist, and write your progress.md and handoff.md there.

Task Objective: Investigate `client/src/components/HeroSection.jsx`, `client/src/components/hero/HeroContent.jsx`, `client/src/components/hero/HeroNativeVideo.jsx`, and `client/src/components/hero/heroMachine.js` to formulate a precise implementation plan for the native retry state machine, button labels, `videoGeneration` tracking, and carousel wrapping per ORIGINAL_REQUEST.md Sections 12 & 13.

Path to ORIGINAL_REQUEST.md: `e:/NitroCine/.agents/ORIGINAL_REQUEST.md`

Instructions:
1. Code Analysis:
   - `client/src/components/HeroSection.jsx`: Inspect `handleTrailerAction`, `handlePlayTrailer`, `scrollToTrailerSection`, failure handling, `failedMovieKeysRef`, `videoGeneration`, index transition logic (wrapping movie 4 to 0), and timer cleanups.
   - `client/src/components/hero/HeroContent.jsx`: Inspect trailer button labeling (`Trailer`, `Loading…`, `Retry trailer`, `Trailer unavailable`).
   - `client/src/components/hero/HeroNativeVideo.jsx`: Inspect video lifecycle, `video.load()`, `video.play()`, `loadedmetadata`, `currentTime` advancement, and single active `<video>` element enforcement.

2. Design the Specification:
   - Failure classification:
     - Retryable: transient network/media error, startup timeout, play() promise rejection.
     - Permanent unavailable: no source, invalid binding, status not ready, unsupported MIME, unapproved host, YouTube URL.
   - Button Labels in `HeroContent.jsx`:
     - Initial valid action -> `Trailer`
     - Loading -> `Loading…`
     - Retryable failure -> `Retry trailer`
     - Permanent unavailable -> `Trailer unavailable`
   - Retry logic in `HeroSection.jsx`:
     - Keep `currentIndex` unchanged.
     - Clear retryable failure state (`trailerFailed = false`).
     - Remove current movie key from `failedMovieKeysRef`.
     - Clear stale timers.
     - Increment `videoGeneration`.
     - Call `video.load()` / `video.play()` without scrolling, navigating away, or calling `scrollToTrailerSection()`.
   - `handleTrailerAction` mode semantics:
     - In `native` and `hybrid` mode with a valid native source (including retryable failure): call `handlePlayTrailer()`.
     - Delete legacy code scrolling to `TrailerSection` on `trailerFailed`.
   - Carousel wrap & single video element:
     - Final movie (index 4) ending wraps to index 0 exactly once without double-advancing.
     - Only one `<video>` element active at any time.

3. Document all findings and specifications in `e:/NitroCine/.agents/explorer_m5_1/handoff.md`.

Send a message when finished referencing the handoff report path.
