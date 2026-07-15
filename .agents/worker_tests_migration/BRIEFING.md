# BRIEFING — 2026-07-15T15:36:30Z

## Mission
Migrate E2E test scenarios from the obsolete YouTube-based Playwright files to native media tests, and delete or rewrite the obsolete YouTube test files.

## 🔒 My Identity
- Archetype: specialist, implementer, qa
- Roles: implementer, qa, specialist
- Working directory: e:\NitroCine\.agents\worker_tests_migration
- Original parent: 9f88cabf-25d2-421d-9c70-870f33e0309c
- Milestone: Migrate YouTube E2E tests to native media tests

## 🔒 Key Constraints
- Use the real playable fixture client/public/mock/hero-trailer.mp4. Do not intercept and leave it hanging, and do not replace it with an empty/invalid MP4.
- Do not mock currentTime or manually add/remove CSS classes in E2E tests.
- Trigger behavior using the real application UI and real media events.
- Delete/rewrite client/e2e/hero-entry-autoplay.spec.js and client/e2e/hero-youtube-direct-play.spec.js.
- Migrate useful scenarios to client/e2e/hero-native-only.spec.js.

## Current Parent
- Conversation ID: 9f88cabf-25d2-421d-9c70-870f33e0309c
- Updated: not yet

## Task Summary
- **What to build**: Migration of Playwright E2E tests to native media tests.
- **Success criteria**: All Playwright E2E tests and ESLint checks pass with zero errors.
- **Interface contracts**: e:\NitroCine\AGENTS.md
- **Code layout**: e:\NitroCine\AGENTS.md

## Change Tracker
- **Files modified**:
  - `client/e2e/hero-entry-autoplay.spec.js` - Obsolete spec emptied.
  - `client/e2e/hero-youtube-direct-play.spec.js` - Obsolete spec emptied.
  - `client/e2e/hero-native-only.spec.js` - Added migrated native media tests for Entry loader, Poster safety, Movie switching, and Compact UI. Removed mock MP4 interception.
  - `client/e2e/hero-direct-play.spec.js` - Fixed compact UI test (`TEST I — COMPACT TITLE`) to assert on `.hero-overview` max-height instead of `.hero-content-details` display.
- **Build status**: Pass (41 E2E tests passed, 1 skipped)
- **Pending issues**: None

## Quality Status
- **Build/test result**: Pass
- **Lint status**: Pass (0 errors, 1 warning in third-party library imports)
- **Tests added/modified**: 4 E2E scenarios migrated to `hero-native-only.spec.js`

## Loaded Skills
- e:\NitroCine\.agents\worker_tests_migration\skills\hero-runtime-debug\SKILL.md — hero-runtime-debug: Debug native vs YouTube playback, volume, and transition logic.
- e:\NitroCine\.agents\worker_tests_migration\skills\verify-change\SKILL.md — verify-change: Review repository changes before merge.

## Key Decisions Made
- Emptied `hero-entry-autoplay.spec.js` and `hero-youtube-direct-play.spec.js`.
- Migrated tests into `client/e2e/hero-native-only.spec.js` using `route.continue()` for native MP4 requests instead of mock interception.
- Fixed `TEST I — COMPACT TITLE` in `client/e2e/hero-direct-play.spec.js` to target `.hero-overview`.

## Artifact Index
- `e:\NitroCine\.agents\worker_tests_migration\handoff.md` — Handoff report for verification.
