# Project: NitroCine Native Hero Rotation

## Architecture
- `client/src/components/HeroSection.jsx` is the top-level container for the Hero banner.
- `client/src/components/hero/` contains the native video renderer, poster/media components, ordered navigation, and state management logic.
- `server/models/HeroRotationBatch.js` owns the dedicated 15-movie Hero pool; it does not replace or shrink the 150-movie catalog.
- Data flow: the server selects and orders five native-ready movies from the active 15-movie batch. The client preserves that order and renders one native `<video>` or a poster fallback.
- Layout: React/Vite frontend using Tailwind/CSS classes, Express/MongoDB backend.

## Code Layout
- `client/src/components/HeroSection.jsx`
- `client/src/components/hero/`
- `client/e2e/` (Playwright E2E tests)

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Baseline Investigation | Inspect files, run baseline test/lint/build, reproduce API/DOM/media behavior | None | DONE |
| 2 | Server Rotation | Add the 15-movie batch, seeded selection, cache, scheduler, admin operations, and safe migration | M1 | DONE |
| 3 | Native Client | Remove YouTube from Hero; implement native playback, bounded failover, audio consent, and batch cache | M2 | DONE |
| 4 | Test Migration & Verification | Replace obsolete Hero tests and prove playback with advancing `currentTime` | M2, M3 | DONE |
| 5 | Production Activation | Upload and verify 15 distinct, licensed native trailers and activate the first valid batch | M2, M4 | BLOCKED ON ASSETS |

## Interface Contracts
- `/api/show/hero`: returns batch/version/schedule metadata and exactly five server-ordered movies when an active batch exists.
- Hero source resolution accepts only server-verified native MP4/WebM sources and returns `null` for YouTube, iframe, mock-production, or unsupported sources.
- Missing or invalid trailer assets never cause a partially built batch to replace the last active batch.
