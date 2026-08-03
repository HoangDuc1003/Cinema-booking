# Progress Log — worker_m1

Last visited: 2026-08-03T18:57:50Z

- [x] Initialized workspace and DISPATCH.md / BRIEFING.md
- [x] Step 1: Harden `client/src/lib/apiClient.js` (iterative /api stripping in `getNormalizedApiBase`, regex global `/api/api/` rewriting in request interceptor)
- [x] Step 2: Refactor `client/src/services/tmdb.js` (imported `buildApiUrl`, `fetchApi`, `API_BASE_URL`, removed local `API_BASE`, updated `fetchBackendJson`, `loadHomeHeroFromServer`, `fetchMovieShowtimes` to use `buildApiUrl`)
- [x] Step 3: Refactor `client/src/components/hero/heroImages.js` (passed `/api/show/tmdb/image?...` directly to `buildApiUrl`)
- [x] Step 4: Run tests & static quality checks (`node --test client/tests/apiClientConfig.test.js`, `npm test`, `npm run lint`, `npm run build`, `grep_search` checks)
- [x] Step 5: Document in handoff.md and send completion message
