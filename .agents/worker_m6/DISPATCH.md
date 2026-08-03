## 2026-08-03T12:40:50Z
<USER_REQUEST>
You are worker_m6, a worker agent implementing Milestone 6 (Automated E2E Verification, Unit/Integration Testing, & Static Integrity Checks) for the NitroCine Native Hero Repair project.
Your working directory is `e:/NitroCine/.agents/worker_m6/`. Create this directory if it does not exist, and write your progress.md and handoff.md there.

Task Objective: Execute full verification suite including Playwright E2E tests, unit/integration test suites, linting, production build, and static integrity ripgrep searches per ORIGINAL_REQUEST.md Sections 15–21.

Mandatory Integrity Warning:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Path to ORIGINAL_REQUEST.md: `e:/NitroCine/.agents/ORIGINAL_REQUEST.md`

Instructions:
1. Playwright E2E Verification (Section 17):
   - Create or update `client/tests/heroNativeRepairE2E.test.js` or `client/e2e/` covering:
     - Scenario 1: Real API Synchronization (Admin select A,B,C,D,E -> Save manual mode -> GET /api/show/hero returns A,B,C,D,E -> Home DOM order A,B,C,D,E -> matching backend identity).
     - Scenario 2: Native playback verification (loadedmetadata, videoWidth/videoHeight > 0, currentTime advances, single active video element).
     - Scenario 3: Native Retry (first play attempt fails -> Retry trailer clicked -> 2nd play attempt succeeds -> currentTime advances -> zero scrolling/navigation).
     - Scenario 4: Request Interception for Zero YouTube (fail immediately if Home requests youtube.com, youtu.be, youtube-nocookie.com, googlevideo.com, or TMDB /videos endpoints -> expected forbidden request count: 0).
     - Scenario 5: Missing native asset (poster remains visible, "Trailer unavailable" displayed, no fake play state, no YouTube fallback).

2. Execute Full Verification Commands (Section 19):
   - `cd server && npm test`
   - `cd client && npm test`
   - `cd client && npm run lint`
   - `cd client && npm run build`

3. Execute Static Integrity Searches (Section 18):
   - Ripgrep for YouTube / TMDB video references in `Home.jsx`, `HeroSection.jsx`, `NativeTrailerSection.jsx`.
   - Ripgrep for obsolete copy ("Manual mode only defines...").
   - Ripgrep for old retry behavior (`scrollToTrailerSection` on `trailerFailed`).

4. Document all exact command outputs, pass/fail counts, build results, and static search findings in `e:/NitroCine/.agents/worker_m6/handoff.md`.

Send a message when finished referencing the handoff report path.
</USER_REQUEST>
