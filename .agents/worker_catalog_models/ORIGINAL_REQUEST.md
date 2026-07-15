## 2026-07-15T16:06:13Z
You are teamwork_preview_worker.
Your working directory is: e:\NitroCine\.agents\worker_catalog_models\
Your task is to implement the following database schema changes for Milestone 1 of the Weekly Movie Catalog project:

1. Create a new model at `server/models/CatalogBatch.js` with the schema contract:
{
  weekKey: String,              // unique weekKey index
  status: "staging" | "active" | "retired" | "failed", // index status
  buckets: {
    newest: [String],           // exactly 50 unique movie IDs
    classics: [String],         // exactly 50 unique movie IDs
    popular: [String]           // exactly 50 unique movie IDs
  },
  movieIds: [String],           // exactly 150 globally unique IDs
  generatedAt: Date,
  validatedAt: Date,
  activatedAt: Date,            // index activatedAt
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
Make sure to include indexes for unique weekKey, status, and activatedAt.

2. Update `server/models/SiteConfig.js` to include the following fields under `catalog`:
- `catalog.activeBatchId`: ObjectId (ref: 'CatalogBatch')
- `catalog.refreshing`: Boolean
- `catalog.activeSlot`: Number
- `catalog.lastRotationAt`: Date
- `catalog.lastSuccessfulRefreshAt`: Date

Once done, run the existing server unit tests (`npm test` in the `server` directory) to verify that everything still compiles and imports correctly. Save a progress report in your working directory and notify me.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
