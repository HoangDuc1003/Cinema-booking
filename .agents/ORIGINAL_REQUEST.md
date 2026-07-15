# Original User Request

## Initial Request — 2026-07-15T15:05:28Z

Title:
Restore NitroCine Hero Native-Only Architecture

Repository:
e:\NitroCine

Integrity mode:
development

Primary objective:
Fix the architectural regression in the Home Hero so that its visible
background has exactly two valid outcomes:

1. a ready native MP4/WebM video;
2. a poster.

There is no third outcome.

YouTube must never be used inside the Home Hero. YouTube behavior in the
independent TrailerSection must remain unchanged.

Do not stop after writing a plan. Complete the implementation, run the required
validation, and return evidence. Do not claim success from static inspection
alone.

======================================================================
0. READ PROJECT INSTRUCTIONS FIRST
======================================================================

Before any code action, read:

- AGENTS.md
- client/AGENTS.md, when present
- server/AGENTS.md, when present
- client/src/components/hero/AGENTS.md, when present
- any relevant SKILL.md referenced by those files

The closest scoped AGENTS.md is authoritative for files in that directory.

Record:

- current branch;
- current HEAD SHA;
- working tree status;
- files changed since the previous commit.

Do not discard unrelated uncommitted work.

======================================================================
1. REQUIRED INITIAL INSPECTION
======================================================================

Read the complete current contents of:

client/src/components/HeroSection.jsx
client/src/components/hero/HeroVideoRenderer.jsx
client/src/components/hero/HeroNativeVideo.jsx
client/src/components/hero/HeroYouTubeVideo.jsx
client/src/components/hero/heroVideoSource.js
client/src/components/hero/heroMock.js
client/src/components/hero/heroMachine.js
client/src/components/hero/HeroMedia.jsx
client/src/components/hero/HeroContent.jsx
client/src/components/hero/HeroPosterRail.jsx
client/src/components/hero/useHeroContentDisclosure.js
client/src/components/hero/hero.css
client/src/pages/Home.jsx
client/src/services/tmdb.js
client/e2e/hero-direct-play.spec.js
client/e2e/hero-responsive.spec.js
client/e2e/hero-entry-autoplay.spec.js
client/e2e/hero-youtube-direct-play.spec.js
client/playwright.config.*
client/package.json

Also search the repository for:

fetchMovieTrailers
preloadRemainingTrailerSources
HeroYouTubeVideo
hero-youtube-video
youtube.com/iframe_api
/api/show/tmdb/movie/
selectBestHeroMovies
posterWarmupMs
HERO_VISUAL_READY_CONFIRM_MS
setMuted(
soundPreferred
heroVideoStatus
heroVideoUrl
heroVideoMimeType

Confirm every usage before removing shared code.

Do not delete YouTube utilities used by TrailerSection or another dedicated
trailer viewer.

======================================================================
2. BASELINE AND ROOT-CAUSE REPORT
======================================================================

Before editing, run:

cd client
npm test
npm run lint
npm run build

Run the existing focused Hero E2E suites that are currently present.

Record:

- passes;
- failures;
- tests that currently require YouTube in Hero;
- tests that fake application state;
- tests that never prove native playback;
- tests that intentionally hang the MP4 request;
- current requests made during Home Hero startup.

Before implementation, produce a concise root-cause note covering:

1. where YouTube enters the Hero path;
2. why the Pause bezel can still appear;
3. where fixed delays are applied;
4. where auto-unmute happens;
5. where inactive trailer metadata is prefetched;
6. where server movie order is changed;
7. whether API failure silently falls back to dummy data.

Continue implementation immediately after this note.

======================================================================
3. TEST-FIRST CHANGE CONTROL
======================================================================

Before changing production Hero behavior, add or rewrite invariant tests that
FAIL on the current regression.

The initial failing tests must prove at least:

- Hero creates a YouTube iframe or requests YouTube/TMDB videos on current HEAD;
- native server order is not preserved, if that regression exists;
- automatic playback is unmuted after reveal, if that regression exists;
- inactive movie metadata or video is prefetched, if that regression exists.

Capture the failing test names and failure output.

Only after the tests have demonstrably failed may production code be modified.

Do not weaken those tests after implementation.

======================================================================
4. R1 — REMOVE YOUTUBE FROM THE HERO FLOW
======================================================================

The Home Hero must not:

- import or call fetchMovieTrailers;
- call /api/show/tmdb/movie/:id/videos;
- request youtube.com/iframe_api;
- resolve YouTube IDs or YouTube URLs as Hero media;
- render HeroYouTubeVideo;
- render an iframe;
- use YouTube player states;
- use YouTube-specific fallback or recovery;
- preload YouTube metadata.

In HeroSection.jsx:

- remove fetchMovieTrailers from imports;
- remove the YouTube fallback branch from loadHeroVideoSource;
- resolve only a configured ready native source;
- return null when no ready native source exists;
- treat null as a valid poster-only state;
- do not display an automatic missing-video error for poster-only movies;
- do not automatically switch to another movie because native media is absent.

HeroVideoRenderer may retain support for other media kinds only if another
non-Hero feature actually imports and uses it. The visible Hero path must pass
native sources only.

Acceptance invariant:

document.querySelectorAll('.hero-section iframe').length === 0

and:

document.querySelector('.hero-youtube-video') === null

YouTube behavior in TrailerSection must not be changed.

======================================================================
5. R2 — REMOVE ARBITRARY REVEAL DELAYS, KEEP EVENT-DRIVEN SAFETY
======================================================================

Remove from the native Hero reveal path:

- posterWarmupMs;
- Home-level timing gates whose only purpose is delaying native reveal;
- quarantine copied from the YouTube implementation;
- fixed timers that do not correspond to actual media state.

Do not remove the poster as a safety layer.

The native video may begin loading and playing muted behind the poster while
the entry loader is visible.

Once the loader has finished, reveal native video as soon as all real media
conditions are satisfied:

- generation is current;
- source belongs to the active movie;
- video emitted playing;
- readyState is at least HAVE_CURRENT_DATA;
- currentTime advanced between two samples;
- Hero is visible;
- document is visible;
- no waiting, stalled, pause, abort, emptied or error event occurred after the
  successful sample.

The sample interval may be a short technical polling interval. It must not be a
multi-second visual delay.

On any of these events:

- waiting;
- stalled;
- pause;
- error;
- source change;
- movie change;
- stale generation;
- document hidden;
- Hero outside viewport;

raise the poster immediately.

Do not preserve YouTube-specific quarantine constants merely for native video.

======================================================================
6. R3 — AUTOPLAY MUST REMAIN MUTED
======================================================================

Automatic native Hero playback must always start and remain muted.

Remove all logic that automatically unmutes after:

- visual reveal;
- stable playback;
- loader completion;
- stored sound preference;
- continuation without a direct user interaction.

Only an explicit user action on the volume control may unmute.

A stored preference may be retained for UI purposes, but it must not cause an
automatic playback attempt to become unmuted.

Required behavior:

AUTO:
effective muted = true

DIRECT USER VOLUME ACTION:
effective muted may become false

POSTER / PAUSE / BUFFERING / SOURCE SWITCH:
effective muted = true

Add tests proving:

- no preference -> autoplay muted;
- stored "on" -> autoplay still muted;
- stored preference is not overwritten merely because autoplay is forced muted;
- explicit volume click can unmute.

======================================================================
7. R3 — REMOVE INACTIVE MOVIE PREFETCHING
======================================================================

Remove preloadRemainingTrailerSources and all equivalent behavior.

The Hero must not:

- fetch metadata for inactive movies;
- request inactive native video files;
- create hidden players for inactive movies;
- preload all five video assets.

Only the active movie may request native media.

Inactive Hero movies may load only:

- poster images;
- backdrop images;
- thumbnail images.

After switching movies:

- pause the previous video;
- remove or clear the previous source;
- invalidate stale callbacks;
- request only the newly active movie's media;
- keep exactly one active video element.

======================================================================
8. R4 — PRESERVE SERVER ORDER
======================================================================

For a successful /api/show/hero response, preserve exact server order.

Do not:

- call selectBestHeroMovies on server-returned movies;
- calculate popularity/rating/native scores;
- reorder ready native movies;
- reorder manual selections;
- move a native-ready movie ahead or behind another movie on the client.

Use:

const rawMovies =
  Array.isArray(data.movies) && data.movies.length
    ? data.movies
    : dummyShowsData;

const orderedMovies =
  rawMovies.slice(0, HERO_MAX_MOVIES);

Validate images without changing array order.

Client-side scoring may be used only for local dummy fallback data when the
server request did not supply a usable movie list.

Add a deterministic test where the server returns a deliberately unusual movie
order and verify that the thumbnail and active title order is unchanged.

======================================================================
9. API SOURCE DIAGNOSTICS
======================================================================

Do not allow E2E tests to pass while silently using dummy fallback data.

The deterministic E2E backend must return an explicit native-ready Hero movie.

The test must prove:

- /api/show/hero was requested;
- the response fixture was consumed;
- the active title matches the first server movie;
- the active native source matches that movie;
- the application did not use dummy fallback.

Development diagnostics may expose a non-production data attribute such as:

data-catalog-source="server|fallback|mock"

Do not expose sensitive information.

Do not add a permanent user-facing error banner unless existing product behavior
requires it.

======================================================================
10. R5 — E2E TEST INTEGRITY
======================================================================

Delete or rewrite tests whose purpose is to validate YouTube inside Hero,
including:

client/e2e/hero-entry-autoplay.spec.js
client/e2e/hero-youtube-direct-play.spec.js

Do not merely delete coverage.

Migrate useful scenarios such as:

- entry loader;
- poster safety;
- stable playback;
- pause/buffering remask;
- movie switching;
- compact content;

to native media tests.

Use the real playable fixture:

client/public/mock/hero-trailer.mp4

Do not intercept this request and leave it hanging.

Do not replace it with an invalid or empty MP4.

Do not mock currentTime in end-to-end tests.

Do not manually add or remove production CSS classes.

Do not manually mutate the state machine from page.evaluate.

Tests must trigger behavior using the real application UI and real media events.

======================================================================
11. REQUIRED E2E MATRIX
======================================================================

TEST A — DESKTOP READY NATIVE MOVIE

Viewport:
1440x900

Server returns the native-ready movie first.

Assert:

await expect(hero.locator('iframe')).toHaveCount(0);
await expect(hero.locator('.hero-youtube-video')).toHaveCount(0);
await expect(hero.locator('.hero-native-video')).toHaveCount(1);

expect(requestsToYouTubeIframeApi).toBe(0);
expect(requestsToTmdbVideos).toBe(0);

Prove playback:

await expect.poll(
  () => nativeVideo.evaluate(video => video.readyState)
).toBeGreaterThanOrEqual(2);

const timeA =
  await nativeVideo.evaluate(video => video.currentTime);

await page.waitForTimeout(500);

const timeB =
  await nativeVideo.evaluate(video => video.currentTime);

expect(timeB).toBeGreaterThan(timeA);

Also assert:

- video.muted === true;
- video.playsInline === true;
- poster begins visible;
- poster hides after real playback is proven;
- one native video maximum;
- active video URL requested once.

TEST B — POSTER-ONLY MOVIE

Server returns a movie with no ready native source.

Assert:

- zero Hero iframe;
- zero Hero video;
- zero YouTube request;
- zero TMDB videos request;
- poster remains visible;
- no automatic missing-video error;
- no automatic switch caused by absent native media.

TEST C — SERVER ORDER

Server returns five movies in a fixed artificial order.

Assert:

- active title is the first server movie;
- thumbnail order matches the response exactly;
- client does not reorder based on popularity or native readiness.

TEST D — NO INACTIVE PREFETCH

Server returns five movies, each with a unique native URL.

Assert before switching:

- only the first movie's video URL is requested;
- the remaining four URLs are not requested.

Switch to movie two through the real thumbnail UI.

Assert:

- movie one is unloaded;
- movie two is requested;
- movies three through five are still not requested;
- exactly one video exists.

TEST E — AUDIO

Assert autoplay stays muted even when localStorage contains a prior "on"
preference.

Then click the real volume control and verify explicit user unmute works.

TEST F — BUFFERING / PAUSE SAFETY

Using real browser media behavior or a focused component test with valid event
dispatch:

- pause raises the poster;
- waiting/stalled raises the poster;
- playback must re-qualify before reveal;
- no second video is created.

TEST G — MOBILE / REDUCED MOTION / SAVE DATA

Before direct user action:

- zero video request;
- zero Hero video element, or an unloaded element if the current architecture
  requires it;
- zero iframe;
- zero YouTube/TMDB videos request;
- poster visible.

TEST H — COMPACT UI

Reach compact state through actual application behavior.

Do not add classes manually.

Assert:

- exactly one visible title;
- details hidden;
- thumbnail rail hidden and non-interactive;
- title is at lower-left;
- hovering/focusing title expands full content;
- rail returns after expansion.

======================================================================
12. SCOPE RESTRICTIONS
======================================================================

Do not modify unless a failing invariant requires it:

- MovieCard;
- TrailerSection;
- booking flow;
- payment flow;
- authentication;
- Clerk synchronization;
- cinema management;
- seat selection;
- unrelated Home sections;
- backend Hero selection logic;
- Cloudinary upload flow.

Do not:

- add a new media-player dependency;
- add ReactPlayer;
- redesign the Home page;
- add another loader;
- add another state machine;
- perform a broad folder refactor in the same patch;
- change server API contracts unnecessarily.

This patch is an architectural correction, not a redesign.

======================================================================
13. IMPLEMENTATION ORDER
======================================================================

Phase 1:
- Read instructions and current code.
- Run baseline.
- Add invariant tests that fail on current HEAD.
- Report the red tests.

Phase 2:
- Remove Hero YouTube fallback.
- Remove inactive metadata prefetch.
- preserve server order.
- remove automatic unmute.
- remove arbitrary native reveal delays while keeping event-driven poster safety.

Phase 3:
- Rewrite obsolete YouTube Hero tests as native tests.
- Run focused unit tests and E2E.
- Fix production code, not the assertions, when an invariant test fails.

Phase 4:
- Run full client tests.
- Run lint.
- Run build.
- Perform runtime DOM and network verification.
- Review the final diff for unrelated changes.

======================================================================
14. REQUIRED COMMANDS
======================================================================

Run all applicable commands:

cd client
npm test
npm run lint
npm run build

Run the focused Playwright suites, including all rewritten native
invariant tests.

Do not report a command as passing unless it was executed successfully.

If a command cannot run because of an environment limitation, report:

- exact command;
- exact error;
- missing dependency or service;
- which acceptance criteria remain unverified.

======================================================================
15. DEFINITION OF DONE
======================================================================

The task is complete only when all are true:

- HeroSection does not import fetchMovieTrailers.
- Hero startup does not request TMDB videos.
- Hero startup does not request YouTube IFrame API.
- `.hero-section iframe` count is zero.
- `.hero-youtube-video` is absent.
- ready native desktop movie creates one native video.
- currentTime advances on a real playable MP4.
- automatic playback remains muted.
- explicit volume interaction may unmute.
- poster-only movie remains valid without an error.
- only active movie video is requested.
- server order is preserved exactly.
- no arbitrary multi-second reveal delay remains.
- poster safety remains event-driven.
- mobile/reduced-motion/save-data remain poster-first.
- TrailerSection YouTube behavior is unchanged.
- tests do not manually force CSS/application state.
- tests, lint, and build pass.
- final diff contains no unrelated redesign or refactor.

======================================================================
16. FINAL REPORT
======================================================================

Return:

1. Current HEAD and branch.
2. Confirmed root causes.
3. Initial failing invariant tests.
4. Production files changed.
5. Test files deleted, rewritten, or added.
6. Exact behavior removed.
7. Exact behavior preserved.
8. Test command results.
9. DOM verification results.
10. Network request counts.
11. Playback currentTime evidence.
12. Proof autoplay remained muted.
13. Proof only active video was requested.
14. git diff --stat.
15. Remaining limitations.

Final verdict must be one of:

- COMPLETE — all acceptance criteria proven;
- BLOCKED — environment prevented specified verification;
- INCOMPLETE — one or more requirements remain unmet.

Do not use vague claims such as:

- should work;
- likely fixed;
- appears correct;
- production ready.

Every completion claim must be supported by code, logs, tests, DOM inspection,
network evidence, or actual playback.

## Follow-up — 2026-07-15T16:04:00Z

Title:
Precomputed Weekly Movie Catalog with Twice-Daily Rotation and Instant Home Entry

Repository:
e:\NitroCine

Integrity mode:
development

Primary objective:

Precompute and store a validated weekly catalog pool containing exactly
150 unique active movies so the Home page never has to wait for live TMDB
requests.

The weekly pool must serve seven days and rotate the visible movie selection
twice daily at:

- 08:00 Asia/Ho_Chi_Minh
- 20:00 Asia/Ho_Chi_Minh

A completely new 150-movie batch must be prepared every Monday at:

- 03:00 Asia/Ho_Chi_Minh

The Home page must render immediately and must not show the existing artificial
three-second HomeBootLoader.

Do not clear the Movie collection before the replacement batch is complete.
Do not delete historical Movie documents that may be referenced by Shows,
Bookings, favorites, reviews, Hero assets, or other user data.

======================================================================
0. READ PROJECT INSTRUCTIONS AND CURRENT CODE
======================================================================

Before modifying code, read:

- AGENTS.md
- server/AGENTS.md, when present
- client/AGENTS.md, when present
- all nearest scoped AGENTS.md files
- relevant SKILL.md files

Record:

- current branch;
- current HEAD;
- git status;
- uncommitted files.

Do not discard unrelated changes.

Read the complete current contents of:

SERVER

server/package.json
server/inngest/index.js
server/configs/db.js
server/models/Movie.js
server/models/Show.js
server/models/Booking.js
server/models/SiteConfig.js
server/services/movieService.js
server/services/homeNowShowingService.js
server/services/heroService.js
server/services/cacheService.js
server/services/cacheInvalidationService.js
server/services/redisKeys.js
server/controllers/showController.js
server/controllers/userController.js
server/routes/showRoutes.js

Search for any review/rating models and every reference to:

Movie
movieId
show.movie
favorites
reviews
catalog
nowPlaying
popular
upcoming
trending
importTrendingMoviesLogic
invalidateMovieCatalog
homeNowShowing
homeHero

CLIENT

client/src/pages/Home.jsx
client/src/components/HomeBootLoader.jsx
client/src/components/HeroSection.jsx
client/src/components/FeatureSection.jsx
client/src/services/tmdb.js
client/e2e/hero-entry-autoplay.spec.js
client/e2e/hero-direct-play.spec.js
client/package.json

Before editing, report:

1. existing catalog data flow;
2. all references that make hard deletion unsafe;
3. Home endpoints that still call TMDB at request time;
4. current cache behavior;
5. current loader timing;
6. exact implementation plan.

Continue implementation after the report without waiting.

======================================================================
1. NON-NEGOTIABLE DATA-SAFETY RULE
======================================================================

Do not execute:

Movie.deleteMany({})

Do not drop the Movie collection.

Do not delete a Movie merely because it is absent from the new weekly catalog.

Movie documents can be referenced by:

- Show.movie;
- Booking through Show;
- Clerk favorite movie IDs;
- reviews or ratings if present;
- Hero configuration;
- native Hero video assets;
- historical user activity.

The invariant is:

> Exactly 150 unique movies belong to the currently active catalog batch.

It is NOT:

> MongoDB must contain only 150 Movie documents in total.

Historical and referenced Movie documents may remain in MongoDB but must not
appear in the active catalog unless they belong to the active batch.

======================================================================
2. WEEKLY CATALOG BATCH MODEL
======================================================================

Create a dedicated model such as:

server/models/CatalogBatch.js

Suggested contract:

{
  weekKey: String,              // example: "2026-W29"
  status: "staging" | "active" | "retired" | "failed",

  buckets: {
    newest: [String],           // exactly 50 unique movie IDs
    classics: [String],         // exactly 50 unique movie IDs
    popular: [String]           // exactly 50 unique movie IDs
  },

  movieIds: [String],           // exactly 150 globally unique IDs

  generatedAt: Date,
  validatedAt: Date,
  activatedAt: Date,
  retiredAt: Date,

  sourceMeta: {
    region: String,
    language: String,
    newestPages: [Number],
    classicPages: [Number],
    popularPages: [Number]
  },

  metrics: {
    fetched: Number,
    rejected: Number,
    duplicates: Number,
    detailsFetched: Number
  },

  failureReason: String
}

Required indexes:

- unique weekKey;
- status;
- activatedAt.

Store the currently active batch ID in one authoritative location, preferably:

SiteConfig.catalog.activeBatchId

Also support:

SiteConfig.catalog.refreshing
SiteConfig.catalog.activeSlot
SiteConfig.catalog.lastRotationAt
SiteConfig.catalog.lastSuccessfulRefreshAt

Do not maintain multiple competing active-batch flags.

======================================================================
3. SHARED CATALOG REFRESH SERVICE
======================================================================

Create one reusable service, for example:

server/services/catalogRefreshService.js

Both the CLI and Inngest jobs must call this same service.

Do not duplicate TMDB fetching or database replacement logic between:

- server/scripts/seed.js;
- Inngest cron functions;
- controllers.

The service must expose functions similar to:

buildWeeklyCatalogBatch()
activateCatalogBatch()
refreshWeeklyCatalog()
getCurrentCatalogRotation()
warmCatalogCaches()

Controllers and jobs must remain thin.

======================================================================
4. BUILD EXACTLY 150 UNIQUE MOVIES
======================================================================

Build three buckets:

A. NEWEST — exactly 50

Use TMDB now-playing/upcoming/discover endpoints.

Prefer:

- current theatrical releases;
- recently released movies;
- near-future releases only when needed to fill the bucket.

B. CLASSICS — exactly 50

Use TMDB discover with explicit quality constraints.

Recommended filters:

- include_adult=false;
- primary_release_date.lte at least 15 years before today;
- vote_count.gte with a meaningful threshold;
- vote_average.gte with a meaningful threshold;
- sort by vote_average.desc, vote_count.desc, or popularity.desc.

Do not interpret primary_release_date.asc alone as quality. That would select
very old obscure movies rather than useful classics.

C. POPULAR/RANDOM — exactly 50

Use:

- /movie/popular; or
- /discover/movie sorted by popularity;
- deterministic randomized pages.

The random selection must be reproducible for a given weekKey.

Use a seeded random generator derived from weekKey instead of Math.random()
alone, so retries produce the same candidate order.

======================================================================
5. GLOBAL DEDUPLICATION AND BACKFILL
======================================================================

Deduplicate globally by normalized TMDB movie ID.

The final constraints are:

newest.length === 50
classics.length === 50
popular.length === 50
new Set(movieIds).size === 150
movieIds.length === 150

Bucket precedence:

1. newest;
2. classics;
3. popular.

If a popular candidate already exists in newest or classics, reject it and
continue fetching candidates.

If any bucket falls below 50 after deduplication or validation:

- fetch additional pages;
- continue until the bucket has 50;
- enforce a bounded maximum number of pages;
- fail the staging batch rather than activate fewer than 150.

Do not activate a partial batch.

======================================================================
6. MOVIE QUALITY VALIDATION
======================================================================

A movie may enter the active catalog only when it has:

- valid numeric TMDB ID;
- non-empty title;
- non-empty overview;
- valid release_date;
- poster_path;
- backdrop_path;
- adult !== true;
- runtime from the details endpoint;
- genres;
- vote_average;
- original_language.

Fetch details and credits only after list-level deduplication to avoid wasting
requests.

Use bounded concurrency, for example five simultaneous detail requests.

Add:

- request timeout;
- retry with bounded exponential backoff;
- per-movie failure isolation;
- structured metrics.

Do not make 150 detail requests simultaneously.

Use the existing TMDB bearer token convention already present in the server.

======================================================================
7. SAFE STAGING AND ATOMIC ACTIVATION
======================================================================

The Monday refresh must use this exact order:

1. Acquire a distributed Redis lock.
2. Mark catalog.refreshing=true.
3. Create a staging CatalogBatch.
4. Fetch and validate the candidate pool.
5. Confirm all three buckets contain 50.
6. Confirm global uniqueness is exactly 150.
7. Upsert Movie documents.
8. Validate persisted Movie IDs.
9. Mark the staging batch validated.
10. Atomically switch SiteConfig.catalog.activeBatchId to the new batch.
11. Mark the new batch active.
12. Mark the previous batch retired.
13. Set catalog.refreshing=false.
14. Invalidate and warm relevant caches.
15. Release the lock in finally.

Never perform:

delete old data
→ fetch new data
→ hope the new import succeeds

The active batch must remain unchanged until the new batch is fully ready.

If any phase fails:

- keep the previous batch active;
- mark the staging batch failed;
- set catalog.refreshing=false;
- release the lock;
- report structured failure details;
- do not expose a partial batch.

======================================================================
8. MONDAY 03:00 WEEKLY REFRESH
======================================================================

Register an Inngest function with timezone-aware cron:

TZ=Asia/Ho_Chi_Minh 0 3 * * 1

This is Monday at 03:00 Vietnam time.

Use the trigger syntax supported by the installed Inngest version.

Suggested function ID:

weekly-catalog-refresh

Use step.run() for durable phases where appropriate:

- acquire-lock;
- build-candidates;
- fetch-details;
- persist-movies;
- validate-batch;
- activate-batch;
- invalidate-cache.

The current daily trending importer must not continue modifying the active
catalog independently.

Either:

- remove dailyTrendingImport from the registered functions; or
- restrict it to a separate non-catalog purpose.

Do not allow two independent jobs to compete over catalog membership.

Inngest officially supports timezone-aware cron expressions; use the explicit
Asia/Ho_Chi_Minh timezone rather than relying on server UTC.

======================================================================
9. TWICE-DAILY ROTATION AT 08:00 AND 20:00
======================================================================

The weekly pool serves 14 display slots:

slot 0: Monday 08:00
slot 1: Monday 20:00
slot 2: Tuesday 08:00
slot 3: Tuesday 20:00
...
slot 12: Sunday 08:00
slot 13: Sunday 20:00

Register a lightweight Inngest function:

TZ=Asia/Ho_Chi_Minh 0 8,20 * * *

Suggested function ID:

rotate-active-catalog-slot

The rotation job must not refetch TMDB.

It must only:

1. identify the active weekly batch;
2. calculate the expected slot;
3. set SiteConfig.catalog.activeSlot;
4. set lastRotationAt;
5. invalidate relevant Home/catalog cache keys;
6. warm the next public payload.

The public catalog service must also calculate the expected slot from current
Asia/Ho_Chi_Minh time as a fallback.

This ensures rotation remains correct if the cron invocation is delayed or
missed.

Do not rely solely on a mutable counter.

======================================================================
10. DETERMINISTIC WEEKLY ROTATION
======================================================================

Do not create 14 unrelated random arrays manually.

For each active batch:

1. combine the 150 movie IDs;
2. generate a deterministic permutation using:
   weekKey + slotIndex;
3. return section-specific slices from that permutation.

The same week and slot must always produce the same order.

A different slot must produce a meaningfully different order.

Across all 14 slots, every active movie must be eligible to appear.

Avoid placing the same movie in multiple Home sections in the same response.

Possible section allocation:

- Hero candidates;
- Now Showing;
- Popular;
- Classics;
- Recommended.

Preserve all existing product-specific limits.

Do not send all 150 full movie objects to the browser when a page needs only a
small subset.

======================================================================
11. POSTER-ONLY BEHAVIOR DURING REFRESH
======================================================================

The weekly refresh must not blank the site.

While SiteConfig.catalog.refreshing === true:

- continue serving the previous active batch;
- Home sections remain available;
- Hero must remain poster-only;
- do not start native Hero video;
- do not show a blocking loader;
- do not display an empty page.

After atomic activation succeeds:

- normal Hero native eligibility may resume;
- caches are refreshed;
- the next request receives the new batch.

If no previous active batch exists:

- return a valid poster-only fallback payload;
- never wait synchronously for the seeder;
- never call TMDB from the browser to fill the page.

======================================================================
12. CLI SEEDER
======================================================================

Create:

server/scripts/seed.js

Add to server/package.json:

"seed:catalog": "node scripts/seed.js"

The CLI must call the same refreshWeeklyCatalog() service used by Inngest.

The CLI must:

- load environment variables;
- connect to MongoDB;
- connect to Redis when configured;
- print current weekKey;
- print bucket progress;
- print deduplication metrics;
- validate exactly 150;
- atomically activate the new batch;
- close database and Redis connections;
- exit code 0 on success;
- exit code 1 on failure.

Support an optional safe dry-run:

npm run seed:catalog -- --dry-run

Dry-run must:

- fetch and validate;
- print the proposed 150 IDs;
- not write Movie, CatalogBatch, or SiteConfig.

Do not include a destructive --force-delete mode.

======================================================================
13. REMOVE LIVE TMDB DEPENDENCY FROM HOME ENTRY
======================================================================

Home initial rendering must use:

- MongoDB active catalog batch;
- Redis-cached payload;
- last-good cached payload;
- poster-only fallback.

The Home initial request must not wait for live calls to:

- /movie/now_playing;
- /movie/upcoming;
- /movie/popular;
- /discover/movie;
- /trending/movie/*.

TMDB fetching belongs to:

- weekly catalog preparation;
- admin search;
- explicit movie-detail fallback where already required.

Update homeNowShowingService and any equivalent Home catalog service so the
initial Home request is database/cache-first.

Do not remove TMDB routes needed for admin tools or other explicit features.

======================================================================
14. INSTANT HOME ENTRY
======================================================================

Remove the artificial Home boot loader completely.

From client/src/pages/Home.jsx remove:

- HomeBootLoader import;
- loaderMs;
- fadeMs;
- posterWarmupMs;
- introPhase state;
- loader timers;
- scroll locking tied to introComplete;
- aria-busy/inert wrapper caused by the loader;
- HomeBootLoader rendering;
- timing overrides used only by the entry loader.

Render immediately:

<>
  <HeroSection />
  <Suspense fallback={...}>
    <FeatureSection />
    <TrailerSection />
  </Suspense>
</>

Do not merely set loaderMs to zero while leaving the loader state machine
mounted.

Delete HomeBootLoader only after searching the repository and confirming it has
no other valid consumers.

The Hero must render its poster immediately from available catalog data.

Use a local section skeleton or poster placeholder only where network data has
not yet arrived.

Do not use a full-screen blocking loader.

======================================================================
15. CACHE STRATEGY
======================================================================

Add or update Redis keys for:

- active catalog batch;
- active rotation slot;
- Home payload for batch + slot;
- last-good Home payload;
- refresh lock.

Suggested structure:

nitrocine:v1:catalog:active
nitrocine:v1:catalog:slot:<batchId>:<slot>
nitrocine:v1:catalog:last-good
nitrocine:v1:lock:catalog-refresh

Cache keys must include active batch ID and slot index so old slot data cannot
be returned after rotation.

At weekly activation:

- invalidate catalog payload caches;
- preserve last-good until new payload is warmed;
- warm slot 0 or the current expected slot.

At 08:00/20:00 rotation:

- invalidate only slot-sensitive caches;
- warm the new current slot;
- optionally warm the next slot.

======================================================================
16. CLEANUP POLICY
======================================================================

Do not delete Movie documents as part of weekly activation.

A separate cleanup service may delete only Movie documents that satisfy every
condition:

- absent from every retained CatalogBatch;
- not referenced by any Show;
- not referenced by Hero configuration;
- no native Hero asset requiring retention;
- not protected by any known review/rating model;
- older than a configured grace period.

Because favorites are stored in Clerk metadata, the system cannot safely prove
that a movie is not favorited by querying MongoDB alone.

Therefore, default cleanup behavior must retain Movie documents.

CatalogBatch records may be retired and pruned after a configured retention
period, but keep enough history for rollback.

======================================================================
17. TEST REQUIREMENTS
======================================================================

SERVER UNIT TESTS

Test:

- exactly 50 newest;
- exactly 50 classics;
- exactly 50 popular;
- exactly 150 globally unique IDs;
- duplicate candidates are backfilled;
- invalid candidates are rejected;
- partial batches never activate;
- previous batch remains active on failure;
- Movie collection is not cleared;
- referenced movies are not deleted;
- dry-run performs no writes;
- retry is deterministic for the same weekKey;
- different slot indices produce different deterministic orders;
- all 14 weekly slots are valid;
- only one refresh lock holder proceeds;
- 08:00/20:00 rotation performs no TMDB request;
- cache invalidation occurs after successful activation;
- cache is not invalidated for failed staging.

INTEGRATION TEST

Run the CLI against a test database and verify:

- one active CatalogBatch;
- active batch contains exactly 150 IDs;
- all IDs resolve to Movie documents;
- the three bucket sizes are exactly 50;
- no duplicate IDs;
- an existing Show/Booking movie remains intact even when not in the batch.

CLIENT/E2E TESTS

Verify:

- HomeBootLoader is not rendered;
- Home content is not inert;
- no three-second wait;
- Hero poster appears immediately;
- Home sections begin rendering immediately;
- Home initial load does not call live TMDB list endpoints;
- during catalogRefreshing=true, Hero remains poster-only;
- previous catalog remains visible;
- no full-screen loading overlay appears.

Use elapsed-time assertions carefully. Prefer state assertions over flaky
millisecond thresholds.

======================================================================
18. ACCEPTANCE CRITERIA
======================================================================

The task is complete only when:

- Monday refresh runs at 03:00 Asia/Ho_Chi_Minh.
- Rotation occurs at 08:00 and 20:00 Asia/Ho_Chi_Minh.
- The active weekly batch contains exactly 150 unique movies.
- Buckets contain exactly 50/50/50.
- The active batch is prepared before activation.
- Old active data remains available until the new batch is valid.
- Movie collection is never hard-cleared.
- Shows, bookings and favorites remain intact.
- Home initial rendering makes no live TMDB list request.
- HomeBootLoader is completely removed from the Home path.
- Home content renders immediately.
- Refresh state shows poster-only Hero, not a blocking loader.
- CLI and Inngest use one shared service.
- CLI dry-run works.
- Redis cache keys are batch- and slot-aware.
- Only the active slot's needed movies are sent to the client.
- All tests pass.

======================================================================
19. REQUIRED COMMANDS
======================================================================

SERVER

cd server
npm test
npm run seed:catalog -- --dry-run
npm run seed:catalog

CLIENT

cd client
npm test
npm run lint
npm run build

Run focused Playwright tests covering Home entry and poster-only refresh.

Do not run the destructive integration seeder against production.

Use an explicit test database or development database.

======================================================================
20. FINAL REPORT
======================================================================

Return:

1. Current HEAD and branch.
2. Root causes and old runtime data flow.
3. Files changed.
4. CatalogBatch schema.
5. Weekly refresh schedule.
6. Twice-daily rotation schedule.
7. Bucket selection rules.
8. Deduplication/backfill metrics.
9. Atomic activation behavior.
10. Failure and rollback behavior.
11. Cache keys and invalidation.
12. Home loader files removed.
13. Live TMDB calls removed from Home entry.
14. CLI dry-run output.
15. CLI development run output.
16. Test results.
17. Database verification:
    - active batch count;
    - newest count;
    - classics count;
    - popular count;
    - global unique count.
18. Proof existing Show/Booking references remain valid.
19. git diff --stat.
20. Remaining limitations.

Final verdict:

- COMPLETE;
- BLOCKED;
- INCOMPLETE.

Do not use vague claims such as "should work" or "looks correct".

## Follow-up — 2026-07-15T16:13:43Z

ADDITIONAL REQUIREMENT from the user:

### NEW R5: Admin UI Seed Trigger Button
Add a protected admin route and a corresponding button in the admin panel UI that allows an authenticated admin to manually trigger the catalog refresh (the same `refreshWeeklyCatalog()` service used by CLI and Inngest). This is critical for deployed environments (e.g., Vercel) where CLI access is not available.

Requirements:
- Add a server endpoint (e.g., `POST /api/admin/catalog/refresh`) that calls `refreshWeeklyCatalog()`.
- The endpoint must be protected by admin authentication.
- Add a simple button in the existing admin UI (if one exists) or create a minimal `/admin` page with a "Refresh Catalog" button.
- The button should show progress/status feedback (refreshing, success, failure).
- Include a dry-run option if feasible.

### NEW R6: Smart Home Entry (Replace Fixed 3s Wait)
Instead of a fixed 3-second `HomeBootLoader`, implement a smart loading strategy:
- Do NOT show a fixed-time loader.
- Wait until the 3 main sections (Hero, NowShowing/FeatureSection, TrailerSection) have received their data from the API/cache.
- Once all 3 sections have data ready, render the full page.
- Use skeleton placeholders per-section while individual sections load, NOT a full-screen blocking overlay.
- If any section takes too long (e.g., >5s timeout), render whatever is ready and show the rest as skeletons.

### NEW R7: Final Project Cleanup & Performance Optimization
After all features are implemented:
- Remove unused files, dead imports, orphaned components.
- Remove temporary/diagnostic scripts created during development.
- Optimize bundle size (lazy loading, code splitting where beneficial).
- Ensure no console.log spam in production builds.
- Clean up any duplicate helper functions or services.
