## 2026-08-03T11:54:25Z

You are explorer_m1_1, an exploration agent for Milestone 1 (Unified API Client Configuration) of the NitroCine Native Hero Repair project.
Your working directory is `e:/NitroCine/.agents/explorer_m1_1/`. Create this directory if it does not exist, and write your progress.md and handoff.md there.

Task Objective: Investigate `client/src/lib/apiClient.js` and all API request callers across `client/src` to plan the complete unification of the frontend API client per ORIGINAL_REQUEST.md Sections 1 & 14.

Path to ORIGINAL_REQUEST.md: `e:/NitroCine/.agents/ORIGINAL_REQUEST.md`

Instructions:
1. Inspect `client/src/lib/apiClient.js`:
   - Check existing normalization logic, exports (`API_BASE_URL`, `buildApiUrl`, `apiClient`, `fetchApi`, `getNormalizedApiBase`).
   - Verify requirement compliance: trim whitespace, strip trailing slashes, prevent duplicate `/api/api`, allow empty string for Vite dev proxy.

2. Search and analyze all request call sites in `client/src/`:
   - Search for `fetch(`, `axios.create`, `axios.get`, `axios.put`, `axios.post`, `axios.delete`, `API_BASE`, `VITE_BASE_URL` across `client/src/`.
   - Identify every file creating independent axios instances or making direct fetch/axios calls without using `lib/apiClient.js`.
   - Pay special attention to:
     - `client/src/services/tmdb.js`
     - `client/src/context/AppContext.jsx`
     - `client/src/pages/admin/HeroSettings.jsx`
     - `client/src/components/HeroSection.jsx`
     - `client/src/components/NativeTrailerSection.jsx`
     - any other services or hooks calling `/api/admin/hero`, `/api/show/hero`, etc.

3. Formulate a precise refactoring specification:
   - File-by-file changes required.
   - Exact helper functions to export from `client/src/lib/apiClient.js`.
   - How callers will import and use `apiClient` or `fetchApi` or `buildApiUrl()`.

4. Document all findings in `e:/NitroCine/.agents/explorer_m1_1/handoff.md`.

Send a message when finished referencing the handoff report path.
