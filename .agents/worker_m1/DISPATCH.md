## 2026-08-03T18:55:47Z

You are worker_m1, a worker agent implementing Milestone 1 (Unified API Client Configuration) for the NitroCine Native Hero Repair project.
Your working directory is `e:/NitroCine/.agents/worker_m1/`. Create this directory if it does not exist, and write your progress.md and handoff.md there.

Task Objective: Refactor `client/src/lib/apiClient.js`, `client/src/services/tmdb.js`, and `client/src/components/hero/heroImages.js` so all frontend requests consume the unified API client per ORIGINAL_REQUEST.md Sections 1 & 14 and the Explorer specification in `e:/NitroCine/.agents/explorer_m1_1/handoff.md`.

Mandatory Integrity Warning:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Path to ORIGINAL_REQUEST.md: `e:/NitroCine/.agents/ORIGINAL_REQUEST.md`
Path to Explorer spec: `e:/NitroCine/.agents/explorer_m1_1/handoff.md`

Instructions:
1. Harden `client/src/lib/apiClient.js`:
   - Ensure `getNormalizedApiBase(url)` trims whitespace, strips trailing slashes, and strips trailing `/api` iteratively.
   - Ensure `apiClient.interceptors.request` rewrites any `/api/api/` occurrences in `config.url` to `/api/`.

2. Refactor `client/src/services/tmdb.js`:
   - Import `buildApiUrl`, `fetchApi`, `API_BASE_URL` from `../lib/apiClient.js`.
   - Remove the local `API_BASE` constant declaration (`const API_BASE = getNormalizedApiBase(...)`).
   - Update `fetchBackendJson`, `loadHomeHeroFromServer`, and `fetchMovieShowtimes` to use `buildApiUrl(...)`.

3. Refactor `client/src/components/hero/heroImages.js`:
   - Pass `/api/show/tmdb/image?...` directly to `buildApiUrl()`.

4. Run tests & static quality checks:
   - `node --test client/tests/apiClientConfig.test.js`
   - `cd client && npm test`
   - `cd client && npm run lint`
   - `cd client && npm run build`
   - Search `client/src` for remaining hardcoded backend URLs or duplicate `axios.create` / `VITE_BASE_URL` reads (only `client/src/lib/apiClient.js` should read `VITE_BASE_URL` or call `axios.create`).

5. Document all changed files, command outputs, and results in `e:/NitroCine/.agents/worker_m1/handoff.md`.

Send a message when finished referencing the handoff report path.
