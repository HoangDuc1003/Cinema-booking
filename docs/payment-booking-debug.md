# Booking and Stripe payment recovery

## Why a booking can exist before Stripe checkout

NitroCine reserves inventory in MongoDB before calling Stripe. The booking transaction creates a pending `Booking` and one held `SeatReservation` per seat; Redis mirrors the hold with a TTL. This guarantees that a slow or unavailable payment provider cannot create double booking.

If Stripe session creation fails, the booking remains pending until `holdExpiresAt`. The API returns `retryPayment: true`, `bookingId`, and `/api/booking/pay-now`. The client moves the user to **My Bookings**; it must not call `/api/booking/create` again for the same seats.

## Production environment

Set these variables in the server deployment for Production, Preview when needed, and redeploy:

- `CLIENT_URL`: canonical frontend origin such as `https://nitrocine.vercel.app`; required in production and normalized without a trailing slash.
- `STRIPE_SECRET_KEY`: Stripe server secret used to create Checkout Sessions.
- `STRIPE_WEBHOOK_SECRET`: signing secret for `/api/webhooks/stripe`.
- `REDIS_URL`: Redis connection string for holds, locks, cache, and idempotency.
- `SEAT_HOLD_TTL_SECONDS`: defaults to 1860 seconds so Stripe's 30-minute minimum checkout expiry has a 60-second safety buffer.

Never put these values in client `VITE_*` variables or commit them to Git.

## Health check

```powershell
Invoke-RestMethod https://<server-domain>/api/health
```

The response exposes booleans only:

```json
{
  "dependencies": {
    "stripe": { "configured": true },
    "clientUrl": { "configured": true }
  }
}
```

## Retry behavior

- `POST /api/booking/create`: returns Stripe `url` on success. If payment setup/provider fails after the hold is committed, returns 400/502/503 plus retry metadata.
- `POST /api/booking/pay-now`: accepts `bookingId`, extends a valid DB hold, recreates missing Redis hold keys, and creates a new Checkout Session.
- `POST /api/booking/pay-all`: ignores expired bookings, extends active holds, and creates one Checkout Session with `bookingIds` metadata.
- A repeated create for the same seats and same user returns `EXISTING_PENDING_BOOKING` and `existingBookingId`; another user's hold remains a normal 409 conflict.

## Safe Vercel diagnosis

Open the server project in Vercel, select the failed function invocation, and inspect the structured entry beginning with `[Stripe session failed]`, `[Pay-now Stripe session failed]`, or `[Pay-all Stripe session failed]`. These logs contain booking IDs, amount, config-presence booleans, origin, Stripe error type/code/status/request ID, and message. They never contain Stripe, Redis, Clerk, MongoDB, token, or cookie secrets.

After changing environment variables, redeploy and verify `/api/health` before attempting a disposable test booking.

## Local checks

```powershell
cd server
npm test
npm run server

cd ../client
npm run dev
```

Use a Stripe test key and test card only. The MongoDB integration concurrency test remains opt-in through `ALLOW_INTEGRATION_TESTS=true` and a disposable `TEST_MONGODB_URI`.
