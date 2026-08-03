## 2026-08-03T11:24:25+07:00
<USER_REQUEST>
You are Explorer 1 for NitroCine Native Hero Production Repair.
Working directory for metadata: e:\NitroCine\.agents\explorer_1

Your task:
1. Thoroughly investigate frontend files in `client/src/` to map:
   - All axios / fetch API calls, hardcoded backend URLs, `VITE_BASE_URL` usages, `tmdb.js`, `AppContext.jsx`, Admin API calls, services, hooks, and test files.
   - Requirements for creating `client/src/lib/apiClient.js` (R2) that normalizes `VITE_BASE_URL`, exports base URL, `buildApiUrl()`, shared Axios instance, and shared fetch wrapper.
2. Investigate `client/src/pages/Home.jsx` and all components in `client/src/components/hero/` (`HeroContent.jsx`, `HeroSection.jsx`, `TrailerSection.jsx`, `heroDailyShuffle.js`, etc.):
   - Detect all YouTube iframes, YouTube Player API usages, TMDB video API calls, external video embeds, or network requests to youtube/TMDB video endpoints.
   - Map out how to remove legacy `TrailerSection` execution path or replace it with `NativeTrailerSection` (R1) to achieve a zero-YouTube guarantee on the Home route.
   - Map out `heroDailyShuffle.js` and how manual mode will bypass daily shuffle (R3).
3. Do NOT edit any source code. Write your findings, code references, exact file paths, line numbers, and proposed refactoring strategy to `e:\NitroCine\.agents\explorer_1\analysis.md` and a self-contained handoff report to `e:\NitroCine\.agents\explorer_1\handoff.md`.

</USER_REQUEST>
