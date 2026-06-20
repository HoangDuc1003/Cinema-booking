---
name: test-and-regression
description: Plan and run NitroCine unit, integration, concurrency, API, lint, build, and regression checks. Use when adding tests, simulating simultaneous bookings, verifying Redis behavior, preparing a release, or assessing whether a change is safe.
---

# Test and Prevent Regressions

1. Derive tests from invariants and changed behavior, not implementation details.
2. Prefer deterministic unit tests for key builders, TTLs, seat normalization, pricing, and set operations.
3. Use integration tests for Mongo transactions, unique indexes, Redis locks, cache invalidation, and webhooks.
4. Launch concurrent booking attempts with a barrier so they contend at the same time; assert exactly one winner for the same seat.
5. Also test disjoint seats, expired holds, cancellation, duplicate callbacks, Redis-down fallback, and malformed input.
6. Isolate test databases and prefixes; never point destructive tests at production.
7. Run server tests and syntax checks, then client lint/build, then skill validation and a tracked-secret scan.
8. Report commands, pass/fail counts, skipped external tests, prerequisites, and remaining gaps honestly.

Keep simulations parameterized by environment variables and require an explicit opt-in before hitting a real API.
