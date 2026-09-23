# NitroCine production operations

## Required production variables

Set these in Vercel/serverless and never commit their values:

- Server: `MONGODB_URI`, `REDIS_URL`, `TMDB_API_KEY`, Clerk keys, `CLIENT_URL`, Stripe, and Inngest signing/event keys. The full list with defaults is in `server/.env.example`.
- Client: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_BASE_URL=https://nitrocine-server.vercel.app`, and `VITE_ENABLE_MOCK_DATA=false`.

The Vercel demo may use Clerk `pk_test_...`/`sk_test_...`; the app logs a warning but continues to boot. Replace both with `pk_live_...`/`sk_live_...` before real users register, sign in, or book tickets.

The liveness endpoint is `GET /api/health`. Readiness is `GET /api/health/ready`; it does not call TMDB and checks database, Redis, Clerk, TMDB configuration, and `CLIENT_URL`.

## Showtime operations

Now Showing is sourced from TMDB `/movie/now_playing` with region `VN` and language `vi-VN`; TMDB supplies movie metadata, not cinema-specific showtimes. NitroCine therefore generates mock showtimes, and only for the movies the home page features: the five Hero posters and the ten Now Showing movies. Each gets three start times a day (09:00 to 23:00, never overlapping) for the next seven Vietnam calendar days. The times are seeded by movie and date, so re-running a sync reuses the same shows instead of adding more.

Showtimes appear in two ways:

- **On demand.** Opening a featured movie with an incomplete schedule generates it inside the request, so nothing waits for a job after a deploy. Set `DEMO_SHOWTIMES_ENABLED=false` to turn this off.
- **Daily sync.** The Inngest job runs at 00:05 Vietnam time. It schedules the current featured movies and closes unbooked future shows for movies that are no longer featured. It can also be run by hand from the server project:

```text
npm run sync:now-playing
```

The alternative admin-only endpoint is `POST /api/show/sync-now-playing`. It must not be exposed to unauthenticated clients. If the Hero or Now Showing cannot be loaded, nothing is closed; if neither can, the sync stops and existing schedules are kept.

## Hero trailers

On desktop the Hero can play a muted, control-free trailer over each poster. TMDB only links YouTube, so the video files are configured on the server:

- `HERO_TRAILER_VIDEOS`: JSON mapping a TMDB movie ID to an https `.mp4`, `.m4v` or `.webm` URL, or to `{ "src": "...", "zoom": 1.33 }` to crop letterboxing (zoom is clamped to 1–1.5).
- `HERO_VIDEO_ALLOWED_HOSTS`: comma-separated hosts those URLs may use, for example `res.cloudinary.com`. Any other host is dropped.

Movies without a valid entry keep their poster. Use only trailers you are licensed to serve. `HERO_DEMO_VIDEOS=true` fills gaps with open-licence clips for local testing and is ignored in production.

## Release and rollback

1. Deploy server and client with the same release commit.
2. Check `/api/health/ready`, then call `/api/show/tmdb/home-now-showing?limit=10` and verify `success: true`, `X-Data-Source: tmdb-now-playing`, region `VN`, and ten popularity-ranked discovery cards. Validate bookable schedules separately on movie details.
3. Verify Clerk uses live keys, the Hero shows two new releases followed by three classics, and a booking rejects closed or started shows.
4. If the release is unhealthy, roll back the Vercel deployment. Do not delete Shows or Movies; the sync is idempotent and preserves occupied seats, bookings, prices, and document IDs.

Keep MongoDB Atlas backups enabled and test restore procedures before a production migration. Schema/index changes must be deployed with their migration scripts and verified before enabling write traffic.
