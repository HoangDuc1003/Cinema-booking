---
name: booking-concurrency
description: Design, implement, and test race-safe NitroCine seat booking, expiring holds, payment confirmation, cancellation, and callback idempotency. Use for double-booking bugs, concurrency changes, seat inventory modeling, or booking/payment transaction reviews.
---

# Harden Booking Concurrency

Maintain this invariant: at most one active reservation exists for a `(show, seat)` pair.

1. Normalize and validate seat IDs; reject duplicates and cap seats per booking.
2. Calculate price on the server from the show and seat class.
3. Resolve virtual shows before forming the final lock key.
4. Acquire a short show-level Redis lock to reduce contention.
5. Within a MongoDB transaction, remove reclaimable expired holds, insert unique seat reservations, and create the booking.
6. Map duplicate-key errors to HTTP 409. Keep the unique compound index as the final guard.
7. Store an explicit hold expiry. Do not let unpaid bookings hold inventory indefinitely.
8. On payment, idempotently mark the booking paid, confirm reservations, and materialize paid occupancy in the show.
9. On cancellation, atomically delete held reservations and the unpaid booking.
10. Invalidate the seat map and affected show caches only after a committed mutation.

Exercise identical-seat races, disjoint-seat concurrency, expired hold reuse, duplicate webhook delivery, cancellation, and Redis unavailability. MongoDB transactions require a replica set or Atlas; report this prerequisite clearly.
