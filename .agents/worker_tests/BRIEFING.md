# BRIEFING — 2026-07-15T15:12:35Z

## Mission
Add or rewrite invariant tests in client/e2e/hero-native-only.spec.js that fail on the current regression in the codebase.

## 🔒 My Identity
- Archetype: Worker Tests
- Roles: implementer, qa, specialist
- Working directory: e:\NitroCine\.agents\worker_tests
- Original parent: 9f88cabf-25d2-421d-9c70-870f33e0309c
- Milestone: Add / Rewrite Invariant E2E Tests

## 🔒 Key Constraints
- CODE_ONLY network mode: No external website access. No external curl, wget, etc.
- No cheating, no dummy/facade implementations.
- Write only to our folder e:\NitroCine\.agents\worker_tests for agent metadata, read any folder.
- Run Playwright tests and confirm failures on current HEAD.

## Current Parent
- Conversation ID: 9f88cabf-25d2-421d-9c70-870f33e0309c
- Updated: not yet

## Task Summary
- **What to build**: Invariant E2E Playwright tests.
- **Success criteria**:
  - `import { Buffer } from 'node:buffer';` added at the top.
  - Fix mock response for `**/api/show/hero` at line 38-44 to return `{ success: true, movies }`.
  - Assert Hero creates YouTube iframe or requests YouTube/TMDB videos.
  - Assert native server order is preserved.
  - Assert automatic playback is NOT unmuted (remains muted) after reveal. Test must fail on current HEAD.
  - Assert inactive movie metadata/video is NOT prefetched. Test must fail on current HEAD.
- **Interface contracts**: client/e2e/hero-native-only.spec.js
- **Code layout**: E2E tests in client/e2e/

## Change Tracker
- **Files modified**: client/e2e/hero-native-only.spec.js - Added Buffer import, fixed api/show/hero mock schema, added sound preference unmute & prefetch tests, and emulated system features.
- **Build status**: Lint checks PASSED. E2E tests executed successfully, producing target invariant failures.
- **Pending issues**: None.

## Quality Status
- **Build/test result**: Pass (Lint passed, E2E failures matching regression verified)
- **Lint status**: 0 warnings, 0 errors
- **Tests added/modified**:
  - `Automatic playback remains muted even when sound preference is set to on`
  - `Inactive movie metadata or video is NOT prefetched`
  - Fixed `/api/show/hero` mock payload structure to pass validation.

## Loaded Skills
- **Source**: e:\NitroCine\.agents\skills\hero-runtime-debug\SKILL.md
  - **Local copy**: e:\NitroCine\.agents\worker_tests\hero-runtime-debug_SKILL.md
  - **Core methodology**: Debug Home Hero playback/media delivery.
- **Source**: e:\NitroCine\.agents\skills\verify-change\SKILL.md
  - **Local copy**: e:\NitroCine\.agents\worker_tests\verify-change_SKILL.md
  - **Core methodology**: Review repo changes before merge.

## Key Decisions Made
- Added network mocks for image loading inside `setupHeroTest` so that the client's `validateMovieCandidates` function successfully validates mock movies instead of falling back to default TMDb movies.
- Emulated `reducedMotion: 'no-preference'` and mocked `navigator.connection.saveData = false` to guarantee identical E2E behavior on all test runner environments.
- Reordered route registration in `Inactive movie metadata or video is NOT prefetched` to ensure test-specific prefetch routes override the generic routes registered in `setupHeroTest` (matching Playwright's reverse-order routing precedence).

## Artifact Index
- e:\NitroCine\.agents\worker_tests\handoff.md — Handoff report for task completion verification.
- client/e2e/hero-native-only.spec.js — Modified E2E test file containing updated and added invariant tests.
