## 2026-08-03T04:46:02Z

<USER_REQUEST>
You are Worker 4 implementing Milestone 4: Native Video State Machine & Retry Lifecycle (R5) for NitroCine Native Hero Production Repair.
Working directory for metadata: e:\NitroCine\.agents\implementer_4

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Task:
1. Read Explorer 3's handoff report at `e:\NitroCine\.agents\explorer_3\handoff.md` and analysis at `e:\NitroCine\.agents\explorer_3\analysis.md`.
2. Refactor `client/src/components/HeroSection.jsx`, `client/src/components/hero/HeroContent.jsx`, `client/src/components/hero/HeroNativeVideo.jsx`, and `client/src/components/hero/heroMachine.js`:
   - Reuse existing `videoGeneration` state mechanism for retry resets.
   - In `handlePlayTrailer` / retry flow: clear `failedMovieKeysRef`, reset `playbackStatus` to `IDLE`, set `failureReason` to `null`, increment `videoGeneration`, and trigger new native `load()` / `play()` attempt.
   - Ensure "Retry trailer" does NOT execute `scrollToTrailerSection()`, does NOT scroll into view, does NOT navigate away, and does NOT alter `currentIndex`.
   - Maintain single active `<video>` element constraint in `HeroNativeVideo.jsx` unmount cleanup.
   - Ensure last trailer wrap-around to first trailer works via modulo indexing in `switchMovie`.
   - Enforce feature flag semantics (`VITE_HERO_TRAILER_MODE` = `native` | `section` | `hybrid`).
3. Add/update unit and integration tests in `client/tests/` (e.g. `heroTrailerMode.test.js`, `heroMachine.test.js`, `heroRetryState.test.js`).
4. Run client unit tests (`cd client && npm test`) and document exact results.
5. Record all modified files, test outputs, and verification in `e:\NitroCine\.agents\implementer_4\changes.md` and `e:\NitroCine\.agents\implementer_4\handoff.md`.

</USER_REQUEST>
