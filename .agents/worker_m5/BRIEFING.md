# BRIEFING — 2026-08-03T19:39:27Z

## Mission
Implement and verify native retry playback state machine, button labels, videoGeneration increments, zero-scroll retry behavior, single active video element, and carousel wrapping invariants (movie 4 to 0) for NitroCine Native Hero Repair.

## 🔒 My Identity
- Archetype: implementer/qa/specialist
- Roles: implementer, qa, specialist
- Working directory: e:\NitroCine\.agents\worker_m5
- Original parent: e14f91bd-ba15-44de-843f-f55a126c6b81
- Milestone: M5

## 🔒 Key Constraints
- Minimal change principle.
- Native video player only, zero YouTube/TMDB lookups on Home.
- Retry must clear failure state, increment videoGeneration, re-attempt play without scrolling, navigating, or changing index.
- Carousel must wrap movie 4 to movie 0 after hold delay.
- Exactly one active <video> element in DOM.
- Do not cheat, modify existing tests merely to match implementation, or fabricate results.

## Current Parent
- Conversation ID: e14f91bd-ba15-44de-843f-f55a126c6b81
- Updated: 2026-08-03T19:39:27Z

## Task Summary
- **What to build**: Verification & refinement of Hero state machine components (HeroSection.jsx, HeroContent.jsx, HeroNativeVideo.jsx) and unit tests for button labels, native retry execution, carousel wrapping, single active video element.
- **Success criteria**:
  - handlePlayTrailer resets failure state, clears timers, removes current key from failedMovieKeysRef, increments videoGeneration, calls startPlaybackForIndex.
  - handleTrailerAction calls handlePlayTrailer for valid native sources without scrolling in native & hybrid modes.
  - handleEnded normalizes target index (4+1)%5=0 after hold delay.
  - Button labels: Trailer -> Loading… -> Retry trailer -> Trailer unavailable. Enabled when label is Retry trailer.
  - HeroNativeVideo: useEffect on generation change triggers video.load(), unmount cleanup pauses video, clears src, calls video.load().
  - Comprehensive unit tests created/updated and passing (`npm test`, `npm run lint`, `npm run build`).
- **Interface contracts**: ORIGINAL_REQUEST.md Sections 12 & 13, explorer_m5_1 handoff.md.
- **Code layout**: client/src/components/HeroSection.jsx, client/src/components/hero/HeroContent.jsx, client/src/components/hero/HeroNativeVideo.jsx, client/tests/heroRetryState.test.js

## Key Decisions Made
- Clear stale timers (`clearHandoff()`, `cancelAudioRamp()`, `clearTransitionTimers()`) in `handlePlayTrailer` before invoking `startPlaybackForIndex`.
- Use `videoGeneration` state to force remount/reload of `<HeroNativeVideo>` on retry.
- Explicitly test button label transitions, retry execution, modulo index wrap, and DOM `<video>` cleanup in `client/tests/heroRetryState.test.js`.

## Change Tracker
- **Files modified**:
  - `client/src/components/HeroSection.jsx`: Added explicit `clearHandoff()`, `cancelAudioRamp()`, `clearTransitionTimers()` calls inside `handlePlayTrailer`.
  - `client/tests/heroRetryState.test.js`: Added dedicated unit tests covering button label transitions, retry execution without scroll, carousel wrap (movie 4 to movie 0), and single active video element invariants.
- **Build status**: PASS (101 unit tests passed, ESLint clean, Vite build successful).
- **Pending issues**: None.

## Quality Status
- **Build/test result**: 101 tests passed, 0 failed.
- **Lint status**: 0 violations (ESLint clean).
- **Tests added/modified**: `client/tests/heroRetryState.test.js` updated with 7 focused assertions.

## Loaded Skills
- **Source**: e:\NitroCine\.agents\skills\hero-runtime-debug\SKILL.md
  - **Local copy**: e:\NitroCine\.agents\worker_m5\skills\hero-runtime-debug.md
  - **Core methodology**: Debug Home Hero playback failures, classification of failures, zero YouTube/iframe enforcement, verify currentTime advancement.
- **Source**: e:\NitroCine\.agents\skills\verify-change\SKILL.md
  - **Local copy**: e:\NitroCine\.agents\worker_m5\skills\verify-change.md
  - **Core methodology**: Review changes against AGENTS.md, reject invalid test shortcuts, run unit/lint/build tests, verify runtime behavior.

## Artifact Index
- e:\NitroCine\.agents\worker_m5\DISPATCH.md — Task dispatch request
- e:\NitroCine\.agents\worker_m5\progress.md — Heartbeat progress log
- e:\NitroCine\.agents\worker_m5\handoff.md — Handoff report
