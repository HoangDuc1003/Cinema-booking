## 2026-08-02T16:34:05Z
You are Worker 3 implementing Milestone 2 (Requirements R3 & R4) for NitroCine.
Your working directory for metadata/reports is: e:/NitroCine/.agents/worker_m2

Context & References:
- Read Explorer 3 report: e:/NitroCine/.agents/explorer_3/handoff.md
- Read requirements in e:/NitroCine/.agents/ORIGINAL_REQUEST.md (R3, R4, and Follow-up constraints 4 & 5)
- Read e:/NitroCine/AGENTS.md and e:/NitroCine/client/src/components/hero/AGENTS.md

Task Instructions:
1. Implement Requirement R3 (Fix Retry Button & Trailer Flow):
   - Modify `client/src/components/HeroSection.jsx` and `client/src/components/hero/HeroContent.jsx`.
   - Update `handleTrailerAction`: when native playback fails (`trailerFailed === true`), clicking "Retry trailer" must invoke `handlePlayTrailer()` (retrying native playback in Hero) instead of calling `scrollToTrailerSection()`.
   - Ensure retry implementation clears previous error state, increments a retry nonce/attempt counter (`retryAttempt`/`retryNonce`), re-invokes video source load/play (`video.load()`, `video.play()`), preserves current movie & Hero index, and avoids window scrolling.

2. Implement Requirement R4 (Feature Flag for Trailer Mode):
   - Read `VITE_HERO_TRAILER_MODE` from environment (`import.meta.env.VITE_HERO_TRAILER_MODE`). Default is `'hybrid'`.
   - Support exact modes: `'native'`, `'section'`, `'hybrid'`.
   - `'native'`: Use native Hero video player; never scroll to TrailerSection; Retry retries native playback in Hero.
   - `'section'`: Native player disabled in Hero; Trailer button scrolls to TrailerSection; do not display Retry trailer for native playback.
   - `'hybrid'` (default): Try native playback first when valid native video source exists; Retry retries native playback in Hero; use TrailerSection ONLY when no valid native source exists (do NOT automatically scroll away merely because one playback attempt failed).

3. Testing & Build Verification:
   - Add/update unit tests in `client/src/components/hero/__tests__/` (or `client` `npm test`) for native trailer retry action (verifying retry resets error state & replays without scroll) and `VITE_HERO_TRAILER_MODE` behaviors.
   - Run `npm test` in `e:/NitroCine/client` — MUST pass 73+ tests.
   - Run `npm run build` in `e:/NitroCine/client` — MUST succeed with exit code 0.

4. Handoff:
   - Write `changes.md` and `handoff.md` in `e:/NitroCine/.agents/worker_m2/`. Send message to orchestrator (conversation ID: ca391f6d-5a51-4e2d-b813-4224c779f542) when completed.
