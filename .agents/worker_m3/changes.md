# Changes — Milestone 3 (Worker M3)

## Summary of Changes

### 1. Created Automated Integration Test Suite (`client/tests/heroE2EIntegration.test.js`)
- Created `client/tests/heroE2EIntegration.test.js` to execute as part of `npm test` in `client/`.
- Verifies:
  a. Admin setting 5 movies in Manual mode and saving (`updateHomeHero`).
  b. Objective backend identity verification: Admin PUT/POST response contains matching `meta` diagnostic (`environment`, `version`, `buildSha`, `deploymentId`, `configuredMode`, `effectiveMode`, `source`).
  c. `GET /api/show/hero` returning exact 5 movie IDs in saved order with native trailer metadata (`heroVideoUrl`, `heroVideoStatus`, `heroVideoMimeType`, `heroVideoSources`, `heroVideoPosterUrl`).
  d. Public GET response reporting matching `meta` backend identity metadata.
  e. Reloading Home returning the identical 5 movies in saved order.
  f. Retry trailer state transition: 1st native playback rejection, clicking "Retry trailer", clearing failure state (`playbackStatus` reset to `IDLE`), incrementing `retryNonce`, preserving active movie index (0), and verifying 2nd native play attempt occurs without window scroll or navigation.

### 2. Created Playwright E2E Spec (`client/e2e/hero-manual-retry.spec.js`)
- Created `client/e2e/hero-manual-retry.spec.js` for Playwright test suite (`npm run test:e2e`).
- Mocks Admin hero settings PUT/POST endpoint and public `GET /api/show/hero` returning 5 manual movies in order.
- Patches video `play()` to simulate 1st native playback rejection (`DOMException`).
- Asserts "Retry trailer" button appears, clicking it triggers 2nd native play attempt, video `currentTime` advances, active movie remains index 0, and `window.scrollTo`/`scrollIntoView` is never called.

### 3. Server Meta Diagnostic Enhancement (`server/services/heroService.js` & `server/services/heroRotationService.js`)
- Updated `server/services/heroService.js`: `updateHomeHero` now returns non-sensitive backend identity `meta` diagnostic (`configuredMode`, `effectiveMode`, `source`, `version`, `buildSha`, `deploymentId`, `environment`).
- Updated `server/services/heroRotationService.js`: Included `buildSha` (`process.env.BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'dev-local'`) and `deploymentId` (`process.env.VERCEL_DEPLOYMENT_ID || 'local-dev'`) in `toPublicPayload`, `loadManualPayload`, and `loadPosterOnlyFallback`.

## File Index
- `client/tests/heroE2EIntegration.test.js` (NEW)
- `client/e2e/hero-manual-retry.spec.js` (NEW)
- `server/services/heroService.js` (MODIFIED)
- `server/services/heroRotationService.js` (MODIFIED)
