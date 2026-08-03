# Progress Tracker: NitroCine Native Hero Repair

## Current Status
Last visited: 2026-08-03T12:40:00Z

## Iteration Status
Current iteration: 0 / 32

## Checklist
- [x] M0: Baseline Survey & Baseline Test Suite Run
  - [x] Explore codebase baseline (git status, commit SHA, node/npm versions)
  - [x] Search repository for YouTube references, API client calls, manual mode references
  - [x] Run baseline test suite and document baseline failures
- [x] M1: Unified API Client Configuration (`client/src/lib/apiClient.js`)
  - [x] Implement `client/src/lib/apiClient.js` normalization & exports
  - [x] Refactor callers (`tmdb.js`, `AppContext.jsx`, Admin, Hero)
  - [x] Verify zero hardcoded backend URLs
- [x] M2: Backend Authoritative Manual Mode & Validation
  - [x] Refactor `getPublicHomeHero()` in `heroService.js`
  - [x] Implement 5-movie native validation (`validateNativeHeroMovie()`, HTTP 422)
  - [x] Update atomic persistence, Redis cache invalidation, ETag calculation
  - [x] Expose safe backend identity (`buildSha`, `environment`, `deploymentId`)
- [x] M3: Admin UI & Exact Manual Order Preservation
  - [x] Update `HeroSettings.jsx` data mapping & sections
  - [x] Handle HTTP 422 manual activation errors in Admin UI
  - [x] Update `HeroSection.jsx` to bypass daily shuffle in manual mode
- [x] M4: Zero YouTube on Home, NativeTrailerSection Security & Feature Flag
  - [x] Remove legacy `TrailerSection` execution path from `Home.jsx`
  - [x] Secure `NativeTrailerSection.jsx` to require verified canonical sources
  - [x] Implement `heroTrailerMode.js` with default `native`
- [x] M5: Native Retry State Machine & Carousel Invariants
  - [x] Implement retry state machine using `videoGeneration` in `HeroSection.jsx` & `HeroContent.jsx`
  - [x] Verify retry resets error state, calls `load()`/`play()` without scrolling or changing index
  - [x] Verify single active `<video>` element and carousel wrap from last movie to first
- [ ] M6: Automated E2E, Comprehensive Testing & Final Verification
  - [ ] Write backend unit & integration tests
  - [ ] Write frontend component unit tests
  - [ ] Write/run Playwright E2E test scenarios
  - [ ] Run static integrity checks (zero YouTube on Home, no obsolete strings)
  - [ ] Run production build and verify passes
  - [ ] Produce final handoff report `e:/NitroCine/.agents/orchestrator/handoff.md`

## Subagent Log
| ID | Role | Task | Status | Output Path |
|----|------|------|--------|-------------|
| 80b67242-39e3-47a4-a16d-e9c313531ef6 | Baseline Code Explorer | Code & doc inspection, ripgrep searches | completed | e:/NitroCine/.agents/explorer_m0_1/handoff.md |
| 07271dc5-bdd4-43a4-ba88-d93f33bc1749 | Baseline Test Worker | Env info & baseline test suite run | completed | e:/NitroCine/.agents/worker_m0_2/handoff.md |
| 397c6513-f252-4719-8949-305a5393df9d | API Client Explorer | API client & call site analysis | completed | e:/NitroCine/.agents/explorer_m1_1/handoff.md |
| bceee8f0-6d0b-41bb-b889-479d863b1c87 | API Client Worker | Unified API client implementation | completed | e:/NitroCine/.agents/worker_m1/handoff.md |
| 907bf247-684f-4af2-8314-3d2be8047620 | API Client Reviewer | Milestone 1 review & quality check | completed | e:/NitroCine/.agents/reviewer_m1_1/handoff.md |
| 9987c8c9-2958-4ceb-bf8c-18f2964ca058 | Backend Hero Explorer | Backend manual mode & validation analysis | completed | e:/NitroCine/.agents/explorer_m2_1/handoff.md |
| 241e9d3a-916a-4ca3-a77f-613f7f9588a8 | Backend Hero Worker | Backend manual mode & validation implementation | completed | e:/NitroCine/.agents/worker_m2/handoff.md |
| 92685ec8-bf03-4d71-81dd-449dd9286195 | Backend Hero Reviewer | Milestone 2 review & quality check | completed | e:/NitroCine/.agents/reviewer_m2_1/handoff.md |
| 3071fa4c-93c3-4dba-8070-a7b65de3eb8a | Admin & Order Explorer | Admin UI mapping & daily shuffle bypass analysis | completed | e:/NitroCine/.agents/explorer_m3_1/handoff.md |
| 78f84b8e-6fcf-4e14-b82c-600c883d509c | Admin & Order Worker | Admin UI & shuffle bypass implementation | completed | e:/NitroCine/.agents/worker_m3/handoff.md |
| 981607d6-ee22-40c4-bd12-c07ea4a98430 | Admin & Order Reviewer | Milestone 3 review & quality check | completed | e:/NitroCine/.agents/reviewer_m3_1/handoff.md |
| 548ef8f1-cbf2-4ae9-9f28-652f32985aa0 | Home & Security Explorer | Zero YouTube on Home & trailer mode analysis | failed | e:/NitroCine/.agents/explorer_m4_1/handoff.md |
| 733725b0-fa10-4295-848b-735e127ec4ce | Home & Security Explorer | Zero YouTube on Home & trailer mode analysis | completed | e:/NitroCine/.agents/explorer_m4_2/handoff.md |
| 8482e299-98cf-4e53-9864-2d96fa04540a | Home & Security Worker | Zero YouTube on Home & trailer mode implementation | completed | e:/NitroCine/.agents/worker_m4/handoff.md |
| 05331ff8-9409-4870-b7f8-d6ed694914c8 | Home & Security Reviewer | Milestone 4 review & quality check | completed | e:/NitroCine/.agents/reviewer_m4_1/handoff.md |
| 7b4f8609-959e-460b-b744-6d3ead513ccf | Retry & Playback Explorer | Native retry state machine & carousel analysis | completed | e:/NitroCine/.agents/explorer_m5_1/handoff.md |
| 66da2af4-43f4-4c3e-ab91-40540993f7ce | Retry & Playback Worker | Native retry & carousel implementation | completed | e:/NitroCine/.agents/worker_m5/handoff.md |
| a61b5d03-7b98-4613-a475-46649278fdf2 | Retry & Playback Reviewer | Milestone 5 review & quality check | completed | e:/NitroCine/.agents/reviewer_m5_1/handoff.md |
| ffaea3cc-508c-4777-be92-a737382ee6df | Testing & E2E Worker | Playwright E2E & final test verification | running | e:/NitroCine/.agents/worker_m6/handoff.md |
| 9d817818-eaea-4f22-a057-498c1acbd975 | Forensic Auditor | Forensic integrity audit | running | e:/NitroCine/.agents/auditor_m6/handoff.md |
