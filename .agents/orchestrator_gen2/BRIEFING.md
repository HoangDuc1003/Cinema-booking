# BRIEFING — 2026-07-15T23:12:00+07:00

## Mission
Precompute weekly movie catalog pool (150 unique movies), implement twice-daily rotation and instant Home entry.

## 🔒 My Identity
- Archetype: orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: e:\NitroCine\.agents\orchestrator_gen2
- Original parent: main agent
- Original parent conversation ID: 4166a654-4e3f-4358-9514-3ebadf5d087f

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: e:\NitroCine\PROJECT.md
1. **Decompose**: Split work into milestones (schemas, service logic, CLI, Inngest schedules, endpoints/caching, client loaders, and testing).
2. **Dispatch & Execute**:
   - **Delegate**: Spawn explorer (for investigation/baseline), worker (to write failing tests, implement server/client logic), reviewer (for code/test reviews), challenger (for verification), and auditor (for integrity).
3. **On failure**:
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: Spawn successor if spawn count >= 16.
- **Work items**:
  1. Baseline Investigation [done]
  2. Database Models and Config [done]
  3. Shared Catalog Refresh Service [done]
  4. CLI Seeder [done]
  5. Inngest Jobs Integration [done]
  6. Endpoint Refactoring & Redis Cache [done]
  7. Admin Catalog Refresh Endpoint & UI Button [pending]
  8. Smart Home Entry (replace fixed 3s wait) [pending]
  9. Final Project Cleanup & Optimization [pending]
  10. Client & E2E Testing (verify performance) [in-progress]
  11. Full Project Build & Verification [pending]
- **Current phase**: 1
- **Current focus**: Baseline Investigation

## 🔒 Key Constraints
- NEVER write, modify, or create source code files directly.
- NEVER run build/test commands yourself — require workers to do so.
- Do not clear the Movie collection or delete historical Movie documents.
- Keep exactly 150 unique movies in the active batch.
- Rotations at 08:00 and 20:00 Asia/Ho_Chi_Minh.
- New batch on Mondays at 03:00 Asia/Ho_Chi_Minh.
- Home page renders immediately without HomeBootLoader.

## Current Parent
- Conversation ID: 4166a654-4e3f-4358-9514-3ebadf5d087f
- Updated: not yet

## Key Decisions Made
- Setup of Generation 2 orchestrator directory and initial plan structure.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| Database Schema Implementer | teamwork_preview_worker | Implement CatalogBatch & SiteConfig updates | completed | 3abbcaa8-8ee8-4de8-9f4e-3a14c449a5d5 |
| Backend Logic & Cron Services Developer | teamwork_preview_worker | Implement catalog refresh service, CLI seeder, Inngest crons, endpoints, unit tests | completed | 0734c340-0d92-4e00-b5db-f94fda0daa15 |
| Frontend Loader & Test Refactoring Developer | teamwork_preview_worker | Remove HomeBootLoader, update client App, pages, delete files, update E2E tests | in-progress | 43b2f1cf-3005-429a-a8f0-5492cb3905d8 |

## Succession Status
- Succession required: no
- Spawn count: 3 / 16
- Pending subagents: 43b2f1cf-3005-429a-a8f0-5492cb3905d8
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: 10615d74-a210-4f04-a49c-2829b7b9130f/task-86
- Safety timer: none
- On succession: kill all timers before spawning successor
- On context truncation: run `manage_task(Action="list")` — re-create if missing

## Artifact Index
- e:\NitroCine\.agents\orchestrator_gen2\plan.md — Orchestrator plan
- e:\NitroCine\.agents\orchestrator_gen2\progress.md — Progress heartbeat and status checkpoint
- e:\NitroCine\.agents\orchestrator_gen2\ORIGINAL_REQUEST.md — Verbatim follow-up request copy
