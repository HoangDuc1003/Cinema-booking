# Redis and booking concurrency

## Goals and source of truth

MongoDB is the source of truth for bookings. The unique index `SeatReservation(show, seat)` guarantees that each seat of a showtime has at most one active reservation. Redis takes load off reads, provides the seat-hold TTL, reduces contention with a distributed lock and stops the same Stripe event from being processed concurrently; if Redis is temporarily unavailable, the system still relies on the MongoDB invariant.

MongoDB must run as a replica set (MongoDB Atlas meets this requirement) because create, payment and cancel use transactions.
Booking creation and the payment callback wait for `Booking.init()` and `SeatReservation.init()` to finish. Movie/read APIs depend only on the MongoDB connection, so a failed booking index migration does not make the whole catalog return 503.

## Redis keys

The default prefix is `nitrocine:v1`; the `nitrocine` part can be changed with `REDIS_KEY_PREFIX`.

| Key pattern | Contents | Default TTL |
|---|---|---:|
| `{prefix}:cache:movies:all` | list of movies with real/virtual shows | 300 seconds |
| `{prefix}:cache:movies:now-playing` | TMDB now-playing | 300 seconds |
| `{prefix}:cache:movie:{movieId}` | movie detail | 1,800 seconds |
| `{prefix}:cache:cinemas:all` | list of halls/cinemas | 600 seconds |
| `{prefix}:cache:showtimes:{movieId}` | movie + seven days of showtimes | 120 seconds |
| `{prefix}:cache:seat-map:{showId}` | array of paid/held seats | 5 seconds |
| `{prefix}:hold:show:{showId}:seat:{seat}` | ID of the booking holding the seat | 1,800 seconds |
| `{prefix}:lock:booking:{showId}` | random lock token | 10,000 ms |
| `{prefix}:lock:stripe-event:{eventId}` | random processing token | 30,000 ms |
| `{prefix}:idempotency:stripe:{eventId}` | `processed` marker | 604,800 seconds |

Locks are released with a compare-and-delete Lua script, so one request can never delete a lock or hold created by another request.

## Booking flow

1. The server normalizes seat IDs, removes duplicates, caps the request at eight seats and recomputes the price from `showPrice` + seat class.
2. A virtual/mock show is resolved into a real Show.
3. The Redis show lock is acquired with a short wait. If Redis is down the flow continues, because the DB unique index still protects the inventory.
4. A Mongo transaction deletes related expired holds, creates a pending Booking and inserts one SeatReservation per seat.
5. Only one request can insert a given `(show, seat)`; a duplicate key returns HTTP 409.
6. After the commit, the Redis seat hold is written with a TTL and the seat-map/showtime caches are invalidated.
7. The Stripe callback verifies the signature, applies event idempotency, confirms the reservations, materializes `Show.occupiedSeats`, marks the Booking paid and invalidates caches.
8. Cancel only applies to unpaid bookings: it deletes the reservations in a transaction, then deletes the Redis holds/caches.

## Cache invalidation

| Mutation | Keys deleted |
|---|---|
| Add/import show/movie | movie list, now-playing, cinema list, related movie/showtimes |
| Create booking | seat map by actual ID/alias and the movie's showtimes |
| Payment success | seat map and the movie's showtimes |
| Cancel booking | seat map and the movie's showtimes |

The cache service uses `SCAN` for pattern invalidation, never `KEYS`.

## Configuration and health

Copy `server/.env.example` to `server/.env`, then fill in `MONGODB_URI`, `REDIS_URL` and the provider keys. Do not commit `.env`; `.gitignore` already blocks every real `.env` file.

```powershell
cd server
npm install
npm run server
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Health returns `ok` when MongoDB and Redis are ready, `degraded` when MongoDB is ready but Redis is unavailable/disabled, and HTTP 503 when MongoDB is unavailable. Health never returns the connection string.

## Testing

```powershell
cd server
npm test
```

Unit tests always run. The unique-index integration test only runs against a disposable database:

```powershell
$env:ALLOW_INTEGRATION_TESTS='true'
$env:TEST_MONGODB_URI='mongodb://127.0.0.1:27017/nitrocine_test?replicaSet=rs0'
npm test
```

To fire many concurrent requests at a test API/show (this script creates real data), set `CONCURRENCY_BASE_URL`, `CONCURRENCY_SHOW_ID`, `CONCURRENCY_AUTH_TOKEN`, optionally `CONCURRENCY_SEAT`/`CONCURRENCY_ATTEMPTS`, then confirm explicitly:

```powershell
$env:CONCURRENCY_TEST_CONFIRM='I_UNDERSTAND'
npm run test:concurrency
```

Expect exactly one response with a `bookingId`; the remaining requests return 409.

## Deploying the index

Mongoose creates the critical unique index from the schema when auto-index is enabled. In production with auto-index disabled, create it manually:

```javascript
db.seatreservations.createIndex({ show: 1, seat: 1 }, { unique: true })
```

Do not create the index before cleaning up existing duplicate seat reservations; MongoDB will refuse to build the index rather than choose which records to delete. The show catalog only uses non-unique compound indexes to stay compatible with older data.
