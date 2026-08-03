# Code Review Report — Milestone 1 (R1 & R2)

## Review Summary

**Verdict**: VETO (REQUEST_CHANGES)

Milestone 1 implementation introduces correct backend logic for Requirement R1 (API Base URL Unification) and Requirement R2 (Authoritative Manual Hero Selection). However, **the production client build (`npm run build`) is completely broken** due to a corrupted JSX syntax error introduced by Worker 1 in `client/src/pages/admin/HeroSettings.jsx`. 

Because acceptance criteria state that all unit/integration tests and the production build must pass, this work cannot be approved until the JSX error in `HeroSettings.jsx` is fixed and the production build succeeds.

---

## Findings

### [Critical] Finding 1: Production Client Build Failure in `HeroSettings.jsx`

- **What**: Executing `npm run build` in `client/` fails with a fatal Vite compilation error.
- **Where**: `client/src/pages/admin/HeroSettings.jsx` (lines 508–549).
- **Why**: Spliced / corrupted JSX syntax. A mapping loop for `selectedMovies` (`{selectedMovies.map(...)`) was accidentally truncated/injected inside an unclosed `<button>` element for `handleCatalogRefresh`.
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
- **Command Output**:
  ```
  > client@0.0.0 build
  > vite build

  [builtin:vite-transform] Error: Unexpected token. Did you mean `{'}'}` or `&rbrace;`?
       ╭─[ src/pages/admin/HeroSettings.jsx:549:17 ]
       │
   549 │               ))}
  ```
- **Suggestion**: Restore the broken JSX markup in `HeroSettings.jsx` so that the catalog refresh button is properly closed and the selected movies list render block is correctly closed and structured.

---

### [Minor] Finding 2: Code Duplication of `getNormalizedApiBase` Helper

- **What**: `getNormalizedApiBase` is implemented twice with identical code in `client/src/services/tmdb.js` (lines 16–22) and `client/src/context/AppContext.jsx` (lines 8–14).
- **Where**: `client/src/services/tmdb.js` and `client/src/context/AppContext.jsx`.
- **Why**: While logic is correct and passes tests, duplicating helper logic increases drift risk.
- **Suggestion**: Extract `getNormalizedApiBase` into a shared utility file (e.g. `client/src/lib/apiConfig.js` or `client/src/services/apiConfig.js`) and import it in both locations.

---

## Verified Claims

- **R1 API Base URL Normalization**: `client/src/services/tmdb.js` and `client/src/context/AppContext.jsx` → Verified (normalization trims whitespace, strips trailing slashes, and removes `/api` suffix to avoid `/api/api`).
- **R1 Bypass Prevention**: Repo-wide search for `localhost:5000` and direct `fetch('/api/...')` → Verified (no un-normalized direct backend requests bypass `tmdb.js` or `AppContext.jsx` `axios` instance).
- **R2 Manual Mode Backend Authoritativeness**: `server/services/heroRotationService.js` and `server/services/heroService.js` → Verified (`getPublicHeroRotation` checks `settings.mode === 'manual'`, returns exact 5 saved movies in order, preserves native video fields, adds `meta` diagnostic properties, and invalidates cache on updates).
- **Client Unit Test Suite (`npm test` in `client`)**: Verified → 73 pass, 0 fail.
- **Server Unit & Integration Test Suite (`npm test` in `server`)**: Verified → 117 pass, 0 fail, 2 skipped.
- **Production Client Build (`npm run build` in `client`)**: Verified → **FAILED** (Exit Code 1).

---

## Coverage Gaps & Stress Test Analysis

- **Build vs Test Isolation Gap**: `npm test` in `client/` runs tests using Node's test runner (`node --test`) on isolated unit test files (`client/tests/*.test.js`). Node test execution does not transform or validate unimported JSX files (such as `HeroSettings.jsx`). Consequently, `npm test` reported 73 passing tests despite `HeroSettings.jsx` containing fatal JSX syntax errors.
- **Verification Requirement**: Reviewers must always run full production build commands (`npm run build`) in addition to unit tests to catch JSX/bundling syntax regressions.

---

## Final Verdict

**VETO**. Worker 1 must fix the JSX syntax corruption in `client/src/pages/admin/HeroSettings.jsx` and verify that both `npm test` and `npm run build` pass cleanly before Milestone 1 can be merged.
