# Original User Request

## 2026-08-02T16:17:50Z

# Teamwork Project Prompt — Draft

> Status: Launched.
> Goal: Craft prompt → get user approval → delegate to teamwork_preview

Fix three intertwined bugs in the NitroCine Hero/Trailer system: Admin manual selection not syncing to the Home Hero, Admin and Home UI using different backend API URLs, and the "Retry trailer" button navigating away instead of retrying the native video.

Working directory: e:/NitroCine
Integrity mode: demo

## Requirements

### R1. Unify API Client Configuration
Ensure both Admin (axios) and Home (fetch/etc.) use a single, unified backend URL derived from `VITE_BASE_URL`.

### R2. Make Manual Hero Selection Authoritative
When Admin mode is set to 'manual', the Home Hero must display the exact 5 manually selected movies (retaining native video properties) and bypass the auto-rotation batch. The UI must distinguish between "Currently live on Home" and "Manual selection".

### R3. Fix Retry Button and Trailer Flow
Update `HeroContent` and `HeroSection` so that clicking "Retry trailer" actually retries the native video instead of scrolling to `TrailerSection`.

### R4. Introduce Feature Flag for Trailer Mode
Add support for `VITE_HERO_TRAILER_MODE` (native, section, hybrid) to control fallback behavior between the Hero player and the lower `TrailerSection`.

## Acceptance Criteria

### Verification and Testing
- [ ] Add new unit/integration tests covering: Admin and Hero using the same API base URL, Manual mode becoming authoritative, and Native trailer retry resetting the error state and replaying instead of scrolling.
- [ ] Ensure all existing unit, integration, and E2E tests for the modified components are updated and pass successfully.
- [ ] Implement and pass an automated E2E flow that:
  1. Selects five movies in Manual mode and saves.
  2. Verifies `GET /api/show/hero` returns exactly those five movie IDs in the saved order.
  3. Reloads Home and verifies the same five movies are displayed.
  4. Forces a native video playback error.
  5. Clicks “Retry trailer”.
  6. Verifies a new native playback attempt occurs without scrolling to the fallback section.
- [ ] Verify via network logs that Admin PUT/POST and public Hero GET requests use the exact same backend origin and database environment.
- [ ] Provide a final report detailing commands run, test results, request URLs, response payloads, and any remaining blockers. All tests and the production build must pass.

## Follow-up — 2026-08-02T16:21:03Z

The user has provided a new set of strict implementation constraints and required semantics for the task. You must incorporate these into your plan and ensure all subagents adhere to them strictly.

Implementation Constraints and Required Semantics

1. Unified API URL
Create one shared frontend API configuration module and require every axios/fetch request to consume it.
Normalize VITE_BASE_URL by:
- trimming whitespace;
- removing the trailing slash;
- preventing duplicated paths such as /api/api;
- allowing an empty value in local development when Vite proxy is intentionally used.
Do not leave direct hard-coded backend URLs anywhere in Admin, Hero, Home, services, hooks, or test files.
Add a repository-wide check for:
- localhost backend URLs;
- production backend URLs;
- direct fetch('/api/...') calls bypassing the shared client;
- independently created axios instances.
The Admin save request and Home Hero request must resolve to the same origin under the same runtime configuration.

2. Manual Mode Semantics
Configured mode and effective mode must be explicit.
When configuredMode === "manual":
- the public Hero endpoint must bypass active auto-rotation batches;
- it must return exactly the five saved manual movie IDs;
- order must match the Admin selection order;
- native trailer metadata must be retained;
- no conversion to poster-only data is allowed;
- missing or invalid movie IDs must produce a clear validation error during Save, rather than silently replacing them with auto-rotation movies.
The public response should expose non-sensitive diagnostic metadata similar to:
{
  "meta": {
    "configuredMode": "manual",
    "effectiveMode": "manual",
    "source": "manual-selection",
    "version": "...",
    "buildSha": "...",
    "environment": "development|preview|production"
  }
}
Do not expose database credentials, database names containing secrets, connection strings, tokens, or internal infrastructure addresses.
Saving a manual selection must:
- atomically persist mode and ordered movie IDs;
- invalidate Redis/server cache;
- invalidate or change ETag/version;
- make a subsequent GET /api/show/hero return the new selection immediately;
- trigger Admin and Home refetch without requiring a full browser cache clear.
The Admin UI must show two separate sections:
- Currently live on Home
- Manual selection
Do not label active auto-rotation movies as manually selected movies.

3. Native Video Preservation
For each manual Hero movie, preserve all existing native-video fields required by the current player, including their actual repository equivalents of:
- heroVideoUrl
- heroVideoStatus
- heroVideoMimeType
- nativeVideoValid
- poster/backdrop metadata
Do not manufacture valid video status when no verified native video exists.

4. Trailer Feature Flag Contract
Support exactly:
VITE_HERO_TRAILER_MODE=native
VITE_HERO_TRAILER_MODE=section
VITE_HERO_TRAILER_MODE=hybrid

Required behavior:
native:
- use the native Hero video player;
- never navigate or scroll to TrailerSection;
- when playback fails and a valid source exists, show Retry trailer;
- Retry must perform another native playback attempt.

section:
- do not attempt native playback;
- Trailer action opens or scrolls to TrailerSection;
- do not display Retry trailer for native playback.

hybrid:
- try native playback first when a valid native source exists;
- Retry retries native playback;
- use TrailerSection only when no valid native source exists;
- do not automatically navigate away merely because one playback attempt failed.

Document the default mode explicitly. Keep production behavior unchanged unless the environment value is intentionally updated.

5. Retry Implementation
Retry must not merely rename the button.
A retry must:
- clear the previous playback error state;
- increment a retry attempt or retry nonce;
- reload or remount the video source when required;
- call video.load() where appropriate;
- make a new video.play() attempt;
- preserve the current movie;
- avoid scrolling;
- avoid changing the Hero index;
- avoid infinite automatic retry loops;
- handle rejected play() promises.
A permanently invalid or missing source is not retryable and must follow the configured trailer mode fallback behavior.

6. Objective Backend Environment Verification
Verify the same backend deployment using non-sensitive response metadata or headers such as: environment, build SHA, deployment identifier, API version. Both the Admin mutation response and public Hero response must report matching backend identity values. Do not expose or log database URIs or secrets.

7. E2E Retry Scenario
The automated retry test must simulate:
- the first native play attempt rejecting;
- the same source becoming playable on the second attempt;
- clicking Retry trailer;
- play being attempted a second time;
- error state being cleared;
- no scrollIntoView call;
- no TrailerSection navigation;
- no movie-index change.
Do not use a permanently broken URL and then falsely expect the retry to succeed.

8. Test Isolation and Integrity
Use mocks, fixtures, or an isolated test database for automated tests. Do not modify real production movie selections or production data. Do not delete or weaken failing tests.

9. Required Final Evidence
The final report must include:
- files changed;
- root cause for each of the three original bugs;
- exact environment variables used;
- resolved Admin mutation URL;
- resolved public Hero URL;
- matching backend environment/build identifiers;
- manual Save response;
- subsequent public Hero response containing the same five ordered IDs;
- cache invalidation mechanism;
- unit/integration/E2E commands;
- pass/fail counts;
- production build result;
- repository search proving old duplicated API configuration is removed;
- remaining blockers or unverified items.
Also verify the application behavior against a running local or preview stack.

## Follow-up — 2026-08-03T04:23:32Z

Execute the NitroCine Native Hero Production Repair. Ensure 100% native MP4/WebM playback with zero YouTube/TMDB leakage on the Home route.

Working directory: e:/NitroCine
Integrity mode: demo

## Requirements

### R1. Native Media & Zero YouTube on Home
- The Home Hero and any trailer surface opened by the Home Hero may use only a server-verified native MP4/WebM file or the movie poster.
- The Home route must produce zero YouTube-related network requests or TMDB video lookups.
- Modify `client/src/pages/Home.jsx` and related sections to remove the legacy `TrailerSection` execution path or replace it with a `NativeTrailerSection` to ensure a zero-YouTube guarantee.

### R2. Unified API Configuration
- Create a shared API module at `client/src/lib/apiClient.js`.
- It must read `VITE_BASE_URL` once, normalize it, and export the normalized base, `buildApiUrl()`, a shared Axios instance, and a shared fetch wrapper.
- Refactor `tmdb.js` and `AppContext.jsx` to use this shared module.

### R3. Authoritative Manual Mode & Bypassed Shuffle
- Manual mode must bypass the active auto-rotation batch and return exactly the 5 saved manual movie IDs in order.
- Manual mode must bypass the frontend per-user daily shuffle (`heroDailyShuffle.js`) and preserve the server's exact saved order for all viewers.
- `updateHomeHero` must validate exactly 5 unique native-ready movies (`heroVideoStatus === 'ready'`). Reject with HTTP 422 if invalid, preserving the previous configuration atomically.
- `getAdminHomeHero` must return separate fields for `liveMovies`, `manualSelection`, and `rotation`.

### R4. Controllers & Backend Identity
- Modify `server/controllers/showController.js` and `server/controllers/adminController.js` to expose safe `buildSha`, `deploymentId`, and `environment` in the `meta` response.
- The Admin mutation must return the resulting effective live Hero payload.

### R5. Retry State Machine & Video Lifecycle
- Reuse the existing `videoGeneration` mechanism for retry resets instead of adding a separate `retryNonce`.
- Differentiate retryable failures ("Retry trailer") from permanent unavailability ("Trailer unavailable").
- "Retry trailer" must clear the error, increment `videoGeneration`, and call `video.load()` / `video.play()` without scrolling, navigating away, or changing the current movie index.
- Ensure only one native `<video>` element is active at a time, and the last trailer wraps to the first exactly once.

## Acceptance Criteria

### Verification & E2E
- [ ] Fail Playwright tests on any request to `youtube.com`, `youtu.be`, `youtube-nocookie.com`, `googlevideo.com`, or TMDB video endpoints from Home.
- [ ] Verify native `loadedmetadata`, dimensions, `play()`, and `currentTime` advancement.
- [ ] Verify exactly one video element is active.
- [ ] Verify Admin save, public GET, and rendered DOM preserve the exact A,B,C,D,E manual order.
- [ ] Verify manual mode skips the daily shuffle.
- [ ] Verify ETag/version changes immediately after Save.
- [ ] Verify first play failure followed by successful Retry without scrolling, navigation, movie change, or fallback request.
- [ ] Verify last trailer wraps to the first exactly once.
- [ ] Ensure all client unit/integration tests and server tests pass cleanly.

## Follow-up — 2026-08-03T11:48:37Z

<USER_REQUEST>
GOAL — COMPLETE NITROCINE NATIVE HERO REPAIR

Repository:
https://github.com/HoangDuc1003/Cinema-booking

Working directory:
e:/NitroCine

Execution mode:
IMPLEMENT_AND_VERIFY

Integrity mode:
demo

==================================================
1. ROLE
==================================================

Act as the Lead Principal Full-Stack Engineer responsible for completing the
NitroCine Native Hero repair.

You have authority to:

- inspect the entire repository;
- read Git history and repository instructions;
- modify application source code;
- add or update tests;
- run frontend and backend services;
- run lint, unit, integration, build, and Playwright commands;
- inspect local network requests and browser media events.

You do not have authority to:

- deploy production;
- modify production environment variables;
- modify real production data;
- expose secrets;
- copy unrelated application logic from another project;
- download or convert YouTube videos;
- delete or weaken tests to make them pass.

Do not return only a plan.

Inspect the current HEAD, implement the repair, run verification, and return
reproducible evidence.

Do not stop after editing one layer. The task covers backend, frontend, Admin,
Home, caching, native playback, tests, and runtime verification.

==================================================
2. CURRENT VERIFIED BASELINE
==================================================

Treat the following as current repository observations, but verify them against
the checked-out HEAD before editing:

1. server/services/heroService.js:
   getPublicHomeHero() currently delegates directly to getPublicHeroRotation().
   Manual mode is still described as an emergency poster-only fallback.

2. server/services/heroService.js:
   getAdminHomeHero() currently prefers rotation.activeMovies over saved manual
   movie IDs.

3. client/src/pages/admin/HeroSettings.jsx:
   editable selectedIds are currently initialized from rotation.activeMovies
   when an active batch exists.

4. client/src/pages/Home.jsx:
   Home still imports and mounts the legacy TrailerSection and passes
   onTrailerRequest to HeroSection.

5. client/src/components/HeroSection.jsx:
   handleTrailerAction() currently scrolls to TrailerSection whenever
   trailerFailed is true.

6. client/src/components/NativeTrailerSection.jsx:
   it currently falls back to unverified fields such as background_video_url,
   videoUrl, and trailerUrl.

7. client/src/components/hero/heroTrailerMode.js:
   missing or invalid configuration currently defaults to hybrid.

8. client/src/lib/apiClient.js already exists.
   Reuse and correct it rather than creating another competing API client.

Do not blindly rewrite parts that are already correct.

==================================================
3. NON-NEGOTIABLE FINAL PRODUCT BEHAVIOR
==================================================

After completion:

A. Manual Hero

When Admin saves Manual mode with movie IDs:

[A, B, C, D, E]

the public Hero endpoint and Home UI must use exactly:

[A, B, C, D, E]

The order must not be changed by:

- auto rotation;
- per-viewer daily shuffle;
- Redis fallback;
- browser cache;
- active HeroRotationBatch;
- refresh;
- reload;
- another viewer ID.

Manual mode is authoritative.

Auto mode must continue using the existing 15-movie rotation architecture.

B. Native video

The Home Hero and any Home trailer section may play only a verified native:

- video/mp4; or
- video/webm.

No Home Hero flow may use:

- YouTube;
- youtu.be;
- youtube.com;
- youtube-nocookie.com;
- googlevideo.com;
- YouTube IDs;
- iframe players;
- React YouTube players;
- TMDB video lookup;
- a YouTube fallback;
- a URL converted from YouTube;
- yt-dlp;
- scraped or downloaded YouTube files.

When native media is unavailable, keep the poster visible and show an honest
“Trailer unavailable” state.

C. Retry

For a valid native source:

First native play attempt fails
→ UI displays “Retry trailer”
→ user clicks Retry
→ the player makes a second native load/play attempt
→ the same movie remains selected
→ the page does not scroll
→ no lower legacy trailer section opens
→ no YouTube/TMDB trailer request occurs.

D. Trailer modes

Support exactly:

VITE_HERO_TRAILER_MODE=native
VITE_HERO_TRAILER_MODE=section
VITE_HERO_TRAILER_MODE=hybrid

All three modes remain native-only on Home.

Default:

VITE_HERO_TRAILER_MODE=native

E. Native validation

Manual mode may become live only when all five movies contain distinct,
movie-specific, verified native trailer assets.

Do not manufacture valid status or weaken server validation.

==================================================
4. BASELINE INSPECTION
==================================================

Before editing:

1. Read:
   - root AGENTS.md;
   - nested AGENTS.md files;
   - CLAUDE.md;
   - PROJECT.md;
   - docs/hero-native-rotation.md;
   - package scripts;
   - environment examples.

2. Record:
   - branch;
   - commit SHA;
   - git status;
   - pre-existing uncommitted changes;
   - Node version;
   - npm version.

3. Never discard or overwrite unrelated user changes.

4. Search the repository:

rg -n -i \
"youtube|youtu\\.be|youtube-nocookie|googlevideo|iframe|reactplayer|fetchMovieTrailers|fetchLatestTrailers|extractYouTubeVideoId|TrailerSection" \
client/src server

rg -n \
"getPublicHomeHero|getPublicHeroRotation|posterOnly|selectedMovies|activeMovies|movieIds|effectiveMode|configuredMode" \
server client/src

rg -n \
"Retry trailer|Trailer unavailable|trailerFailed|scrollToTrailerSection|handleTrailerAction|handlePlayTrailer|videoGeneration" \
client/src/components

rg -n \
"VITE_BASE_URL|axios\\.create|fetch\\(|API_BASE_URL|buildApiUrl" \
client/src

5. Run the existing focused tests before editing.

Record failures as baseline failures. Do not hide them.

==================================================
5. BACKEND — MAKE MANUAL MODE AUTHORITATIVE
==================================================

Primary files:

- server/services/heroService.js
- server/services/heroRotationService.js
- server/controllers/showController.js
- server/controllers/adminController.js
- server/models/SiteConfig.js, only if required
- server/services/redisKeys.js, only if required
- relevant backend tests

5.1 Public selection

Change getPublicHomeHero() so that it loads the current Home Hero configuration
before choosing its source.

Required decision:

if configured mode is manual:
    return a manual public Hero payload
else:
    return getPublicHeroRotation()

Do not call auto rotation first and then treat Manual as a fallback.

5.2 Manual payload

Create one canonical manual payload builder.

Do not duplicate native validation or movie normalization logic.

The builder must:

- accept exactly five ordered IDs;
- load the five Movie documents;
- restore the exact saved order after MongoDB $in lookup;
- validate every movie with validateNativeHeroMovie();
- require five distinct movie IDs;
- require five distinct native video URLs;
- use normalizeHeroMovie(movie, { posterOnly: false });
- preserve all native video metadata;
- never substitute an auto movie;
- never convert valid manual movies to poster-only;
- never shuffle the order.

Expected public shape:

{
  "success": true,
  "movies": [A, B, C, D, E],
  "settings": {
    "mode": "manual",
    "configuredMode": "manual",
    "effectiveMode": "manual",
    "heroSoundDefaultEnabled": false,
    "heroDefaultVolume": 0.35,
    "updatedAt": "..."
  },
  "meta": {
    "source": "manual-selection",
    "version": "...",
    "cacheGeneration": 1,
    "buildSha": "...",
    "deploymentId": "...",
    "environment": "development"
  },
  "dateKey": "...",
  "nextRefreshAt": "..."
}

Adapt field placement to existing controller conventions, but keep the semantic
contract explicit and consistent.

Do not expose:

- database URI;
- database name containing secrets;
- Redis URI;
- Cloudinary secret;
- tokens;
- credentials.

5.3 Manual activation validation

Before persisting a new Manual configuration:

- sanitize IDs;
- require exactly five IDs;
- require five unique IDs;
- load all five movies;
- report missing movie IDs;
- call validateNativeHeroMovie() for every movie;
- require distinct heroVideoUrl values;
- reject generic, mock, missing, unverified, mismatched, unsupported, or
  unauthorized video assets.

When validation fails, return HTTP 422:

{
  "success": false,
  "code": "MANUAL_HERO_INVALID",
  "message": "All five Manual Hero movies require verified native trailers.",
  "invalidMovies": [
    {
      "movieId": "...",
      "title": "...",
      "reasons": ["status-not-ready", "not-verified"]
    }
  ]
}

A failed activation must:

- preserve the previously live configuration;
- not partially update mode;
- not partially update movie IDs;
- not alter the active auto batch;
- not invalidate the valid previous live payload;
- not show a success message;
- not use poster-only or YouTube fallback.

Validate everything before the atomic SiteConfig update.

5.4 Atomic persistence

Once validation succeeds:

- atomically set homeHero.mode=manual;
- atomically save the five ordered IDs;
- update a manual version or use updatedAt consistently;
- bump Hero cache generation;
- invalidate public Hero Redis keys;
- invalidate Home Hero cache keys;
- ensure the next GET /api/show/hero cannot return the previous auto list;
- change the ETag;
- return the resulting live Hero payload.

A browser cache clear or server restart must not be necessary.

5.5 Auto mode

When switching to auto:

- preserve the existing active HeroRotationBatch;
- preserve the existing 15-movie pool;
- public Home resumes using getPublicHeroRotation();
- manual saved IDs may remain available as a future editable selection;
- do not destroy valid native assets.

5.6 ETag

Update createHeroEtag() or the relevant response logic so ETag identity includes:

- configured mode;
- effective mode;
- payload source;
- manual ordered movie IDs;
- video versions;
- cache generation;
- settings updatedAt.

Changing Manual order from:

[A, B, C, D, E]

to:

[B, A, C, D, E]

must change the ETag.

==================================================
6. BACKEND — ADMIN CONTRACT
==================================================

getAdminHomeHero() must return separate concepts:

{
  "settings": {
    "configuredMode": "manual",
    "effectiveMode": "manual",
    "movieIds": [A, B, C, D, E]
  },
  "liveMovies": [...],
  "manualSelection": [...],
  "availableMovies": [...],
  "rotation": {...},
  "meta": {...}
}

Rules:

liveMovies:
- the exact movies effectively public on Home now;
- Manual list when effective mode is manual;
- active rotation list when effective mode is auto.

manualSelection:
- the persisted manual IDs in their exact saved order;
- never derived from rotation.activeMovies.

rotation:
- auto pool and active batch information;
- must remain distinct from Manual editing.

Admin mutation response must include:

{
  "success": true,
  "message": "Hero updated successfully.",
  "settings": {...},
  "liveHero": {
    "movies": [...],
    "settings": {...},
    "meta": {...}
  },
  "meta": {...}
}

The safe backend identity in Admin and public responses must match.

Use a small shared server helper for runtime identity if appropriate.

==================================================
7. FRONTEND — ADMIN UI
==================================================

Primary file:

client/src/pages/admin/HeroSettings.jsx

Separate the page into clearly labeled sections:

1. Currently live on Home
2. Manual selection
3. Auto rotation pool

Data mapping:

Currently live on Home
→ hero.liveMovies

Manual selection
→ hero.manualSelection or settings.movieIds

Auto rotation pool
→ hero.rotation.pool and hero.rotation.activeMovies

Do not initialize editable selectedIds from rotation.activeMovies.

Do not infer that local unsaved mode is already live.

Display configured and effective status separately where useful:

Configured mode: Manual
Effective mode: Manual

or:

Editing mode: Manual
Currently live: Auto

Save behavior:

- exactly five Manual movies required;
- disable Publish when five movies are not selected;
- indicate which selected movies are not native-ready;
- surface backend invalidMovies reasons;
- do not display success for HTTP 422;
- after successful Save, use liveHero from the response or refetch Admin data;
- update “Currently live on Home” immediately.

Replace the old text:

“Manual mode only defines the ordered emergency poster fallback.”

with wording that reflects the new authoritative behavior.

==================================================
8. FRONTEND — EXACT MANUAL ORDER
==================================================

Primary file:

client/src/components/HeroSection.jsx

When any of the following is true:

settings.effectiveMode === "manual"
settings.configuredMode === "manual" and effective mode is manual
meta.source === "manual-selection"

then:

- use server movies in their exact payload order;
- do not call getOrComputeDailyOrder();
- do not call applyDailyOrder();
- do not apply anonymous viewer seed;
- ignore old auto daily-order history;
- keep A,B,C,D,E for every viewer and reload.

Auto mode may retain deterministic per-viewer shuffle if that is still part of
the product.

Manual mode must never reuse a cached auto movie order.

==================================================
9. FRONTEND — REMOVE HOME YOUTUBE FLOW
==================================================

Primary files:

- client/src/pages/Home.jsx
- client/src/components/TrailerSection.jsx
- client/src/components/NativeTrailerSection.jsx
- client/src/services/tmdb.js, only as needed
- related tests

Home currently mounts the legacy TrailerSection. Remove it from the Home Hero
execution path.

Do not merely hide it with CSS.

Do not leave it mounted in the background.

Do not let IntersectionObserver load it later.

Do not let Hero call onTrailerRequest into the legacy section.

Required mode behavior:

native:
- Home renders HeroSection;
- Home does not mount a lower trailer section;
- Hero plays native video directly.

section:
- Home may mount NativeTrailerSection only;
- it must play the verified native asset;
- it must not import or call legacy YouTube/TMDB trailer logic.

hybrid:
- Hero attempts native playback first;
- a native-only lower section may be present;
- one failed play attempt does not automatically scroll to it;
- it must use the same verified native movie source.

Unrelated YouTube functionality on other pages may remain, provided it is not
imported, executed, prefetched, or requested from Home.

==================================================
10. NATIVE TRAILER SECTION SECURITY
==================================================

Primary file:

client/src/components/NativeTrailerSection.jsx

resolveNativeTrailerSource() must accept a source only from:

resolveConfiguredHeroVideoSource(movie, ...)

Remove production fallback to:

- background_video_url;
- videoUrl;
- trailerUrl;
- arbitrary MP4-looking strings;
- client-invented MIME values.

Test fixtures under an explicit test/mock flag may remain isolated.

Production must require the canonical server-verified Hero source contract.

The component may not fetch:

- TMDB videos;
- YouTube search;
- YouTube IDs;
- generic trailer endpoints.

It may fetch the public Hero payload if needed, but must use only verified Hero
movies.

==================================================
11. TRAILER FEATURE FLAG
==================================================

Primary files:

- client/src/components/hero/heroTrailerMode.js
- client/.env.example
- Home.jsx
- HeroSection.jsx

Implement:

export const HERO_TRAILER_MODES = {
  NATIVE: 'native',
  SECTION: 'section',
  HYBRID: 'hybrid',
};

Missing value:
→ native

Unknown value:
→ native

In development, log one warning for an unknown value.

Add to client/.env.example:

VITE_HERO_TRAILER_MODE=native

Do not read VITE_HERO_TRAILER_MODE independently in multiple components.
Use getHeroTrailerMode() as the canonical parser.

==================================================
12. RETRY NATIVE PLAYBACK
==================================================

Primary files:

- client/src/components/HeroSection.jsx
- client/src/components/hero/HeroContent.jsx
- client/src/components/hero/HeroNativeVideo.jsx, only when required
- related tests

Reuse the existing videoGeneration mechanism.

Do not introduce retryNonce unless a failing test proves videoGeneration cannot
recreate/reload the player.

Classify failures:

Retryable:
- transient media error;
- startup timeout;
- temporary network failure;
- a play() rejection that a later user gesture can retry;
- temporary buffering/decode start failure while the configured source remains
  valid.

Permanent unavailable:
- no source;
- source resolver rejection;
- status not ready;
- invalid binding;
- unsupported MIME;
- unapproved host;
- YouTube URL;
- missing verified metadata.

Required labels:

Initial valid action:
Trailer

Loading:
Loading…

Retryable failure:
Retry trailer

Permanent missing/invalid:
Trailer unavailable

Retry implementation:

1. Remain on the current movie.
2. Clear the current retryable failure.
3. Clear stale handoff and transition timers.
4. Remove the current movie from failedMovieKeysRef.
5. Advance videoGeneration.
6. Set the canonical native source again.
7. Remount or reload the active video.
8. Call video.load() if required by the actual player design.
9. Call video.play().
10. Handle its returned Promise.
11. Preserve muted autoplay recovery.
12. Do not call scrollToTrailerSection().
13. Do not call legacy onTrailerRequest.
14. Do not change currentIndex.
15. Do not create automatic infinite retry loops.

Correct handleTrailerAction semantics:

native:
- valid source, including retryable failure → handlePlayTrailer()
- invalid/missing source → unavailable state only

section:
- valid source → request NativeTrailerSection
- invalid/missing source → unavailable state

hybrid:
- valid source → play or retry in Hero
- do not scroll merely because trailerFailed is true
- lower native section only through an explicit supported action
- never use a legacy fallback

Delete the current behavior equivalent to:

if (!trailerAvailable || trailerFailed) {
  scrollToTrailerSection();
}

==================================================
13. PLAYBACK AND CAROUSEL INVARIANTS
==================================================

Preserve or verify:

- only one active <video> element;
- stale video generations cannot update current state;
- autoplay blocked with sound retries muted once;
- currentTime must advance before playback is considered stable;
- inactive videos are not mounted;
- full videos are not preloaded for all five movies;
- poster remains visible until native playback is visually ready;
- timers are cleaned on unmount and generation change.

When the final movie ends:

- next index is 0;
- transition occurs exactly once;
- native playback may continue on movie 0;
- stale ended events are ignored;
- carousel timer and ended handler cannot double-advance.

Use one normalized index helper.

==================================================
14. API CLIENT VERIFICATION
==================================================

Primary files:

- client/src/lib/apiClient.js
- client/src/services/tmdb.js
- client/src/context/AppContext.jsx
- all Hero-related request callers
- client tests

Do not create a second API client.

Ensure all Hero-related Axios and fetch requests use:

- API_BASE_URL;
- buildApiUrl();
- apiClient;
- fetchApi or the repository’s canonical shared fetch helper.

Verify these resolve to the same origin:

GET /api/admin/hero
PUT /api/admin/hero
GET /api/show/hero
POST upload signature endpoint
POST upload commit endpoint
DELETE native video endpoint
Hero refresh/randomize endpoints

VITE_BASE_URL must:

- be read once;
- trim whitespace;
- strip trailing slash;
- avoid /api/api;
- support empty same-origin development proxy;
- not select a different backend merely because DEV is true.

Do not hard-code localhost or Vercel URLs in components.

==================================================
15. TESTS — BACKEND
==================================================

Add or update real tests for:

A. Manual public Hero

- Auto mode uses active rotation.
- Manual mode bypasses active rotation.
- Manual returns exactly A,B,C,D,E.
- Manual preserves order.
- Manual preserves native fields.
- Manual does not use posterOnly.
- Manual does not substitute auto movies.

B. Manual validation

- fewer than five IDs → 422;
- duplicate IDs → 422;
- missing movie → 422;
- invalid native asset → 422;
- duplicate native URL → 422;
- YouTube URL → 422;
- all five valid → success;
- failed update preserves previous SiteConfig;
- failed update preserves previous live response.

C. Cache and ETag

- successful Manual Save bumps cache generation;
- successful Save invalidates relevant Redis keys;
- first GET after Save returns the new IDs;
- ETag changes after mode change;
- ETag changes after order change;
- If-None-Match returns 304 only for the current payload.

D. Admin contract

- liveMovies matches effective public Hero;
- manualSelection matches persisted manual IDs;
- active rotation does not overwrite manualSelection;
- Admin and public metadata contain matching safe backend identity.

Use the repository’s isolated test database strategy.

Do not mock both the mutation and public endpoint in the same integration test.

==================================================
16. TESTS — FRONTEND
==================================================

Add or update tests for:

A. Admin initialization

- active auto movies are shown in Currently live;
- saved Manual IDs initialize Manual selection;
- Manual selection is never initialized from activeMovies.

B. Manual order

Server response:
A,B,C,D,E

Expected UI:
A,B,C,D,E

Verify for:
- viewer A;
- viewer B;
- reload;
- existing old daily-order localStorage.

C. Trailer labels

- valid idle source → Trailer;
- loading → Loading…;
- retryable failure → Retry trailer;
- missing source → Trailer unavailable;
- invalid source → Trailer unavailable.

D. Retry

- first play() rejects transiently;
- Retry is displayed;
- click Retry;
- second play() is called;
- video generation changes;
- same movie remains selected;
- failure state clears;
- scrollIntoView is not called;
- onTrailerRequest is not called;
- no movie-index change.

E. Trailer modes

native:
- no section request;
- valid native playback works.

section:
- requests NativeTrailerSection only.

hybrid:
- attempts Hero native first;
- failed native remains retryable;
- no automatic legacy fallback.

F. Final movie

- ended on index 4 moves to index 0 exactly once.

==================================================
17. PLAYWRIGHT E2E
==================================================

Create or update an E2E test against a running local stack.

Use a repository-controlled local MP4/WebM fixture strictly for test mode.

Scenario 1 — Real API synchronization

1. Seed five valid native Hero movies in the isolated test database.
2. Open Admin.
3. Select A,B,C,D,E.
4. Save Manual mode.
5. Capture the real Admin mutation response.
6. Call the real public Hero endpoint.
7. Verify A,B,C,D,E in exact order.
8. Reload Home.
9. Verify Hero DOM order A,B,C,D,E.
10. Verify Admin and public responses show matching backend identity.

Do not mock both API endpoints.

Scenario 2 — Actual native playback

Verify:

- one video element exists;
- loadedmetadata fires;
- videoWidth > 0;
- videoHeight > 0;
- playing fires;
- currentTime increases;
- the source belongs to the selected movie;
- there is no second hidden active video.

Scenario 3 — Retry

1. Make the first play attempt reject transiently.
2. Keep the native source valid.
3. Click Retry trailer.
4. Make the second attempt playable.
5. Verify play() was called again.
6. Verify currentTime increases.
7. Verify no scrolling.
8. Verify no section navigation.
9. Verify the selected movie remains unchanged.

Do not use a permanently invalid source for this retry scenario.

Scenario 4 — No YouTube

Fail the test immediately if Home requests any URL containing:

- youtube.com
- youtu.be
- youtube-nocookie.com
- googlevideo.com
- TMDB /videos endpoints

Exercise:

- initial Home load;
- automatic preview;
- Trailer click;
- Retry;
- all five movie selections;
- final movie ending and wrapping to first;
- native, section, and hybrid modes.

Expected forbidden request count:
0

Scenario 5 — Missing native asset

- poster remains visible;
- Trailer unavailable is displayed;
- no fake playing state;
- no Retry for permanent absence;
- no YouTube/TMDB fallback.

==================================================
18. STATIC INTEGRITY CHECK
==================================================

After implementation run searches equivalent to:

rg -n -i \
"youtube|youtu\\.be|youtube-nocookie|googlevideo|fetchMovieTrailers|fetchLatestTrailers|extractYouTubeVideoId" \
client/src/pages/Home.jsx \
client/src/components/HeroSection.jsx \
client/src/components/NativeTrailerSection.jsx \
client/src/components/hero

There may be zero reachable YouTube dependencies in the Home Hero path.

Also run:

rg -n \
"Manual mode only defines the ordered emergency poster fallback|Manual poster fallback" \
client server

The obsolete product semantics must be removed.

Run:

rg -n \
"trailerFailed.*scrollToTrailerSection|!trailerAvailable.*trailerFailed" \
client/src/components/HeroSection.jsx

The old Retry behavior must be gone.

==================================================
19. COMMAND EXECUTION
==================================================

Discover the actual scripts from each package.json before running commands.

At minimum run the repository equivalents of:

Server:
- dependency installation using the lockfile;
- focused Hero service tests;
- controller tests;
- integration tests;
- complete server test suite;
- server startup smoke test.

Client:
- dependency installation using the lockfile;
- focused Hero/Admin tests;
- complete client test suite;
- lint;
- production build;
- Playwright E2E.

Do not state “passed” without command output and exit codes.

Do not skip a failing suite silently.

==================================================
20. SECURITY AND PERFORMANCE
==================================================

Do not:

- expose secrets in public metadata;
- trust an arbitrary client media URL;
- mark nativeVideoValid true on the client;
- store video bytes in MongoDB or localStorage;
- proxy full CDN videos through Node without proven need;
- preload five complete videos;
- create infinite retry loops;
- suppress media errors instead of fixing them;
- change booking, payment, seat, authentication, or unrelated catalog behavior;
- delete the legacy TrailerSection globally unless necessary;
- download YouTube content.

Preserve direct verified CDN delivery and HTTP range support.

==================================================
21. DEFINITION OF DONE
==================================================

Do not mark complete unless all conditions are true:

1. Manual mode bypasses auto rotation.
2. Public GET returns exactly the five ordered Manual IDs.
3. Manual order is preserved in Home for all viewers.
4. Manual activation rejects any non-native-ready movie.
5. Failed activation preserves the previous live configuration.
6. Admin separately displays liveMovies and manualSelection.
7. Admin and Home use one API client configuration.
8. Admin and public requests reach the same backend identity.
9. Home no longer mounts the legacy YouTube TrailerSection.
10. NativeTrailerSection accepts only canonical verified sources.
11. The default trailer mode is native.
12. Retry performs a second native play attempt.
13. Retry does not scroll or change movie.
14. Permanent absence displays Trailer unavailable.
15. The final movie returns to the first exactly once.
16. Exactly one native video is active.
17. E2E proves currentTime advances.
18. Home produces zero YouTube/TMDB-video requests.
19. Unit, integration, lint, build, and E2E pass.
20. A running local stack is verified, not only mocked tests.

If fewer than five authorized valid native assets are available, report:

BLOCKED ON NATIVE ASSETS

Complete all code and test work that does not require those assets, but do not
substitute YouTube and do not falsely claim full completion.

==================================================
22. FINAL REPORT
==================================================

Return one final report containing:

1. Baseline
   - branch;
   - commit SHA;
   - pre-existing changes;
   - initial failures.

2. Root causes
   - Manual/backend issue;
   - Admin data-model issue;
   - API origin issue;
   - Retry issue;
   - legacy TrailerSection issue;
   - native source validation issue;
   - cache contribution.

3. Files changed
   - each file;
   - purpose.

4. API evidence
   - Admin mutation URL;
   - public Hero URL;
   - safe backend identity;
   - saved IDs;
   - public returned IDs;
   - effective mode;
   - response status;
   - ETag before and after.

5. Native playback evidence
   - source hostname;
   - MIME;
   - dimensions;
   - currentTime before and after;
   - retry attempts;
   - active video count.

6. No-YouTube evidence
   - intercepted forbidden host list;
   - forbidden request count;
   - Home dependency search.

7. Tests
   - exact commands;
   - exit codes;
   - pass/fail counts;
   - build result;
   - Playwright result.

8. Cache behavior
   - invalidated Redis keys/patterns;
   - cache generation;
   - ETag behavior.

9. Environment changes required
   - variable names only;
   - redacted values;
   - no production modification performed.

10. Remaining blockers
   - missing native assets;
   - unavailable services;
   - unexecuted tests;
   - anything not verified.

11. Git diff summary
   - no unrelated changes;
   - no secrets;
   - no production deployment.

Do not deploy.

Do not stop with a proposed plan.

Continue until all locally achievable Definition of Done conditions pass or a
specific external blocker is proven with logs and evidence.
</USER_REQUEST>


