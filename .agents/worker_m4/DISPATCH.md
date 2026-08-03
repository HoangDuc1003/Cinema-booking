## 2026-08-03T12:33:25Z

You are worker_m4, a worker agent implementing Milestone 4 (Zero YouTube on Home, NativeTrailerSection Security & Feature Flag) for the NitroCine Native Hero Repair project.
Your working directory is `e:/NitroCine/.agents/worker_m4/`. Create this directory if it does not exist, and write your progress.md and handoff.md there.

Task Objective: Implement zero YouTube on Home, secure `NativeTrailerSection.jsx` to require canonical server-verified sources, and normalize `VITE_HERO_TRAILER_MODE` feature flag (default `native`) per ORIGINAL_REQUEST.md Sections 9, 10, & 11 and the Explorer specification in `e:/NitroCine/.agents/explorer_m4_2/handoff.md`.

Mandatory Integrity Warning:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Path to ORIGINAL_REQUEST.md: `e:/NitroCine/.agents/ORIGINAL_REQUEST.md`
Path to Explorer spec: `e:/NitroCine/.agents/explorer_m4_2/handoff.md`

Instructions:
1. Update `client/src/components/hero/heroTrailerMode.js`:
   - Export `HERO_TRAILER_MODES = Object.freeze({ NATIVE: 'native', SECTION: 'section', HYBRID: 'hybrid' })`.
   - Update `getHeroTrailerMode(envMode)`: default missing or unknown modes to `'native'`. Log a single console.warn in development mode for unknown mode values.

2. Update `client/src/pages/Home.jsx`:
   - Import `getHeroTrailerMode` from `../components/hero/heroTrailerMode`.
   - Evaluate `const trailerMode = getHeroTrailerMode()`.
   - Mount `NativeTrailerSection` inside `DeferredSection` only when `trailerMode === 'section' || trailerMode === 'hybrid'`. In `native` mode, do NOT mount `NativeTrailerSection`.
   - Ensure zero legacy `TrailerSection` or YouTube imports/references exist in `Home.jsx`.

3. Update `client/src/components/NativeTrailerSection.jsx`:
   - Update `resolveNativeTrailerSource(movie)`: strictly require `resolveConfiguredHeroVideoSource(movie, ...)` and return `configured?.src ? configured : null`.
   - Eliminate fallbacks to unverified fields (`background_video_url`, `videoUrl`, `trailerUrl`, client-side regex parsing).

4. Update `client/.env.example`:
   - Add `VITE_HERO_TRAILER_MODE=native`.

5. Update Frontend Unit Tests:
   - Update test cases in `client/tests/heroTrailerMode.test.js` and `client/src/components/hero/__tests__/heroTrailerMode.test.js` to assert default `'native'`.
   - Add static verification test asserting zero YouTube/TMDB video imports in `Home.jsx` and `NativeTrailerSection.jsx`.
   - Run `cd client && npm test`
   - Run `cd client && npm run lint`
   - Run `cd client && npm run build`

6. Document all changed files, test commands, and exact outputs in `e:/NitroCine/.agents/worker_m4/handoff.md`.

Send a message when finished referencing the handoff report path.
