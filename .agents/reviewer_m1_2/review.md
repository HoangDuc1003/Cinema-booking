# Independent Review Report — Milestone 1 (R1 & R2)

**Reviewer**: Reviewer 2 (reviewer, critic)  
**Target**: Milestone 1 (R1 & R2 Implementation by Worker 1)  
**Working Directory**: `e:/NitroCine/.agents/reviewer_m1_2`  
**Date**: 2026-08-02  

---

## Executive Summary

- **Verdict**: **VETO (REQUEST_CHANGES)**
- **Overall Assessment**: While the backend manual mode logic (`server/services/heroRotationService.js` and `server/services/heroService.js`) and API normalization (`client/src/services/tmdb.js`) are correctly implemented and all unit tests pass, **Worker 1 accidentally corrupted `client/src/pages/admin/HeroSettings.jsx` during editing**. This broken JSX code causes `npm run build` in `client/` to fail with a fatal compilation error and destroys the "Manual selection" UI section in the Admin panel.

---

## Detailed Findings

### [Critical] Finding 1: Broken Build & Corrupted JSX in `client/src/pages/admin/HeroSettings.jsx`

- **Location**: `client/src/pages/admin/HeroSettings.jsx` (Lines 508–549)
- **Category**: Correctness / Code Quality / Build Failure
- **What**: Lines 508–549 contain corrupted and truncated JSX syntax.
  ```jsx
  508: <button
  509:   type="button"
  510:   onClick={handleCatalogRefresh}
  511:   disabled={refreshingCatalog}
  512:       decoding="async"
  513:       className="w-14 h-20 object-cover rounded-md bg-black/40"
  514:     />
  515:     <div className="min-w-0">
  516:       <p className="font-medium truncate">{index + 1}. {movie.title}</p>
  ...
  549: ))}
  ```
  Specifically:
  1. The `<button>` tag at line 508 for `handleCatalogRefresh` is never closed; its text label (`Refresh Catalog`) and closing `</button>` were deleted, leaving dangling attributes (`decoding="async"`).
  2. The wrapper `<div className="grid lg:grid-cols-[360px_1fr] gap-6">` and `<div className="bg-white/[0.04] border border-white/10 rounded-lg p-4">` for the **"Selected Hero" / "Manual selection"** section were deleted.
  3. The `selectedMovies.map((movie, index) => ...)` opening construct was deleted, leaving undefined variable references (`index`, `movie`) and an orphaned `))}</div></div>`.
- **Why**: 
  1. Executing `npm run build` in `e:/NitroCine/client` fails immediately:
     ```
     [builtin:vite-transform] Error: Unexpected token. Did you mean {'}'} or &rbrace;?
     src/pages/admin/HeroSettings.jsx:549:17
     ```
  2. The Admin UI fails to display the separate "Manual selection" section (where admins can view, reorder, and remove manually selected movies).
- **Suggestion**: Restore the deleted/corrupted markup in `client/src/pages/admin/HeroSettings.jsx` (lines 508–549) to ensure:
  - `<button onClick={handleCatalogRefresh}>` is properly closed with text label and status span.
  - The "Selected Hero / Manual selection" sidebar grid is restored with `{selectedMovies.length === 0 ? (...) : selectedMovies.map((movie, index) => (...))}` so admins can reorder and manage the manual selection.
  - `npm run build` passes cleanly.

---

## Verified Claims Audit

| Claim | Verified Via | Result | Details |
|---|---|---|---|
| R1: `tmdb.js` & `AppContext.jsx` derive API base URL from `VITE_BASE_URL` | `view_file` & `npm test` (`apiClientConfig.test.js`) | **PASS** | Correctly normalized, removing DEV override. |
| R2: `mode === 'manual'` bypasses auto-rotation batches | `view_file` (`heroRotationService.js:685`) | **PASS** | `getPublicHeroRotation` checks `settings.mode === 'manual'` and branches to `loadManualPayload`. |
| R2: Exact 5 saved movie IDs returned in order | `view_file` & `node --test` (`heroService.test.js`) | **PASS** | Loads ordered movies from `settings.movieIds`. |
| R2: Native video metadata retained | `view_file` & `node --test` (`heroService.test.js`) | **PASS** | `normalizeHeroMovie(movie)` retains video properties when ready (no poster-only strip). |
| R2: Public payload diagnostic `meta` object | `view_file` (`heroRotationService.js`) | **PASS** | Includes `configuredMode`, `effectiveMode`, `source`, `version`, `environment`. |
| R2: Atomic save & Cache invalidation | `view_file` (`heroService.js:170`) | **PASS** | `updateHomeHero` calls `bumpHeroCacheGeneration()` and `invalidateHeroCaches()`. |
| R2: Admin UI displays separate sections & live badges | `view_file` (`HeroSettings.jsx`) | **FAIL** | Headers/badges added, but "Manual selection" section deleted due to JSX corruption. |
| Client Unit Tests (`npm test` in `client`) | `run_command` | **PASS** | 73 pass, 0 fail. |
| Server Hero Tests (`node --test server/tests/heroService.test.js server/tests/heroRotationService.test.js`) | `run_command` | **PASS** | 19 pass, 0 fail. |
| Client Production Build (`npm run build` in `client`) | `run_command` | **FAIL** | Exit code 1 (JSX compilation error in `HeroSettings.jsx`). |

---

## Final Verdict Rationale

- Backend implementation of R2 meets all specified requirements (authoritative manual mode, exact 5 IDs, video metadata retention, `meta` object, atomic cache invalidation).
- However, because the Admin UI component `client/src/pages/admin/HeroSettings.jsx` was corrupted and fails the production build (`npm run build`), Milestone 1 cannot be approved in its current state.
- **Verdict**: **VETO (REQUEST_CHANGES)**
