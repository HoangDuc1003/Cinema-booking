# BRIEFING — 2026-08-03T04:47:55Z

## Mission
Implement Milestone 4: Native Video State Machine & Retry Lifecycle (R5) for NitroCine Native Hero Production Repair.

## 🔒 My Identity
- Archetype: implementer
- Roles: implementer, qa, specialist
- Working directory: e:\NitroCine\.agents\implementer_4
- Original parent: 215d7df5-a203-4d15-ad09-e92e80eb0ab0
- Milestone: Milestone 4 - Native Video State Machine & Retry Lifecycle (R5)

## 🔒 Key Constraints
- Reuse existing videoGeneration state mechanism for retry resets.
- Retry flow: clear failedMovieKeysRef, reset playbackStatus to IDLE, set failureReason to null, increment videoGeneration, trigger new native load()/play() attempt.
- "Retry trailer" does NOT execute scrollToTrailerSection(), does NOT scroll into view, does NOT navigate away, and does NOT alter currentIndex.
- Maintain single active <video> element constraint in HeroNativeVideo.jsx unmount cleanup.
- Ensure last trailer wrap-around to first trailer works via modulo indexing in switchMovie.
- Enforce feature flag semantics (VITE_HERO_TRAILER_MODE = native | section | hybrid).
- Do NOT hardcode test results or fabricate verification.

## Current Parent
- Conversation ID: 215d7df5-a203-4d15-ad09-e92e80eb0ab0
- Updated: 2026-08-03T04:47:55Z

## Task Summary
- **What to build**: Refactor hero state machine, HeroSection, HeroContent, HeroNativeVideo for retry lifecycle, videoGeneration, single video element cleanup, modulo index wrap-around, and VITE_HERO_TRAILER_MODE feature flag semantics.
- **Success criteria**: Tests pass, retry flow works cleanly without scrolling/navigating/altering index, clean unmount/single video, correct wrap-around, feature flag semantics enforced.
- **Interface contracts**: e:\NitroCine\AGENTS.md
- **Code layout**: client/src/components/hero/

## Change Tracker
- **Files modified**:
  - client/src/components/HeroSection.jsx — updated startPlaybackForIndex visibility check to allow manual playback intent to proceed cleanly
  - client/tests/heroRetryState.test.js — created 6 new unit tests for R5 retry state machine, single video cleanup, modulo wrap-around, and feature flags
- **Build status**: Pass (95/95 unit tests passing)
- **Pending issues**: None

## Quality Status
- **Build/test result**: Pass (95 passed, 0 failed, 1558ms duration)
- **Lint status**: Clean
- **Tests added/modified**: client/tests/heroRetryState.test.js added (6 new tests)

## Loaded Skills
- None

## Key Decisions Made
- Allowed manual playback intent (PLAYBACK_INTENT.MANUAL) to bypass strict visibility gates in startPlaybackForIndex so button clicks trigger immediate retry.
- Added comprehensive unit test suite in client/tests/heroRetryState.test.js.

## Artifact Index
- e:\NitroCine\.agents\implementer_4\ORIGINAL_REQUEST.md
- e:\NitroCine\.agents\implementer_4\BRIEFING.md
- e:\NitroCine\.agents\implementer_4\changes.md
- e:\NitroCine\.agents\implementer_4\handoff.md
