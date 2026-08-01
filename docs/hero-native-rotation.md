# Native Hero rotation operations

The Home Hero is a separate rotation layer over the 150-movie catalog. It never
shrinks or replaces that catalog. A valid `HeroRotationBatch` contains exactly
15 unique movies:

- 5 `newest`
- 5 `hot`
- 5 seeded `discovery` movies

The server selects and orders exactly five of those movies, including at least
one from each category. The browser preserves that order and mounts at most one
native HTML5 video. YouTube URLs, iframes, generic loops, shared trailer URLs,
and test fixtures are not production Hero assets.

## Production prerequisites

Use MongoDB Atlas or another replica set because activation and rollback are
transactions. Redis is required for the fenced refresh lease and idempotency.
TMDB supplies catalog metadata. The current protected upload/commit
implementation verifies licensed native trailer files from the project's
Cloudinary account.

Configure the variables documented in `server/.env.example`, especially:

```env
HERO_REFRESH_TIMEZONE=Asia/Ho_Chi_Minh
HERO_REFRESH_INTERVAL_HOURS=48
HERO_DEFAULT_VOLUME=0.35
HERO_REQUIRE_NATIVE_VIDEO=true
HERO_VIDEO_ALLOWED_HOSTS=res.cloudinary.com
HERO_VIDEO_ORPHAN_GRACE_SECONDS=3600
HERO_MIN_VOTE_AVERAGE=7
HERO_MIN_VOTE_COUNT=300
CACHE_HERO_ACTIVE_TTL_SECONDS=172800
CACHE_HERO_LAST_GOOD_TTL_SECONDS=604800
HERO_REFRESH_LOCK_TTL_MS=120000
HERO_REFRESH_RUN_TTL_SECONDS=604800
CLOUDINARY_NAME=<cloud-name>
CLOUDINARY_API_KEY=<api-key>
CLOUDINARY_SECRET_KEY=<api-secret>
REDIS_CONNECT_TIMEOUT_MS=5000
REDIS_MAX_RECONNECT_ATTEMPTS=1
REDIS_COMMAND_TIMEOUT_MS=2000
```

Keep all real values in the deployment environment or an ignored local
`.env`. Never put a credential in Git or in a browser `VITE_*` variable.
Redis connection and command timeouts are deliberately bounded (100-30000ms)
so an unavailable cache falls back to poster/last-good behavior instead of
holding a page request.

## Safe deployment and migration

1. Back up MongoDB and confirm the target URI and `/api/health`.
2. Deploy code that understands both the legacy poster fallback and
   `HeroRotationBatch`.
3. Run the idempotent index/config migration from `server/`:

   ```bash
   npm run migrate:hero-rotation
   ```

4. Verify the `hero_batch_key_unique`, `hero_run_unique`, and
   `hero_single_active` indexes. The last is a partial unique index and is the
   database guard against two active Hero batches.
5. Upload and commit enough movie-specific trailers before manually refreshing.
   A failed build is retained as `failed`; it does not retire the current active
   batch or empty the public Hero.
6. Trigger one manual refresh with a stable idempotency key and verify the
   public payload, Redis cache, ETag, and browser playback before enabling
   normal traffic.

Catalog enrichment uses the same fenced activation service after it verifies new
Cloudinary assets, so a completed upload does not have to wait for the next cron.

The no-argument foundation rollback is deliberately conservative:

```bash
npm run rollback:hero-rotation
```

It only removes an empty, unused Hero-rotation foundation. It refuses to delete
batch history. To reactivate a known-good retired batch, use the batch rollback
form after verifying all 15 distinct native assets in that retained pool:

```bash
npm run rollback:hero-rotation -- --batch-id=<hero-rotation-batch-object-id>
```

Never delete `Movie`, `Show`, `Booking`, authentication, payment, or seat data
as part of a Hero rollback.

## Upload and map native trailers

The Admin Hero page uses this protected flow:

1. `GET /api/admin/hero/upload-signature?movieId=<tmdb-id>` returns a short-lived
   signed upload contract.
2. Upload MP4 (H.264/AAC) or WebM to the returned
   `hero_trailers/<movieId>/` folder and include every signed field.
3. `POST /api/admin/hero/<movieId>/commit` with the returned Cloudinary
   `publicId`.

The server—not the client—loads the Cloudinary resource and verifies:

- the folder and movie ID binding;
- HTTPS host, resource type, format, codec, dimensions, duration, and bytes;
- the decoded Cloudinary metadata and optional attribution;
- that no other movie already uses the same trailer URL.

Only then does it write `heroVideoStatus=ready`, metadata, poster, checksum, and
a new video version. Video bytes remain in Cloudinary/CDN, never MongoDB.

Do not upload a YouTube download, scrape YouTube, use `yt-dlp`, or map one
generic video to several movies. Operators must have the right to use every
trailer.

## Build or randomize the Hero

All endpoints below are protected by the existing `protectAdmin` middleware.

```http
POST /api/admin/hero/refresh
Content-Type: application/json

{"idempotencyKey":"release-2026-07-29"}
```

This calls the same service and invariants as the scheduler. If any category
cannot supply five unique, verified native trailers, the response identifies
the missing/invalid movies and the last active batch stays live.

To choose a new five-movie order from the current valid pool without rebuilding
all 15:

```http
POST /api/admin/hero/randomize
Content-Type: application/json

{"selectionSeed":"campaign-a"}
```

`GET /api/admin/hero` returns current pool/category membership, active five,
batch/version/timestamps, native validation state, recent failed builds, and
the missing-trailer list.

Before the first activation, the same response exposes a deterministic pending
15-movie candidate pool (5 newest, 5 hot, 5 discovery) from the active catalog.
It is an upload worklist only: invalid or missing assets remain poster-only and
cannot be activated until the native validation contract passes.

## Sound policy

Admin defaults are updated with:

```http
PUT /api/admin/hero/sound
Content-Type: application/json

{"heroSoundDefaultEnabled":true,"heroDefaultVolume":0.35}
```

Browsers may reject audible autoplay. The client tries audible playback only
when prior user consent or the admin default permits it, immediately retries
muted after `NotAllowedError`, and shows an accessible **Turn trailer sound on**
control. It stores `nitrocine:hero-audio-consent` only after a successful
user-activated unmute. Muted video remains the reliable fallback.

## Scheduler

Inngest invokes the Hero job every day at `00:00` in
`Asia/Ho_Chi_Minh`. The job reads `nextRefreshAt` and does work only when the
48-hour window is due. It uses:

- a stable refresh-window/run key;
- Inngest concurrency limit 1 and retries;
- the Redis fenced lock and monotonically increasing token;
- a MongoDB transaction for retire/activate/config pointer changes;
- cache invalidation and warming only after commit.

At month and year boundaries, `nextRefreshAt` is the first Vietnam local
midnight that is at least 48 hours after the successful refresh; it is not a
`*/2` day-of-month cron. A midday manual refresh can therefore schedule the
third following calendar date while still preserving the full 48-hour window.

Inspect the registered functions at `/api/inngest` and verify that the deployed
function ID and cron timezone match the source. Inngest event/signing keys must
be present in the deployment environment.

## Redis and HTTP cache verification

With the default prefix, the relevant Redis namespaces are:

- `nitrocine:v1:hero:active:<batch-id>:<version>:<cache-generation>`
- `nitrocine:v1:hero:last-good`
- `nitrocine:v1:hero:refresh-run:<run-id>`
- `nitrocine:v1:lock:hero-refresh`
- `nitrocine:v1:lock:hero-refresh:fence`

Use provider tooling or `redis-cli` without printing credentials. Confirm the
first public request reports a miss/warm result and the next request a hit.
After activation, rerandomization, sound changes, upload commit, or valid asset
removal, stale active keys must be invalidated.

`GET /api/show/hero` returns an ETag. Repeating the request with
`If-None-Match` must return `304` with no JSON body. A new batch, five-movie
order, video version, or sound setting must change the ETag.

## Missing trailer and failure recovery

If refresh reports `HERO_NATIVE_ASSETS_INSUFFICIENT`:

1. Read `missingTrailers` and each movie's validation issues from the protected
   Admin response.
2. Upload/commit distinct assets for the required category candidates.
3. Retry with the same idempotency key for the same operation, or use a new
   deliberate release key when starting a different build.
4. Verify that exactly one batch is active and that the old batch was retired
   only after the replacement committed.

Do not replace missing assets with YouTube, a poster pretending to play, or a
generic loop. With no valid active batch, the public endpoint intentionally
serves an ordered poster-only emergency fallback.

## Verification commands

From `server/`:

```bash
npm test
npm start
```

From `client/`:

```bash
npm test
npm run lint
npm run build
npm run test:e2e
```

The native Hero Playwright test must use the tracked CC0 MP4 fixture only as a
test asset and prove that `currentTime` advances. It must also prove one active
video, zero Hero iframe/YouTube/TMDB-video requests, no native controls, bounded
end/error handoff, muted autoplay fallback, and no 15-video request fan-out.
