# Project: Restore NitroCine Hero Native-Only Architecture

## Architecture
- `client/src/components/HeroSection.jsx` is the top-level container for the Hero banner.
- `client/src/components/hero/` contains components like `HeroVideoRenderer`, `HeroNativeVideo`, `HeroYouTubeVideo`, `HeroMedia`, `HeroContent`, `HeroPosterRail`, and state management logic.
- Data Flow: Fetch movie list from `/api/show/hero` (or fallback). Resolve movie media using `loadHeroVideoSource` inside `HeroSection.jsx`. Pass resolved native media source to `HeroVideoRenderer`, which renders `HeroNativeVideo` or poster.
- Layout: React/Vite frontend using Tailwind/CSS classes, Express/MongoDB backend.

## Code Layout
- `client/src/components/HeroSection.jsx`
- `client/src/components/hero/`
- `client/e2e/` (Playwright E2E tests)

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Baseline Investigation | Inspect files, run baseline test/lint/build, root-cause report | None | DONE |
| 2 | Failing Invariant Tests | Write unit/E2E tests that fail on current HEAD to prove regression | M1 | DONE |
| 3 | Architectural Correction (R1-R4) | Remove YouTube, clean up delays, enforce mute, remove prefetch, preserve server order | M2 | DONE |
| 4 | Test Migration & Verification | Rewrite obsolete tests to native, pass focused unit & E2E tests | M3 | DONE |
| 5 | Full Build & Audit | Pass full build, lint, and run Forensic Auditor | M4 | DONE |

## Interface Contracts
- `/api/show/hero`: Returns array of movies, order must be preserved.
- `loadHeroVideoSource`: Resolves only configured native sources, returns null for non-native.
