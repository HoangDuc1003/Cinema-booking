# Native Hero Media Pipeline

NitroCine now separates physical Hero media from movie catalog records. The Home
player remains unchanged: it consumes only `heroVideoStatus: ready` Cloudinary
MP4/WebM fields denormalized onto a movie after server-side verification.

## Lifecycle

`Movie catalog -> candidate selector -> MediaSourceResolver -> source policy ->
Inngest -> Cloudinary remote upload -> verification -> HeroMediaAsset registry ->
preparing Hero batch -> atomic activation`

`HeroMediaAsset` is the durable library. It records source type, a non-public
original URL, URL hash, rights approval, Cloudinary metadata, verification, and
structured failures. Its `(movieId, sourceIdentity)` unique index makes source
requests retry-safe. Existing ready assets are reused; a 48-hour evaluation does
not re-upload unchanged media.

The server accepts only an administrator-confirmed public HTTPS direct source
with `AUTHORIZED`, `USER_OWNED`, or `LICENSED` rights. URLs with embedded
credentials, local hosts, and private IP literals are rejected. `UNKNOWN`,
`REJECTED`, and `YOUTUBE_REFERENCE_ONLY` entries remain
`NEEDS_AUTHORIZED_SOURCE` and never reach Cloudinary ingestion.

Direct remote ingestion is disabled until
`HERO_MEDIA_AUTHORIZED_SOURCE_HOSTS` contains the exact authorized CDN hostnames.
Before Cloudinary receives a URL, the server resolves and pins the public host,
rejects non-global network answers, and revalidates every redirect hop against
the same host allowlist. Configure Cloudinary's allowed-fetch domains with the
same hostnames as a second control.

The original URL is `select: false` and is not returned by admin APIs.

## Events

- `hero/media.requested` records an approved source and schedules ingestion.
- `hero/media.ingest` asks Cloudinary to fetch the remote URL directly; NitroCine
  never buffers the video in Vercel.
- `hero/media.verify` verifies container, codec, dimensions, duration, size,
  Cloudinary host, and movie binding before a movie becomes ready.
- `hero/pool.reconcile` computes 5 newest, 5 hot, and 5 discovery readiness and
  atomically swaps batches only at 15/15.

`HERO_POOL_CANDIDATE_RESERVE` defaults to `2`, so acquisition evaluation records
the ranked 15 plus a small reserve rather than considering the entire catalog.

## Rotation safety

The 48-hour job creates a `preparing` batch. A degraded next batch leaves the
current `active` batch untouched and reports `NEXT_POOL_PREPARING`. On 15 unique
valid assets, it transitions through `ready_to_activate` and atomically retires
the old batch only after a transactional preflight succeeds.

## Deployment

Run the new database migration once after deploying the code:

```powershell
cd server
npm run migrate:hero-media-pipeline
```

The migration creates registry indexes and backfills valid legacy Cloudinary
assets as `CLOUDINARY_EXISTING`. It intentionally marks their rights as
`UNKNOWN` with a `requiresRightsAudit` provenance flag; it does not rehost them.

`HERO_ENABLE_LEGACY_CLOUDINARY_ENRICHMENT` is disabled by default. Enable it only
for a controlled migration audit; the normal production path uses the registry
and source policy.

## Remaining provider work

No licensed provider adapter is configured yet. The abstraction supports one,
but automatic acquisition currently begins only when an administrator supplies
an authorized direct native-media URL. YouTube IDs can be stored as reference
metadata but are never downloaded or converted.
