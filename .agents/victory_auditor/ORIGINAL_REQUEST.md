## 2026-08-03T11:56:52Z

You are a Forensic Auditor for NitroCine Native Hero Production Repair.
Your task is to run a thorough Forensic Audit across the entire codebase (`client/` and `server/`) to verify:
1. Integrity Forensics: ZERO integrity violations, ZERO cheating, no hardcoded test outputs, no facade/dummy implementations in client or server logic.
2. Requirement 1 (R1 - Native Media & Zero YouTube on Home): Verify Home route (`client/src/routes/Home.jsx`) mounts `NativeTrailerSection` (or equivalent native component) instead of iframe/YouTube, and enforces 0 network requests to `youtube.com`, `youtu.be`, `youtube-nocookie.com`, `googlevideo.com`, or TMDB `/videos` endpoints.
3. Requirement 2 (R2 - Unified API Configuration): Verify `client/src/lib/apiClient.js` is the single source of truth for base URL, timeout, headers, and API call helpers across client services and components (`tmdb.js`, `heroImages.js`, etc.).
4. Requirement 3 (R3 - Authoritative Manual Mode & Bypassed Shuffle): Verify backend (`server/controllers/adminController.js`, `server/services/heroService.js`) enforces exactly 5 unique native-ready movies (`heroVideoStatus === 'ready'`) returning HTTP 422 if invalid, and frontend (`HeroSection.jsx`, `heroDailyShuffle.js`) bypasses daily shuffle when `configuredMode === 'manual'`.
5. Requirement 4 (R4 - Controllers & Backend Identity): Verify `GET /api/show/hero` includes `meta` object containing `configuredMode`, `effectiveMode`, `source`, `version`, `buildSha`, `deploymentId`, and `environment`. Verify `GET /api/admin/hero` includes `liveMovies` and `manualSelection`.
6. Requirement 5 (R5 - Retry State Machine & Video Lifecycle): Verify `HeroSection.jsx` retry trailer action resets error state, clears failure reason, increments `videoGeneration`, calls `load()`/`play()` without scrolling (`window.scrollTo` or `scrollIntoView`), without navigating, and without changing index.

Run static analysis checks, inspect changed files, check tests, verify all pass (client unit: 95/95, server: 119/119, E2E: 18/18, build clean), and write your audit report to `e:\NitroCine\.agents\victory_auditor\handoff.md`. Return your verdict clearly as CLEAN or VIOLATION.
