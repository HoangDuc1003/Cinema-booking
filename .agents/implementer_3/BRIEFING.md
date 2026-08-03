# BRIEFING — 2026-08-03T11:44:02Z

## Mission
Implement Milestone 3: Home Route Zero YouTube Guarantee (R1) & Manual Mode Daily Shuffle Bypass (R3) for NitroCine Native Hero Production Repair.

## 🔒 My Identity
- Archetype: implementer
- Roles: implementer, qa, specialist
- Working directory: e:\NitroCine\.agents\implementer_3
- Original parent: 215d7df5-a203-4d15-ad09-e92e80eb0ab0
- Milestone: Milestone 3 (R1 & R3)

## 🔒 Key Constraints
- Zero YouTube on Home Route (R1): `NativeTrailerSection.jsx` displays native MP4/WebM video or poster fallback without referencing YouTube iframe API, YouTube URLs, or TMDB video lookup endpoints.
- Update `Home.jsx` to replace `TrailerSection` with `NativeTrailerSection`.
- Manual Mode Daily Shuffle Bypass (R3): When mode is `'manual'` (`settings.mode === 'manual'` or `meta.configuredMode === 'manual'`), bypass `getOrComputeDailyOrder` and maintain the exact 5 saved manual movies in server order.
- Add/update tests in `client/tests/` (`heroShuffleBypass.test.js`, `homeZeroYouTube.test.js`).
- Never cheat or fabricate test results. Run client unit tests (`cd client && npm test`).
- Record modified files, test outputs, and verification in `changes.md` and `handoff.md`.

## Current Parent
- Conversation ID: 215d7df5-a203-4d15-ad09-e92e80eb0ab0
- Updated: 2026-08-03T11:44:02Z

## Task Summary
- **What to build**: Home route zero-YouTube native trailer section component (`NativeTrailerSection.jsx`), integrate into `Home.jsx`, update `HeroSection.jsx` & `heroDailyShuffle.js` for manual mode shuffle bypass, write unit tests.
- **Success criteria**: Zero YouTube requests or iframes on Home route, zero TMDB video queries on Home route, exact 5 manual movies sequence preserved in manual mode, all 89 client unit tests passing.
- **Interface contracts**: `PROJECT.md`, `AGENTS.md`, `client/AGENTS.md`, `client/src/components/hero/AGENTS.md`
- **Code layout**: `client/src/components/NativeTrailerSection.jsx`, `client/src/pages/Home.jsx`, `client/src/components/HeroSection.jsx`, `client/src/utils/heroDailyShuffle.js`, `client/tests/`.

## Change Tracker
- **Files modified**:
  - `client/src/components/NativeTrailerSection.jsx` (Created)
  - `client/src/pages/Home.jsx` (Modified)
  - `client/src/utils/heroDailyShuffle.js` (Modified)
  - `client/src/components/HeroSection.jsx` (Modified)
  - `client/src/lib/apiClient.js` (Modified)
  - `client/tests/heroShuffleBypass.test.js` (Created)
  - `client/tests/homeZeroYouTube.test.js` (Created)
- **Build status**: PASS (89 tests pass, ESLint 0 errors, Vite build successful)
- **Pending issues**: None

## Quality Status
- **Build/test result**: PASS (89 tests pass)
- **Lint status**: PASS (0 errors)
- **Tests added/modified**: `heroShuffleBypass.test.js`, `homeZeroYouTube.test.js`

## Loaded Skills
- **Source**: `e:\NitroCine\.agents\skills\hero-runtime-debug\SKILL.md`
  - **Local copy**: `e:\NitroCine\.agents\skills\hero-runtime-debug\SKILL.md`
  - **Core methodology**: Hero runtime debug workflow (zero YouTube, verified native HTML5 video or poster fallback).
- **Source**: `e:\NitroCine\.agents\skills\verify-change\SKILL.md`
  - **Local copy**: `e:\NitroCine\.agents\skills\verify-change\SKILL.md`
  - **Core methodology**: Review completed repository changes, validate patch minimal scope and test integrity before merge.

## Key Decisions Made
- Implemented `NativeTrailerSection.jsx` using `resolveConfiguredHeroVideoSource` and `isSafeNativeHeroVideoUrl`.
- Replaced `TrailerSection` with `NativeTrailerSection` on `Home.jsx` while keeping `TrailerSection.jsx` intact for non-Home routes like `MovieDetails.jsx`.
- Added manual mode detection in `HeroSection.jsx` and `heroDailyShuffle.js` to preserve exact 5 saved manual movies in server order.

## Artifact Index
- `ORIGINAL_REQUEST.md` — Original user prompt instructions.
- `BRIEFING.md` — Active working memory and task state.
- `changes.md` — Detailed record of modified files, code changes, and test results.
- `handoff.md` — 5-component handoff report.
