# Review Report — Milestone 2 (R3 & R4 Evaluation)

**Reviewer**: Reviewer 2 (reviewer, critic)  
**Date**: 2026-08-02  
**Verdict**: **PASS** (APPROVE)

---

## 1. Executive Summary

Requirement **R3** (Fix Retry Button & Native Trailer Retry Flow) and Requirement **R4** (Feature Flag `VITE_HERO_TRAILER_MODE`) implemented by Worker 3 have been thoroughly reviewed, independently verified, and stress-tested. 

All 80 client test suite tests pass cleanly without errors, and the production Vite build (`npm run build`) completes with exit code 0. The code strictly complies with root `AGENTS.md` and `client/src/components/hero/AGENTS.md` invariants (zero YouTube iframe/API/ReactPlayer dependency in the Hero component flow, verified native HTML5 video or poster fallback).

---

## 2. Feature Flag `VITE_HERO_TRAILER_MODE` Verification (R4)

| Mode | Specification | Implementation Verification | Status |
|---|---|---|---|
| `'native'` | Use native Hero video player; never scroll to lower `TrailerSection`; Retry button retries native video in Hero. | `getHeroTrailerMode()` resolves `'native'`. `startPlaybackForIndex` allows native mounting. In `handleTrailerAction`, `trailerMode === 'native'` directly invokes `handlePlayTrailer()`. Scrolling to `#trailers` is bypassed. | **PASS** |
| `'section'` | Disable native player in Hero; Trailer button opens/scrolls to lower `TrailerSection`; Retry button hidden. | `startPlaybackForIndex` returns `false` when `trailerMode === 'section'`. In `handleTrailerAction`, `trailerMode === 'section'` invokes `scrollToTrailerSection()`. `HeroContent.jsx` suppresses `'Retry trailer'` label. | **PASS** |
| `'hybrid'` (default) | Prefer native player if valid source exists; Retry retries native playback in Hero; scroll to `TrailerSection` ONLY when no valid native source exists (`trailerAvailable === false`). | `getHeroTrailerMode()` defaults to `'hybrid'` for `undefined`, `''`, or invalid env values. In `handleTrailerAction`, when `trailerAvailable` is `true`, `handlePlayTrailer()` retries native playback in Hero without scroll. `scrollToTrailerSection()` is invoked ONLY when `trailerAvailable === false`. | **PASS** |

### Helper Implementation (`heroTrailerMode.js`):
- `getHeroTrailerMode(envMode)` handles environment inspection safely (`import.meta.env`), supporting both Node test runners and Vite runtime.
- Case-insensitive, whitespace-trimmed, and strictly fallback-safe to `'hybrid'`.

---

## 3. Native Retry Flow Verification (R3)

Inspect of `HeroSection.jsx`, `HeroContent.jsx`, and `HeroNativeVideo.jsx` confirmed:
1. **Error State Reset**: `handlePlayTrailer()` removes the movie key from `failedMovieKeysRef.current`, resets `playbackStatus` to `HERO_PLAYBACK_STATUS.IDLE`, and clears `failureReason`.
2. **Retry Nonce & Reload**: `retryNonceRef.current` is incremented and passed to `startPlaybackForIndex`. `HeroNativeVideo.jsx` detects generation/src changes and triggers `video.load()` followed by `video.play()`.
3. **No Window Scroll or Index Change**: Retry executes in-place within the Hero container; `currentIndex` remains unchanged; `scrollToTrailerSection()` is not called on retry.
4. **Loop Protection**: Automatic pause recovery is bounded (`MAX_AUTOMATIC_RESUMES = 2`), while manual retry requires explicit user button interaction.

---

## 4. Invariants & Integrity Analysis

- **Hero Invariants Compliance**: Grep search across `client/src/components/hero/` confirms zero YouTube iframe, YouTube Player API, ReactPlayer, or TMDB video lookups inside the Hero flow. YouTube media URL inputs are rejected by `heroVideoSource.js`.
- **Integrity Violation Check**:
  - Hardcoded test results: **None detected**.
  - Facade/dummy implementations: **None detected**. Real state, ref, and DOM video lifecycle hooks (`video.load()`, `video.play()`) are used.
  - Test shortcuts: **None detected**. Unit test suites perform functional helper tests and structural verification.

---

## 5. Test Suite & Build Verification Results

| Test Category | Command | Result | Details |
|---|---|---|---|
| Client Unit & Integration | `npm test` in `client/` | **PASS** | 80 tests passed, 0 failed (including R1, R2, R3, R4 tests) |
| Production Build | `npm run build` in `client/` | **PASS** | Succeeded in 630ms, exit code 0 |

---

## 6. Adversarial / Stress-Test Findings

1. **Invalid Flag Resilience**: Passing `'INVALID'`, `'   '`, `null`, or `undefined` to `getHeroTrailerMode` correctly resolves to `'hybrid'`.
2. **Transient Native Error Retry**: When native video encounters a network glitch or play rejection, clicking "Retry trailer" in `'native'` or `'hybrid'` mode successfully resets `failedMovieKeysRef` and attempts playback again without page shift.
3. **Poster-Only Movie Fallback**: If a movie has no verified native MP4 source (`trailerAvailable === false`), clicking trailer action in `'hybrid'` mode gracefully falls back to `scrollToTrailerSection()`.

---

## 7. Final Rationale

Worker 3's implementation of Requirements R3 and R4 strictly adheres to all user requirements, follow-up constraints, and project invariants. Build and test executions pass 100%. Verdict is **PASS**.
