# Project: NitroCine Native Hero Repair
# Scope: Global Project Specification

## Architecture
- `client/`: React / Vite frontend (`HeroSection.jsx`, `NativeTrailerSection.jsx`, `HeroContent.jsx`, `HeroSettings.jsx`, `apiClient.js`, `heroTrailerMode.js`).
- `server/`: Express / MongoDB / Redis backend (`heroService.js`, `heroRotationService.js`, `showController.js`, `adminController.js`, `redisKeys.js`).
- Shared API configuration module at `client/src/lib/apiClient.js` consuming `VITE_BASE_URL`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Baseline Inspection & Test Suite Baseline | Inspect git state, package scripts, run baseline tests | M0 | ORIGINAL_REQUEST §4 |
| 2 | Unified API Client | Shared `apiClient.js` reading `VITE_BASE_URL`, normalizing URL, export helpers | M1 | ORIGINAL_REQUEST §14 |
| 3 | Authoritative Manual Mode Backend | `getPublicHomeHero()` loads manual mode payload with exact 5 movies & native metadata | M2 | ORIGINAL_REQUEST §5 |
| 4 | Manual Activation Validation | `updateHomeHero` requires 5 distinct native-ready movies (`heroVideoStatus === 'ready'`), return HTTP 422 if invalid | M2 | ORIGINAL_REQUEST §5.3 |
| 5 | Backend Identity & ETag | Expose safe `meta` (`buildSha`, `environment`, `deploymentId`) and update ETag logic | M2 | ORIGINAL_REQUEST §5.6, §6 |
| 6 | Admin UI Contracts & Sections | Admin UI exposes separate "Currently live on Home" vs "Manual selection", handles HTTP 422 validation | M3 | ORIGINAL_REQUEST §6, §7 |
| 7 | Exact Manual Order Preservation | `HeroSection.jsx` bypasses per-viewer daily shuffle when effective mode is manual | M3 | ORIGINAL_REQUEST §8 |
| 8 | Remove Legacy YouTube on Home | Remove `TrailerSection` from Home execution path, zero YouTube/TMDB requests on Home | M4 | ORIGINAL_REQUEST §9 |
| 9 | NativeTrailerSection Security | `resolveNativeTrailerSource()` strictly requires server-verified Hero video source | M4 | ORIGINAL_REQUEST §10 |
| 10 | Feature Flag `VITE_HERO_TRAILER_MODE` | Support native (default), section, hybrid via canonical `getHeroTrailerMode()` | M4 | ORIGINAL_REQUEST §11 |
| 11 | Native Playback Retry State Machine | Retry button resets error, increments `videoGeneration`, calls `load()`/`play()` without scroll | M5 | ORIGINAL_REQUEST §12 |
| 12 | Carousel & Playback Invariants | Single video element, wrap from final movie to first, stable `currentTime` advancement | M5 | ORIGINAL_REQUEST §13 |
| 13 | Backend Integration Tests | Unit & integration tests for manual mode, 422 validation, cache/ETag, admin contract | M6 | ORIGINAL_REQUEST §15 |
| 14 | Frontend Unit / Component Tests | Component tests for Admin initialization, manual order, retry labels, feature flag modes | M6 | ORIGINAL_REQUEST §16 |
| 15 | Automated Playwright E2E | Real E2E sync, native playback, retry flow without scroll, zero YouTube request interception | M6 | ORIGINAL_REQUEST §17 |
| 16 | Static Integrity & Build Verification | Ripgrep check for zero YouTube on Home, build client & server, produce final handoff report | M6 | ORIGINAL_REQUEST §18-§22 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | Baseline Survey | Git state, environment, repository search, baseline test execution | None | DONE |
| M1 | Unified API Client | `client/src/lib/apiClient.js` refactoring across frontend callers | M0 | DONE |
| M2 | Authoritative Manual Backend | `heroService.js`, `adminController.js`, `showController.js`, validation, Redis/ETag | M1 | DONE |
| M3 | Admin UI & Order Preservation | `HeroSettings.jsx` data model & sections, `HeroSection.jsx` daily shuffle bypass | M2 | DONE |
| M4 | Home Native Trailer & Flag | Remove YouTube `TrailerSection` from Home, `NativeTrailerSection` security, `heroTrailerMode.js` | M3 | DONE |
| M5 | Native Retry State Machine | `HeroSection.jsx`, `HeroContent.jsx`, `videoGeneration`, carousel wrap | M4 | DONE |
| M6 | Comprehensive Testing & E2E | Backend tests, frontend component tests, Playwright E2E suite, static check & build | M5 | IN_PROGRESS |

## Code Layout
- `client/src/lib/apiClient.js`: Shared API client instance & URL builder
- `client/src/components/hero/heroTrailerMode.js`: Canonical feature flag resolver
- `client/src/components/HeroSection.jsx`: Home Hero container & mode-based rendering
- `client/src/components/hero/HeroContent.jsx`: Hero overlay buttons & retry action state
- `client/src/components/NativeTrailerSection.jsx`: Native trailer playback section
- `client/src/pages/admin/HeroSettings.jsx`: Admin Hero configuration view
- `server/services/heroService.js`: Hero payload construction & manual selection logic
- `server/controllers/adminController.js`: Admin Hero update & status endpoints
- `server/controllers/showController.js`: Public Hero endpoint & ETag validation
