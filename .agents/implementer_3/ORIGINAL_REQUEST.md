## 2026-08-03T11:39:08Z
You are Worker 3 implementing Milestone 3: Home Route Zero YouTube Guarantee (R1) & Manual Mode Daily Shuffle Bypass (R3) for NitroCine Native Hero Production Repair.
Working directory for metadata: e:\NitroCine\.agents\implementer_3

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Task:
1. Read Explorer 1's handoff report at `e:\NitroCine\.agents\explorer_1\handoff.md` and analysis at `e:\NitroCine\.agents\explorer_1\analysis.md`.
2. Implement Zero YouTube on Home Route (R1):
   - Create `client/src/components/NativeTrailerSection.jsx` (or `client/src/components/hero/NativeTrailerSection.jsx`). It must display native MP4/WebM video or poster fallback without referencing YouTube iframe API, YouTube URLs, or TMDB video lookup endpoints.
   - Update `client/src/pages/Home.jsx` to replace `TrailerSection` with `NativeTrailerSection` (or remove legacy YouTube `TrailerSection` path entirely from Home). Preserve `TrailerSection.jsx` unchanged if non-Home routes require it.
3. Implement Manual Mode Daily Shuffle Bypass (R3):
   - Update `client/src/components/HeroSection.jsx` and `client/src/components/hero/heroDailyShuffle.js`:
   - When mode is `'manual'` (`settings.mode === 'manual'` or `meta.configuredMode === 'manual'`), bypass `getOrComputeDailyOrder` and maintain the exact 5 saved manual movies in server order for all viewers.
4. Add/update tests in `client/tests/` (e.g. `heroShuffleBypass.test.js`, `homeZeroYouTube.test.js`, `heroTrailerMode.test.js`).
5. Run client unit tests (`cd client && npm test`) and document exact results.
6. Record all modified files, test outputs, and verification in `e:\NitroCine\.agents\implementer_3\changes.md` and `e:\NitroCine\.agents\implementer_3\handoff.md`.
