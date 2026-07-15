# BRIEFING — 2026-07-15T23:08:30+07:00

## Mission
Implement Milestones 2, 3, 4, and 5 of the Weekly Movie Catalog project to introduce weekly rotation, deterministic slotting, background refreshes, and API optimizations.

## 🔒 My Identity
- Archetype: implementer/qa/specialist
- Roles: implementer, qa, specialist
- Working directory: e:\NitroCine\.agents\worker_catalog_services\
- Original parent: 10615d74-a210-4f04-a49c-2829b7b9130f
- Milestone: Milestones 2-5

## 🔒 Key Constraints
- CODE_ONLY network mode: No external HTTP calls or searches using curl/wget.
- Write only to our own directory `e:\NitroCine\.agents\worker_catalog_services\` for agent metadata.
- Avoid modifying unrelated booking, payment, auth, or seat logic.
- Reuse existing files and abstractions; do not create duplicate helpers, controllers, hooks, or routes.
- Remove temporary scripts and generated diagnostics before completion.

## Current Parent
- Conversation ID: 10615d74-a210-4f04-a49c-2829b7b9130f
- Updated: not yet

## Task Summary
- **What to build**: Shared catalog refresh service (seeding/permutation, timezone ISO week/slot keys, build weekly catalog buckets, detail validation and retry, atomic activation using Redis locks, rotation slot function, public payload formatting), CLI Seeder, Inngest schedules, and route updates to use precomputed weekly catalog instead of live TMDB requests.
- **Success criteria**: All backend components integrated and unit/integration tests passing.
- **Interface contracts**: server/services/catalogRefreshService.js, server/scripts/seed.js, server/inngest/index.js, server/services/homeNowShowingService.js, server/services/heroService.js, server/controllers/showController.js.
- **Code layout**: Source in `server/`, tests in `server/tests/`.

## Key Decisions Made
- Implemented `catalogRefreshService.js` with full deterministic slotting based on Asia/Ho_Chi_Minh timezone, seeded random permutation, details validation, backfill, lock safety, and caching.
- Created CLI seeder `scripts/seed.js` with dry-run support, returning proper exit codes.
- Replaced daily trending import cron with weekly catalog refresh and daily slot rotation jobs in Inngest.
- Updated Home Hero and Now Showing services/controllers to use precomputed weekly catalog instead of live TMDB calls.
- Added comprehensive unit and integration tests under `server/tests/catalogRefresh.test.js`.

## Change Tracker
- **Files modified**:
  - `server/services/catalogRefreshService.js` — Implement shared catalog refresh service.
  - `server/scripts/seed.js` — Implement CLI seeder for catalog refresh.
  - `server/package.json` — Add `seed:catalog` npm script.
  - `server/inngest/index.js` — Update Inngest schedules to support weekly refresh and slot rotations.
  - `server/services/homeNowShowingService.js` — Use weekly catalog.
  - `server/services/heroService.js` — Use weekly catalog.
  - `server/controllers/showController.js` — Use weekly catalog.
  - `server/tests/catalogRefresh.test.js` — Add new test suite.
- **Build status**: pass
- **Pending issues**: [None]

## Quality Status
- **Build/test result**: pass (46/46 tests passed successfully)
- **Lint status**: zero style/lint violations detected
- **Tests added/modified**: `server/tests/catalogRefresh.test.js` (5 unit/integration tests added)

## Loaded Skills
- **Source**: e:\NitroCine\.agents\skills\hero-runtime-debug\SKILL.md
  - **Local copy**: e:\NitroCine\.agents\worker_catalog_services\skills\hero-runtime-debug\SKILL.md
  - **Core methodology**: Debug Home Hero playback/poster failures, inspect active movie fields and API responses.
- **Source**: e:\NitroCine\.agents\skills\verify-change\SKILL.md
  - **Local copy**: e:\NitroCine\.agents\worker_catalog_services\skills\verify-change\SKILL.md
  - **Core methodology**: Review completed repository changes before merge, check tests, run lint and build.

## Artifact Index
- e:\NitroCine\.agents\worker_catalog_services\ORIGINAL_REQUEST.md — Original request details.
