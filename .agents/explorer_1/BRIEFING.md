# BRIEFING — 2026-08-03T11:28:13+07:00

## Mission
Investigate client API calls, VITE_BASE_URL usages, Hero components, hero daily shuffle, and YouTube references to map R1, R2, R3 refactoring.

## 🔒 My Identity
- Archetype: Teamwork explorer
- Roles: Frontend and API Architecture Explorer
- Working directory: e:\NitroCine\.agents\explorer_1
- Original parent: 215d7df5-a203-4d15-ad09-e92e80eb0ab0
- Milestone: NitroCine Native Hero Production Repair Investigation

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or modify client/server source code.
- Write findings, code references, exact file paths, line numbers, and proposed refactoring strategy to `e:\NitroCine\.agents\explorer_1\analysis.md`.
- Write self-contained handoff report to `e:\NitroCine\.agents\explorer_1\handoff.md`.

## Current Parent
- Conversation ID: 215d7df5-a203-4d15-ad09-e92e80eb0ab0
- Updated: 2026-08-03T11:28:13+07:00

## Investigation State
- **Explored paths**: `client/src/` (API layer, `AppContext.jsx`, `tmdb.js`, `heroImages.js`), `client/src/pages/Home.jsx`, `client/src/components/TrailerSection.jsx`, `client/src/components/hero/*`, `client/src/utils/heroDailyShuffle.js`, `client/tests/*`, `client/e2e/*`.
- **Key findings**:
  1. `getNormalizedApiBase` is duplicated in `AppContext.jsx` and `tmdb.js`. Blueprint for `client/src/lib/apiClient.js` created (R2).
  2. `Home.jsx` imports `TrailerSection.jsx` which fetches TMDB YouTube videos and injects YouTube iframe API script. Strategy mapped for `NativeTrailerSection.jsx` to achieve zero YouTube guarantee on Home (R1).
  3. `HeroSection.jsx` unconditionally shuffles movies via `getOrComputeDailyOrder`, ignoring manual mode settings. Bypass strategy mapped for manual mode (R3).
- **Unexplored areas**: None.

## Key Decisions Made
- Completed read-only investigation. Produced `analysis.md` and 5-component `handoff.md`.

## Artifact Index
- e:\NitroCine\.agents\explorer_1\ORIGINAL_REQUEST.md — Original task request
- e:\NitroCine\.agents\explorer_1\BRIEFING.md — Persistent briefing state
- e:\NitroCine\.agents\explorer_1\progress.md — Progress log & liveness heartbeat
- e:\NitroCine\.agents\explorer_1\analysis.md — Comprehensive codebase analysis report
- e:\NitroCine\.agents\explorer_1\handoff.md — 5-component handoff report
