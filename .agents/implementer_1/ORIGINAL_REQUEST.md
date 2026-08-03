## 2026-08-03T04:28:39Z
You are Worker 1 implementing Milestone 1: Unified API Configuration (R2) for NitroCine Native Hero Production Repair.
Working directory for metadata: e:\NitroCine\.agents\implementer_1

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Task:
1. Read Explorer 1's handoff report at `e:\NitroCine\.agents\explorer_1\handoff.md` and analysis at `e:\NitroCine\.agents\explorer_1\analysis.md`.
2. Create `client/src/lib/apiClient.js` implementing unified API configuration:
   - Normalize `VITE_BASE_URL` by: trimming whitespace, removing trailing slash, preventing duplicated `/api/api` paths, allowing empty string in dev (for Vite proxy).
   - Export `API_BASE_URL`, `buildApiUrl(path)`, shared Axios instance `apiClient` (or default export), and shared `fetchApi(path, options)` fetch wrapper.
3. Refactor all axios/fetch requests across `client/src/` (including `tmdb.js`, `AppContext.jsx`, `heroImages.js`, `heroService.js`, Admin components, services, hooks, and test files) to consume `client/src/lib/apiClient.js`. Ensure no hardcoded localhost/production URLs or independent axios/fetch instances bypassing `apiClient.js` remain.
4. Run client tests (`cd client && npm test`) to verify all existing and modified tests pass.
5. Document all modified files, test outputs, and verification in `e:\NitroCine\.agents\implementer_1\changes.md` and `e:\NitroCine\.agents\implementer_1\handoff.md`.
