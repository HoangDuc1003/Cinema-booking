# NitroCine production operations

## Required production variables

Set these in Vercel/serverless and never commit their values:

- Server: `MONGODB_URI`, `REDIS_URL`, `TMDB_API_KEY`, Clerk keys, `CLIENT_URL`, Stripe, Cloudinary, and Inngest signing/event keys.
- Client: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_BASE_URL=https://nitrocine-server.vercel.app`, and `VITE_ENABLE_MOCK_DATA=false`.

The Vercel demo may use Clerk `pk_test_...`/`sk_test_...`; the app logs a warning but continues to boot. Replace both with `pk_live_...`/`sk_live_...` before real users register, sign in, or book tickets.

The liveness endpoint is `GET /api/health`. Readiness is `GET /api/health/ready`; it does not call TMDB and checks database, Redis, Clerk, TMDB configuration, and `CLIENT_URL`.

## Now Playing operations

Now Showing is sourced from TMDB `/movie/now_playing` with region `VN` and language `vi-VN`; TMDB supplies movie metadata, not cinema-specific showtimes. NitroCine therefore simulates one bookable show per movie per day for the next seven Vietnam calendar days, including active Hero movies, with stable idempotent schedule keys and hall-conflict protection. The daily Inngest job runs at 00:05 Vietnam time. After a new deployment, run the protected manual operation from the server project:

```text
npm run sync:now-playing
```

The alternative admin-only endpoint is `POST /api/show/sync-now-playing`. It must not be exposed to unauthenticated clients. A failed or empty TMDB response preserves existing schedules.

## Release and rollback

1. Deploy server and client with the same release commit.
2. Check `/api/health/ready`, then call the home Now Showing endpoint and verify `success: true`, `X-Data-Source: bookable-shows`, and future VN shows.
3. Verify Clerk uses live keys, the hero has no iframe, and a booking rejects closed/started shows.
4. If the release is unhealthy, roll back the Vercel deployment. Do not delete Shows or Movies; the sync is idempotent and preserves occupied seats, bookings, prices, and document IDs.

Keep MongoDB Atlas backups enabled and test restore procedures before a production migration. Schema/index changes must be deployed with their migration scripts and verified before enabling write traffic.
