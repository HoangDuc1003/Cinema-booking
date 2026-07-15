# Root-Cause Report: Restoring the NitroCine Hero Native-Only Architecture

This report details the baseline state, E2E test results, and root-cause analysis of the architectural regression in the Home Hero.

---

## 1. Observation

### Git Workspace Status
- **Current Branch**: `main`
- **Current HEAD SHA**: `ca586882218e69e4ad38b979b1f21e2aa5fc36a4`
- **Working Tree Status**: Clean (except untracked `.agents/` and `AGENTS.md` files)

### Baseline Command Execution Results

#### 1. Unit Tests (`npm test` in `client/`)
- **Command**: `npm test`
- **Result**: All **54 tests passed** successfully in 204ms.

#### 2. Linter (`npm run lint` in `client/`)
- **Command**: `npm run lint`
- **Result**: **Failed** with 1 error:
  ```
  E:\NitroCine\client\e2e\hero-native-only.spec.js
    51:21  error  'Buffer' is not defined  no-undef
  ```
  *Note*: Line 51 uses `Buffer.from` to create a mock MP4 payload, but `Buffer` is not imported from `node:buffer`.

#### 3. Production Build (`npm run build` in `client/`)
- **Command**: `npm run build`
- **Result**: **Succeeded** completely in 675ms.

#### 4. Playwright E2E Tests (`npx playwright test` in `client/`)
- **Command**: `npx playwright test`
- **Result**: **8 failures**, 1 skipped, 31 passed.
- **Failed Test Details**:
  1. `[chrome/webkit] › e2e\hero-direct-play.spec.js › TEST I — COMPACT TITLE`
     - **Error**: `expect(details).toHaveCSS('display', 'none')` failed. Expected `"none"`, received `"block"`.
  2. `[chrome] › e2e\hero-entry-autoplay.spec.js › compact content keeps the requested identity and actions, then holds hover for three seconds`
     - **Error**: `expect(content).toHaveClass(/is-expanded/)` failed. Received `"hero-content-zone is-compact is-compact"`.
  3. `[chrome/webkit] › e2e\hero-native-only.spec.js › Native desktop movie - plays muted native video, no YouTube, no TMDB`
     - **Error**: `expect(hero.locator('video')).toHaveCount(1)` failed. Expected `1`, received `0`.
  4. `[chrome/webkit] › e2e\hero-native-only.spec.js › Server order is preserved client-side`
     - **Error**: `expect(title).toHaveText('Poster Only Hero')` failed. Expected `"Poster Only Hero"`, received `"Lilo & Stitch"`.
  5. `[webkit] › e2e\hero-native-only.spec.js › Poster-only movie - no video element, no YouTube, no TMDB`
     - **Error**: `expect(tracker.getTmdbRequests()).toBe(0)` failed. Expected `0`, received `1`.

---

## 2. Logic Chain

1. **Why `hero-native-only.spec.js` fails with "Lilo & Stitch" and 0 video elements**:
   - In `client/e2e/hero-native-only.spec.js` line 38, the mocked `/api/show/hero` route fulfills with `JSON.stringify(movies)`, which is a raw JSON array:
     ```javascript
     await page.route('**/api/show/hero', (route) => {
       return route.fulfill({
         status: 200,
         contentType: 'application/json',
         body: JSON.stringify(movies),
       });
     });
     ```
   - In `client/src/services/tmdb.js` line 69, `fetchHomeHero` parses this response:
     ```javascript
     const response = await fetchWithTimeout(`${API_BASE}/api/show/hero`, { signal });
     const payload = await response.json().catch(() => null);
     if (!response.ok || !payload?.success) {
         throw new Error(payload?.message || `Hero request failed (${response.status})`);
     }
     ```
   - Since the mock returns a raw array, `payload.success` is `undefined`, causing `!payload?.success` to evaluate to `true`. This throws an error and falls back to `dummyShowsData` (which starts with "Lilo & Stitch", a movie with no native-ready video, resulting in 0 video elements).

2. **Why Webkit failed on Poster-only movie (TMDB videos request count)**:
   - Due to the same `/api/show/hero` payload parsing failure, the page falls back to `dummyShowsData`.
   - The fallback movie list contains movies that do not have native-ready video sources, which triggers a trailer fallback.
   - The component calls `fetchMovieTrailers` (which hits `**/api/show/tmdb/movie/*/videos`). This increments `requestsToTmdbVideos`, violating the `expect(tracker.getTmdbRequests()).toBe(0)` assertion.

3. **Why TEST I - COMPACT TITLE fails**:
   - In `client/e2e/hero-direct-play.spec.js` line 319, the test asserts that `.hero-content-details` has CSS property `display: none` when compact:
     ```javascript
     await expect(details).toHaveCSS('display', 'none');
     ```
   - However, in `client/src/components/hero/hero.css`, the compact styling hides only `.hero-overview`, `.hero-poster-rail`, etc., but keeps `.hero-content-details` visible (it has `display: block`). Only `.hero-action--details` is set to `display: none`. This is a mismatch between the test assertions and the stylesheet.

---

## 3. Caveats

- Factual behavior of browser media decoding has been mocked via Playwright's network intercepts.
- The unit test `client/tests/heroTrailerRequestContract.test.js` enforces that `HeroSection` *must* import `fetchMovieTrailers` and resolve trailers via `resolveHeroVideoSource`. Once YouTube is removed, this test will fail and must be rewritten/deleted.
- Only the workspace files under `client/` and `server/` were investigated; Clerk auth sync and TMDB proxy routes were assumed to be functioning as coded.

---

## 4. Conclusion

The Home Hero regression has introduced a multi-layered fallback architecture where YouTube trailers are fetched, pre-rendered, and auto-unmuted. 

### Root-Cause Analysis Findings

1. **Where YouTube enters the Hero path**:
   - `HeroSection.jsx` imports `fetchMovieTrailers` (from `client/src/services/tmdb.js`) and calls it inside `loadHeroVideoSource` (line 346) when no native source is configured.
   - The results are resolved through `resolveHeroVideoSource(trailer)` (in `heroVideoSource.js`), which resolves YouTube embed URLs/IDs to `{ kind: 'youtube', videoId }`.
   - `HeroVideoRenderer.jsx` detects `source.kind === 'youtube'` and renders `HeroYouTubeVideo.jsx`, loading `useYouTubePlayer` to create the YouTube iframe.

2. **Why the Pause bezel can still appear**:
   - The pause bezel is a native behavior of the YouTube IFrame player. To hide it, the player is quarantine-masked under the poster for 2,000ms (`HERO_VISUAL_READY_CONFIRM_MS` in `heroMachine.js` lines 58-62) after playback starts.
   - If the player experiences lag, or if the poster is lowered/raised incorrectly during a state transition, the transient pause bezel is exposed.

3. **Where fixed delays are applied**:
   - `loaderMs: 3000`, `fadeMs: 450` in `Home.jsx` (boot loader duration).
   - `posterWarmupMs: 2200` in `Home.jsx` (hold delay before revealing the video).
   - `HERO_POSTER_SWAP_DELAY_MS: 400`, `HERO_POSTER_TRANSITION_MS: 1200` in `HeroSection.jsx` (fade animation timings).
   - `HERO_AUTO_CAROUSEL_MS: 9000` in `HeroSection.jsx` (slide interval).
   - `HERO_BUFFERING_HYSTERESIS_MS: 450`, `HERO_PLAYING_HYSTERESIS_MS: 250` in `heroMachine.js` (playing and buffering checks).
   - `HERO_VISUAL_READY_CONFIRM_MS: 2000` in `heroMachine.js` (YouTube quarantine delay).
   - `HERO_PLAYBACK_TIMEOUT_MS: 8000` in `heroMachine.js` (max wait before failure).
   - `VIDEO_ENTER_DURATION_MS: 850` in `HeroSection.jsx` (animation phase timing).
   - `HERO_COMPACT_PLAYBACK_MS: 3000`, `POINTER_ENTER_DELAY_MS: 100`, `HERO_POINTER_HOLD_MS: 3000` in `useHeroContentDisclosure.js` (compact transition gates).
   - `MOBILE_AUTO_COLLAPSE_MS: 6000` in `useHeroContentDisclosure.js` (mobile auto-collapse).

4. **Where auto-unmute happens**:
   - In `HeroSection.jsx` line 876: `revealVerifiedVideo` calls `setMuted(!(soundPreferred && !autoplaySoundBlocked))`. This automatically unmutes the video upon visual reveal if the user had a general sound preference.

5. **Where inactive trailer metadata is prefetched**:
   - In `HeroSection.jsx` line 866: once a trailer reaches stable playing state, `handlePlaybackStable` calls `preloadRemainingTrailerSources(movieKey)`.
   - `preloadRemainingTrailerSources` (lines 371-390) iterates over all other inactive movies in the carousel and fetches their trailer video metadata.

6. **Where server movie order is changed**:
   - In `HeroSection.jsx` lines 547-548, after receiving the `/api/show/hero` response, the client calls `selectBestHeroMovies(rawMovies)`.
   - `selectBestHeroMovies` sorts the movies descending by a calculated rating/popularity score, overriding the server's ordered array.

7. **Whether API failure silently falls back to dummy data**:
   - Yes, in `tmdb.js` line 87, the `fetchHomeHero` catch block catches request errors and returns `{ settings: { mode: 'fallback' }, movies: onlyMoviesWithImages(fallbackMovies(5)) }` using `dummyShowsData`.

---

## 5. Verification Method

### How to reproduce/verify the baseline E2E failures:
1. Run the client unit tests to confirm contract invariants:
   ```bash
   cd client
   npm test
   ```
2. Run Playwright E2E tests:
   ```bash
   npx playwright test
   ```
3. Inspect `client/e2e/hero-native-only.spec.js` line 38 to see the mocked `/api/show/hero` route returning an array instead of a wrapper object containing `{ success: true, movies: ... }`.
4. Inspect `client/src/components/hero/hero.css` line 392 and `client/e2e/hero-direct-play.spec.js` line 319 to verify the `.hero-content-details` display styling mismatch.
