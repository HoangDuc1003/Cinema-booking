# Handoff Report — Worker Tests Migration

## 1. Observation

Direct observations from files and terminal outputs:
- **Obsolete files**: `client/e2e/hero-entry-autoplay.spec.js` and `client/e2e/hero-youtube-direct-play.spec.js` contained obsolete, YouTube-iframe-specific test cases that were failing because the production application moved entirely to native HTML5 video.
- **Mock MP4 fixture**: `client/public/mock/hero-trailer.mp4` exists in the repository.
- **Original `setupHeroTest` in `hero-native-only.spec.js`**: Intercepted requests to the MP4 file and fulfilled them with a dummy tiny MP4 buffer.
- **TIMINGS configuration in `Home.jsx`**: Auto-start timings are resolved via `window.__NITROCINE_HOME_TIMINGS__`, defaulting to 3000ms loader delay, 450ms fade delay, and 2200ms poster warmup.
- **CSS rules**: `.hero-poster-rail` opacity becomes `0` and pointer-events becomes `none` when `.is-compact` or `.is-hidden` is active. `.hero-overview` max-height becomes `0px` and opacity becomes `0` when compact.
- **Playwright Test Execution Results**:
  - `npx playwright test` executed:
    ```
    Running 42 tests using 1 worker
    ...
    1 skipped
    41 passed (3.1m)
    ```
- **ESLint Results**:
  - `npm run lint` executed:
    ```
    ✖ 1 problem (0 errors, 1 warning)
    ```

## 2. Logic Chain

- **Obsolete specs**: To retire obsolete YouTube iframe-based tests, `client/e2e/hero-entry-autoplay.spec.js` and `client/e2e/hero-youtube-direct-play.spec.js` were rewritten as empty files, which removed them from Playwright's test run (reducing discovered tests from 44 to 42).
- **MP4 Playback Invariant**: To comply with the mandate to use the real playable fixture and not intercept it or mock `currentTime`, the `page.route('**/mock/hero-trailer*.mp4', ...)` interception in `setupHeroTest` was removed and replaced with a transparent `route.continue()`, allowing the browser to load and play the real video fixture.
- **Scenario Migration**:
  - **Entry loader**: Added a test setting `loaderMs: 1500`, `fadeMs: 200`, and `posterWarmupMs: 0`. We assert the loader element `[data-testid="home-entry-loader"]` is visible, the video is muted and plays behind it, and immediately after the loader exits, the video container is revealed (`data-video-safe="true"` and `is-visible`).
  - **Poster safety**: Added a test asserting that dispatching `pause`, `waiting`, and `stalled` media events on the video element immediately adds `is-visible` to the poster shell and hides the video shell (`data-video-safe="false"`), and that playing the video via `video.play()` resumes stable playback and hides the poster again. It verifies exactly one video remains in DOM.
  - **Movie switching**: Added a test rendering two native movies, clicking the second thumbnail on the thumbnail rail (`.hero-poster-thumb`), verifying the title switches, exactly one video element remains, and the new video's `currentTime` advances.
  - **Compact UI**: Added a test waiting for `hero-content-zone` to automatically become compact after 3 seconds of stable playback. It asserts the overview is hidden (`max-height: 0px` and `aria-hidden="true"`), the rail is hidden/non-interactive (`is-hidden`, `opacity: 0`, and `pointer-events: none`), and hovering over the title Zone transitions it to `.is-expanded`, restoring the overview and rail.
- **Verification**: The entire test suite was executed via Playwright E2E and ESLint, proving all tests compile, run, and pass with zero failures.

## 3. Caveats

- **Existing ESLint warning**: The codebase has an existing warning in `client/src/components/hero/HeroNativeVideo.jsx` (line 328: missing dependencies in `useCallback`). This warning is untouched as it is outside the E2E tests workspace and belongs to production code.

## 4. Conclusion

The YouTube E2E test files have been successfully emptied. The corresponding useful scenarios (Entry loader, Poster safety, Movie switching, and Compact UI) have been successfully migrated to `client/e2e/hero-native-only.spec.js` using native HTML5 media and the real playable MP4 fixture. All Playwright tests and ESLint checks pass successfully.

## 5. Verification Method

- Run Playwright E2E tests:
  ```powershell
  cd client
  npx playwright test
  ```
  Ensure all 41 active test scenarios pass successfully (1 skipped is expected, 0 failures).
- Run ESLint check:
  ```powershell
  cd client
  npm run lint
  ```
  Ensure it completes with zero errors.
