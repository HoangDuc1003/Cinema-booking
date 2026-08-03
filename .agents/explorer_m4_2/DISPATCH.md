## 2026-08-03T19:32:11Z

<USER_REQUEST>
You are explorer_m4_2, a replacement exploration agent for Milestone 4 (Zero YouTube on Home, NativeTrailerSection Security & Feature Flag) of the NitroCine Native Hero Repair project.
Your working directory is `e:/NitroCine/.agents/explorer_m4_2/`. Create this directory if it does not exist, and write your progress.md and handoff.md there.

Task Objective: Investigate `client/src/pages/Home.jsx`, `client/src/components/NativeTrailerSection.jsx`, `client/src/components/hero/heroTrailerMode.js`, `client/src/components/TrailerSection.jsx`, and `client/.env.example` to formulate an exact implementation plan for zero YouTube on Home, native trailer security, and `VITE_HERO_TRAILER_MODE` feature flag handling per ORIGINAL_REQUEST.md Sections 9, 10, & 11.

Path to ORIGINAL_REQUEST.md: `e:/NitroCine/.agents/ORIGINAL_REQUEST.md`

Instructions:
1. Code Inspection:
   - `client/src/pages/Home.jsx`: Inspect imports, section mounting (`TrailerSection` vs `NativeTrailerSection`), `onTrailerRequest` handling, and mode-based conditional rendering based on `getHeroTrailerMode()`.
   - `client/src/components/NativeTrailerSection.jsx`: Inspect `resolveNativeTrailerSource()`, current fallbacks (`background_video_url`, `videoUrl`, `trailerUrl`), and API fetch calls.
   - `client/src/components/hero/heroTrailerMode.js`: Inspect current mode normalization logic (currently defaults to `hybrid` instead of `native`).
   - `client/.env.example`: Inspect existing env template.

2. Design the Specification:
   - `Home.jsx`:
     - Remove legacy `TrailerSection` import and component execution path from `Home.jsx` entirely.
     - Read `trailerMode = getHeroTrailerMode()`.
     - In `native` mode: render `HeroSection` only, do not mount any lower trailer section.
     - In `section` mode: mount `NativeTrailerSection` only.
     - In `hybrid` mode: mount `HeroSection` and conditionally `NativeTrailerSection` if needed, but do not automatically navigate/scroll on single playback failure.
     - Ensure no YouTube or TMDB trailer lookups are triggered from Home.
   - `NativeTrailerSection.jsx`:
     - Update `resolveNativeTrailerSource()` to strictly use `resolveConfiguredHeroVideoSource(movie, ...)`. Remove fallbacks to `background_video_url`, `videoUrl`, `trailerUrl`, arbitrary strings.
     - Ensure no TMDB `/videos` or YouTube API calls occur.
   - `heroTrailerMode.js`:
     - Default to `'native'` when missing or unknown.
     - Export `HERO_TRAILER_MODES = { NATIVE: 'native', SECTION: 'section', HYBRID: 'hybrid' }`.
     - Add `VITE_HERO_TRAILER_MODE=native` to `client/.env.example`.

3. Document all findings and specifications in `e:/NitroCine/.agents/explorer_m4_2/handoff.md`.

Send a message when finished referencing the handoff report path.
</USER_REQUEST>
