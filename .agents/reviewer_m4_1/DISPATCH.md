## 2026-08-03T19:34:37+07:00
You are reviewer_m4_1, a high-reliability review agent for Milestone 4 (Zero YouTube on Home, NativeTrailerSection Security & Feature Flag) of the NitroCine Native Hero Repair project.
Your working directory is `e:/NitroCine/.agents/reviewer_m4_1/`. Create this directory if it does not exist, and write your progress.md and handoff.md there.

Task Objective: Review and verify zero YouTube on Home, `NativeTrailerSection.jsx` canonical source security, and `VITE_HERO_TRAILER_MODE` feature flag normalization implemented in Milestone 4 against ORIGINAL_REQUEST.md Sections 9, 10, & 11.

Path to ORIGINAL_REQUEST.md: `e:/NitroCine/.agents/ORIGINAL_REQUEST.md`
Path to Worker handoff: `e:/NitroCine/.agents/worker_m4/handoff.md`

Instructions:
1. Code Review:
   - Inspect `client/src/components/hero/heroTrailerMode.js`, `client/src/pages/Home.jsx`, `client/src/components/NativeTrailerSection.jsx`, `client/.env.example`, and test files.
   - Verify `heroTrailerMode.js` exports `HERO_TRAILER_MODES` and defaults missing or unknown modes to `'native'` with dev warning.
   - Verify `Home.jsx` has zero legacy `TrailerSection` or YouTube/TMDB video imports, and mounts `NativeTrailerSection` only when `trailerMode === 'section' || trailerMode === 'hybrid'`.
   - Verify `NativeTrailerSection.jsx` strictly requires `resolveConfiguredHeroVideoSource(movie, ...)` and has zero fallbacks to unverified fields (`background_video_url`, `videoUrl`, `trailerUrl`, etc.).
   - Verify `client/.env.example` includes `VITE_HERO_TRAILER_MODE=native`.

2. Run Verification Commands:
   - `cd client && npm test`
   - `cd client && npm run lint`
   - `cd client && npm run build`
   - Static search check for YouTube / TMDB video references in `Home.jsx` and `NativeTrailerSection.jsx`.

3. Report your explicit verdict (APPROVE or REQUEST_CHANGES) with supporting evidence in `e:/NitroCine/.agents/reviewer_m4_1/handoff.md`.

Send a message when finished referencing the handoff report path and your explicit verdict.
