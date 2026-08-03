# Execution Plan: NitroCine Native Hero Repair

## Overview
Decomposed into 7 sequential/parallel milestones (M0 through M6).
Each milestone will be executed using the Explorer -> Worker -> Reviewer -> Gate cycle or Sub-orchestration.

## Milestones & Execution Plan

### Milestone 0: Baseline Survey & Environment Inspection
- **Objective**: Inspect git state, commit SHA, package scripts, Node/npm environment, and run initial search & baseline test commands per ORIGINAL_REQUEST §4.
- **Workers**: Dispatch 2 `teamwork_preview_explorer` subagents to run baseline inspection, search for YouTube usages, API client usages, manual mode references, and run existing test suite.

### Milestone 1: Unified API Client Configuration
- **Objective**: Refactor `client/src/lib/apiClient.js` and all callers (`tmdb.js`, `AppContext.jsx`, Admin, Hero) to use single normalized `VITE_BASE_URL` module. Ensure zero hardcoded backend URLs.
- **Execution**: Explorer -> Worker -> Reviewer -> Gate.

### Milestone 2: Backend Authoritative Manual Mode & Validation
- **Objective**: Refactor `server/services/heroService.js` so `getPublicHomeHero()` checks configured mode first and returns manual payload atomically. Implement 5-movie native validation (HTTP 422), Redis cache invalidation, ETag updates, safe backend identity.
- **Execution**: Explorer -> Worker -> Reviewer -> Gate.

### Milestone 3: Admin UI & Manual Order Preservation
- **Objective**: Update `HeroSettings.jsx` to show separate "Currently live on Home" vs "Manual selection" sections and handle validation errors. Update `HeroSection.jsx` to bypass daily shuffle when in manual mode.
- **Execution**: Explorer -> Worker -> Reviewer -> Gate.

### Milestone 4: Zero YouTube on Home, NativeTrailerSection Security & Feature Flag
- **Objective**: Remove legacy `TrailerSection` from `Home.jsx`. Implement security in `NativeTrailerSection.jsx` to strictly accept server-verified native sources. Implement `heroTrailerMode.js` with default `native`.
- **Execution**: Explorer -> Worker -> Reviewer -> Gate.

### Milestone 5: Native Playback Retry State Machine & Carousel Wrap
- **Objective**: Refactor `HeroSection.jsx` and `HeroContent.jsx` to reuse `videoGeneration` for retry resets. Ensure Retry trailer resets error, calls `load()`/`play()`, stays on current movie, zero scrolling. Ensure single active video element and carousel wrap from movie 4 to 0.
- **Execution**: Explorer -> Worker -> Reviewer -> Gate.

### Milestone 6: Verification, Testing, E2E & Static Integrity
- **Objective**: Write/update backend tests, frontend component tests, Playwright E2E scenarios (sync, native play, retry without scroll, zero YouTube request interception, missing native asset poster fallback). Perform static ripgrep check, production build, and produce final handoff report.
- **Execution**: Worker (tests) + Reviewer + Challenger + Auditor -> Gate -> Final Report.
