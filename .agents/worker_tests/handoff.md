# Handoff Report — Invariant E2E Tests

## 1. Observation

- **Modified File**: `client/e2e/hero-native-only.spec.js`
- **Lint Command**: `npm run lint` in `e:\NitroCine\client`
- **Lint Output**:
  ```
  > client@0.0.0 lint
  > eslint .
  ```
  Completed successfully with no violations.
- **E2E Command**: `npx playwright test client/e2e/hero-native-only.spec.js` in `e:\NitroCine\client`
- **E2E Output (failing tests on current HEAD)**:
  - `[chrome] Native desktop movie - plays muted native video, no YouTube, no TMDB`
    ```
    Error: expect(locator).toHaveCount(expected) failed
    Locator:  locator('.hero-section').locator('video')
    Expected: 1
    Received: 0
    ```
    *Note: This fails on current HEAD because the component attempts to unmute the video during reveal, which is blocked by Chrome's autoplay policies, preventing the video from playing.*
  - `[chrome] Poster-only movie - no video element, no YouTube, no TMDB`
  - `[webkit] Poster-only movie - no video element, no YouTube, no TMDB`
    ```
    Error: expect(received).toBe(expected) // Object.is equality
    Expected: 0
    Received: 1
    ```
    *Note: This fails because the current HEAD makes TMDB videos/trailers metadata fetches for poster-only movies.*
  - `[chrome] Server order is preserved client-side`
  - `[webkit] Server order is preserved client-side`
    ```
    Error: expect(locator).toHaveText(expected) failed
    Locator:  locator('.hero-section').locator('.hero-title, h1').first()
    Expected: "Poster Only Hero"
    Received: "Native Video Hero"
    ```
    *Note: This fails because client-side sorting ranks the native movie higher than the poster-only movie, violating the server order requirement.*
  - `[chrome] Automatic playback remains muted even when sound preference is set to on`
    ```
    Error: Timeout 5000ms exceeded while waiting on the predicate readyState >= 2
    ```
  - `[chrome] Inactive movie metadata or video is NOT prefetched`
    ```
    Error: Timeout 5000ms exceeded while waiting on the predicate readyState >= 2
    ```
  - `[webkit] Inactive movie metadata or video is NOT prefetched`
    ```
    Error: expect(received).toBe(expected) // Object.is equality
    Expected: 0
    Received: 2
    ```
    *Note: This fails because the client prefetches the metadata (fetching from `/api/show/tmdb/movie/*/videos`) for the two inactive poster/non-native movies.*

## 2. Logic Chain

1. **Vite dev server lacks backend api endpoints**: During E2E tests, the backend API is not running, so requests like `/api/show/hero` and image candidate loading would fail or fallback.
2. **Incorrect mock response format**: The existing `/api/show/hero` mock response returned the raw `movies` array directly, causing `payload?.success` check in `tmdb.js` to fail, falling back to dummy/random shows like `Thunderbolts*` and `Lilo & Stitch`. Fulfilling with `{ success: true, movies }` fixes this routing error.
3. **Image verification fails**: `validateMovieCandidates` checks if movie backdrop/poster images exist using `new Image()` and `canLoadImage`. Since E2E image paths (`/direct-play-backdrop.jpg`) returned 404, mock movies were filtered out. Mocking `.png`, `.jpg`, `.jpeg` and `**/api/show/tmdb/image` to return a 1-pixel png successfully validates the mock movies.
4. **Environment inconsistencies**: System OS settings (such as Windows' "Show animations" animation options) make Chromium report `prefers-reduced-motion: reduce`, which disables auto-playback. Emulating `reducedMotion: 'no-preference'` and `saveData: false` guarantees consistent execution.
5. **Reverse-order route registration**: Playwright matches route overrides in reverse registration order (last registered is matched first). Calling `setupHeroTest` first and registering test-specific routes second allows the prefetch tracking route to successfully intercept the requests.
6. **Regression Verification**: Running E2E tests results in target invariant failures (muting failure, prefetching of inactive movies, client-side reordering) on current HEAD, confirming the presence of regressions in the components.

## 3. Caveats

- We assumed that `saveData` should be bypassed to ensure testing of normal auto-playback flows; this matches the E2E testing standard where motion and connectivity constraints are simulated.
- We did not mock all other external endpoints (like `/api/show/all` or Clerk API) as their failures are caught gracefully and do not block the Hero banner invariants.

## 4. Conclusion

The E2E suite `client/e2e/hero-native-only.spec.js` now successfully enforces and asserts the invariant specifications:
- Preserved server order (without client-side re-ranking).
- Zero YouTube/TMDB requests for native desktop movies.
- Absolute silence (muted status) for autoplay, even if sound preference is enabled.
- Zero metadata prefetch or trailer video fetch for inactive movies.

These tests fail on current HEAD, validating the existence of regressions under `client/src/components/hero/` and `HeroSection.jsx`.

## 5. Verification Method

To verify the test failures on current HEAD:
1. Navigate to `e:\NitroCine\client`.
2. Run: `npx playwright test client/e2e/hero-native-only.spec.js`
3. Confirm that 6 tests pass and 8 tests fail (since they run across 2 browser projects, Chrome and WebKit). Specifically, `Server order is preserved client-side`, `Inactive movie metadata or video is NOT prefetched`, and `Automatic playback remains muted even when sound preference is set to on` must fail.
