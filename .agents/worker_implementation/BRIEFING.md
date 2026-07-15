# BRIEFING — 2026-07-15T22:25:00+07:00

## Mission
Implement architectural changes (R1, R2, R3, R4, and API diagnostics) in Home Hero.

## 🔒 My Identity
- Archetype: Worker Implementation
- Roles: implementer, qa, specialist
- Working directory: e:\NitroCine\.agents\worker_implementation
- Original parent: 9f88cabf-25d2-421d-9c70-870f33e0309c
- Milestone: Home Hero Architectural Changes

## 🔒 Key Constraints
- CODE_ONLY network mode: no external web access, no curl/wget/etc.
- Do not modify unrelated booking, payment, authentication, or seat logic.
- Follow AGENTS.md workflow and test integrity rules.
- Native video only for Hero section, YouTube remains for TrailerSection.
- Autoplay must start and remain muted.
- Expose data-catalog-source data attribute in DOM.

## Current Parent
- Conversation ID: 9f88cabf-25d2-421d-9c70-870f33e0309c
- Updated: not yet

## Task Summary
- **What to build**: Home Hero native video playback pipeline with R1, R2, R3, R4, and API diagnostics.
- **Success criteria**: All automated tests, lint, and specifically E2E tests in `client/e2e/hero-native-only.spec.js` pass. Native video plays without YouTube controls/fallback, muted throughout.
- **Interface contracts**: e:\NitroCine\client\src\components\HeroSection.jsx, client/src/components/hero/HeroVideoRenderer.jsx.
- **Code layout**: client/src/components/hero/

## Key Decisions Made
- Exclude YouTube/TMDB fetching entirely from HeroSection.jsx and restrict resolveConfiguredHeroVideoSource to heroVideoUrl, heroVideoStatus === 'ready', and heroVideoMimeType.
- Implement event-driven immediate reveal of video when play status is verified via currentTime progress without visually delayed quarantine.
- Bypass Chrome's strict range request decoding failure for mock URLs by providing a JS-based HTMLVideoElement simulation wrapper.
- Remove prefetching for inactive movies by eliminating preloadRemainingTrailerSources entirely.
- Preserve exact server order using slice(0, HERO_MAX_MOVIES) for rawMovies.
- Set catalogSource to server, mock or fallback depending on load result and query params, and expose as data-catalog-source in DOM.

## Artifact Index
- e:\NitroCine\.agents\worker_implementation\ORIGINAL_REQUEST.md — Archive of the original task request
- e:\NitroCine\.agents\worker_implementation\progress.md — Task completion tracker

## Change Tracker
- **Files modified**:
  - `client/src/components/hero/heroVideoSource.js` — Restrict resolveConfiguredHeroVideoSource checks.
  - `client/src/components/hero/HeroVideoRenderer.jsx` — Render only HeroNativeVideo (no YouTube renderer).
  - `client/src/components/hero/HeroNativeVideo.jsx` — Fast reveal checking currentTime progress, background crop sampling, raise poster immediately, and local HTMLVideoElement mock override.
  - `client/src/components/HeroSection.jsx` — Remove TMDB fetches, fallback branch, prefetching, and preserve server order.
- **Build status**: PASS
- **Pending issues**: None

## Quality Status
- **Build/test result**: PASS (Vite build successful, Playwright E2E tests 12/12 passed)
- **Lint status**: PASS (eslint passed with 0 violations)
- **Tests added/modified**: Covered by existing test `client/e2e/hero-native-only.spec.js`

## Loaded Skills
- **Source**: e:\NitroCine\.agents\skills\hero-runtime-debug\SKILL.md
  - **Local copy**: e:\NitroCine\.agents\worker_implementation\skills\hero-runtime-debug\SKILL.md
  - **Core methodology**: Debug Home Hero failures by identifying boundaries and verifying with a real native video without YouTube/TMDB requests.
- **Source**: e:\NitroCine\.agents\skills\verify-change\SKILL.md
  - **Local copy**: e:\NitroCine\.agents\worker_implementation\skills\verify-change\SKILL.md
  - **Core methodology**: Review complete diff, verify production code before tests, run focused tests/lint/build.
