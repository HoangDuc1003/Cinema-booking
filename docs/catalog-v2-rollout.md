# Catalog v2 rollout and rollback

Catalog v2 requires MongoDB replica-set/Atlas transactions, Redis, Inngest, and a valid TMDB token. Never run migration or seed commands against an unverified URI.

## Preflight

1. Keep weekly and rotation cron disabled.
2. Confirm the target MongoDB deployment is a replica set or Atlas cluster.
3. Confirm Redis lease acquisition and renewal are healthy.
4. Set `MONGODB_URI` to the intended environment and verify `/api/health` before any mutation.
5. For tests, set `ALLOW_INTEGRATION_TESTS=true` and use a disposable `TEST_MONGODB_URI` whose host/database clearly identifies it as local or test.

## Rollout

1. Deploy the compatible schema and read paths with catalog cron disabled.
2. Run `npm run migrate:catalog-v2` once as a deployment job with index privileges. The script is idempotent and fails on data conflicts, unsupported transactions, legacy index residue, or an invalid index shape.
3. Run `npm run seed:catalog -- --dry-run --run-id=<stable-id>`. A dry run may append audit/control-plane state, but must not mutate `CatalogBatch`, `Movie`, `SiteConfig`, or catalog payload caches.
4. On the disposable replica set, run `npm test` with integration tests enabled. Require the 150-ID, same-week versioning, transaction fault-injection, historical Movie/Show/Booking, and mocked-Favorite assertions to pass.
5. Run a real staging seed with `npm run seed:catalog -- --run-id=<stable-id>` and verify Home, Manual/Auto Hero, cache keys, native/poster behavior, and Admin polling.
6. Seed production manually during low traffic and repeat runtime verification.
7. Enable weekly refresh and 08:00/20:00 rotation only after every prior gate passes.

## Rollback

1. Disable catalog cron and Admin refresh event delivery.
2. Identify a verified retained batch with status `retired`.
3. Run `npm run rollback:catalog -- --batch-id=<catalog-batch-object-id>` using the production deployment job. The script acquires a new fenced lease and switches the active batch and `SiteConfig` pointer in one transaction.
4. Verify the previous batch/slot payload and Home facade are warm.
5. Do not delete `Movie` documents, restore the entire database, or remove Show/Booking/Favorite history as part of catalog rollback.
