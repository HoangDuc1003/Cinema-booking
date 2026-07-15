## 2026-07-15T15:23:29Z
You are the Worker Implementation. Your working directory is e:\NitroCine\.agents\worker_implementation.
Your mission is to implement the required architectural changes (R1, R2, R3, R4, and API diagnostics) in the Home Hero codebase of NitroCine.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please implement the following requirements:

1. R1 — Remove YouTube from the Hero Flow:
   - In `client/src/components/HeroSection.jsx`:
     - Remove `fetchMovieTrailers` from imports.
     - Remove the YouTube/TMDB fallback branch from `loadHeroVideoSource` or where it resolves.
     - Resolve only a configured ready native source (check `heroVideoUrl`, `heroVideoStatus === 'ready'`, and `heroVideoMimeType`).
     - Return null when no ready native source exists.
     - Treat null as a valid poster-only state: do not display an automatic missing-video error for poster-only movies, and do not automatically switch to another movie because native media is absent.
   - In `client/src/components/hero/HeroVideoRenderer.jsx`:
     - Ensure that only native video source is rendered in the Hero flow (render `<HeroNativeVideo>` or nothing). Ensure no iframe is created in the hero section and no YouTube player is initialized.
     - YouTube behavior in TrailerSection must not be changed. Do not delete YouTube components or utilities used by other parts of the application.

2. R2 — Remove arbitrary reveal delays, keep event-driven safety:
   - Remove `posterWarmupMs`, visual timing gates, and YouTube-specific quarantine from the native reveal path.
   - The native video may begin loading and playing muted behind the poster while the entry loader is visible.
   - Reveal native video as soon as all media conditions are satisfied:
     - generation is current;
     - source belongs to the active movie;
     - video emitted playing event;
     - readyState is at least HAVE_CURRENT_DATA (2);
     - currentTime advanced between two samples (use a short Technical polling interval like 100ms-250ms, not a multi-second visual delay);
     - Hero is visible;
     - document is visible;
     - no waiting, stalled, pause, abort, emptied or error event occurred after the successful sample.
   - Raise the poster immediately on: `waiting`, `stalled`, `pause`, `error`, source change, movie change, stale generation, document hidden, Hero outside viewport.

3. R3 — Autoplay must remain muted:
   - Automatic native Hero playback must always start and remain muted.
   - Remove all logic that automatically unmutes after reveal, stable playback, loader completion, stored preference, etc.
   - Only direct user interaction on the volume control may unmute.
   - Stored preference may be kept for UI display, but must not automatically unmute playback.
   - Effective muted must be true during autoplay, poster, pause, buffering, and source switch.

4. R3 — Remove inactive movie prefetching:
   - Remove `preloadRemainingTrailerSources` and any equivalent behavior.
   - Do not fetch metadata/videos or create hidden players for inactive movies.
   - Only the active movie may request native media. Inactive movies load only poster, backdrop, or thumbnail images.
   - When switching movies: pause the previous video, clear the previous source, invalidate stale callbacks, request only the newly active movie's media, and keep exactly one active video element.

5. R4 — Preserve server order:
   - Do not call `selectBestHeroMovies` on server-returned movies. Do not sort or reorder based on popularity, rating, or native score.
   - For a successful `/api/show/hero` response, preserve the exact server order using:
     ```javascript
     const rawMovies = Array.isArray(data.movies) && data.movies.length ? data.movies : dummyShowsData;
     const orderedMovies = rawMovies.slice(0, HERO_MAX_MOVIES);
     ```
   - Client-side scoring/sorting may be used only for local dummy fallback data when the server request fails.

6. API Source Diagnostics:
   - Expose a data attribute `data-catalog-source="server|fallback|mock"` in the DOM of the Hero component to indicate whether it used server movies, fallback/mock data, or dummy fallback.

Please execute this implementation step-by-step. Run `npm test` and `npm run lint` and the Playwright tests on `client/e2e/hero-native-only.spec.js` after implementation to verify that your changes compile, lint, and all failing invariant E2E tests now pass.

Write a handoff report in e:\NitroCine\.agents\worker_implementation\handoff.md detailing the files changed, code snippets modified, commands executed, and confirmation of passing tests.
Send a message back to the orchestrator (conversation ID: 9f88cabf-25d2-421d-9c70-870f33e0309c) when you are finished.
