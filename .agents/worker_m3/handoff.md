# Handoff Report — Milestone 3: Frontend Admin UI & Exact Manual Order Preservation

## 1. Observation

### 1.1 Changed Source Files & Line Summary
- **`client/src/pages/admin/HeroSettings.jsx`**:
  - Added states: `liveMovies`, `liveMeta`, `invalidMoviesError`.
  - Reorganized Admin UI into 3 clearly labeled sections:
    1. `"1. Currently Live on Home"` (renders `liveMovies` & `effectiveLiveMode` badge, source metadata).
    2. `"2. Manual Selection"` (renders reorderable 1-5 selection list, `invalidMoviesError` inline alert callout box, native video status badges, and search library).
    3. `"3. Auto Rotation Pool"` (renders `rotation.pool` candidates & `rotation.activeBatch`).
  - Updated `fetchHeroSettings` so `selectedIds` state initializes strictly from `settings.movieIds` or `manualSelection.movieIds`/`manualSelection.movies`, NEVER leaking from `rotation.activeMovies`.
  - Updated `handleSave` catch block to parse HTTP 422 `MANUAL_HERO_INVALID` responses, set `invalidMoviesError`, and show formatted per-movie failure reasons in toast notification and inline red alert box.
  - Updated `handleSave` success block to immediately update `liveMovies` from `data.liveHero?.movies` and `liveMeta` from `data.meta`.
  - Replaced obsolete copy with copy reflecting authoritative manual mode.

- **`client/src/utils/heroDailyShuffle.js`**:
  - Updated `getOrComputeDailyOrder` manual mode check:
    ```javascript
    const mode = meta.mode || meta.configuredMode || meta.effectiveMode || meta.settingsMode;
    if (
      mode === 'manual'
      || meta.configuredMode === 'manual'
      || meta.effectiveMode === 'manual'
      || meta.source === 'manual-selection'
    ) {
      return movies.map((m) => String(m._id || m.id));
    }
    ```
    Bypasses daily shuffle history and seeded PRNG whenever manual mode or manual-selection source is present.

- **`client/src/components/HeroSection.jsx`**:
  - Updated `applyServerPayload` to include `source: meta.source || settings.source` when invoking `getOrComputeDailyOrder`.
  - Preserves exact server payload order `[A, B, C, D, E]` when `isManualMode` is true.

- **`client/tests/heroAdminUIAndManualOrder.test.js`**:
  - Added unit test suite covering:
    1. Admin UI initialization extracting `selectedIds` strictly from `settings.movieIds`/`manualSelection` without leaking `rotation.activeMovies`.
    2. HTTP 422 `MANUAL_HERO_INVALID` response structure parsing.
    3. Immediate `liveMovies` update using `data.liveHero.movies`.
    4. Source code verification for the 3 labeled sections and 422 error state handling in `HeroSettings.jsx`.
    5. Exact Manual Order preservation `[A, B, C, D, E]` across reloads and different viewer IDs.

---

## 2. Logic Chain

1. **Section Delineation in Admin UI**:
   - Backend `getAdminHomeHero()` exposes `liveMovies`, `manualSelection`, `rotation`, `settings`, and `meta`.
   - By creating `liveMovies` and `liveMeta` state variables in `HeroSettings.jsx`, the UI maps data directly into three distinct sections:
     - Section 1: "1. Currently Live on Home" displays what is live on Home right now along with the effective mode badge.
     - Section 2: "2. Manual Selection" displays the reorderable manual selection cards (1 to 5) with native trailer status badges.
     - Section 3: "3. Auto Rotation Pool" displays the candidate pool (15 candidates) and active rotation batch.

2. **Strict Initialization of `selectedIds`**:
   - Initializing `selectedIds` from `hero.settings?.movieIds` or `hero.manualSelection` prevents auto-rotation batch movies from polluting manual selection when manual mode has not yet been saved.

3. **HTTP 422 `MANUAL_HERO_INVALID` Error Surfacing**:
   - When an admin attempts to save Manual mode with invalid/missing native trailers, backend throws HTTP 422 `MANUAL_HERO_INVALID` with an `invalidMovies` array detailing reasons per movie (e.g. `status-not-ready`, `duplicate-video-url`, `not-verified`).
   - The catch block in `handleSave` captures `error.response?.status === 422 && resp?.code === 'MANUAL_HERO_INVALID'`, extracts the reasons per title, and sets `invalidMoviesError`.
   - An inline red alert box is rendered above the manual selection list showing itemized reasons, alongside an extended 7-second toast message.

4. **Instant Live Update after Save**:
   - On successful save, PUT `/api/admin/hero` returns `data.liveHero.movies`.
   - `handleSave` sets `liveMovies` to `data.liveHero.movies` and `liveMeta` to `data.meta`, providing instant UI updates without needing page reload.

5. **Home Exact Manual Order Preservation & Daily Shuffle Bypass**:
   - When mode is `manual` or `source === 'manual-selection'`, `HeroSection.jsx` sets `dailyOrderIds` to `[]`, skipping `getOrComputeDailyOrder()` and `applyDailyOrder()`.
   - `heroDailyShuffle.js` also checks `meta.configuredMode === 'manual'` and `meta.effectiveMode === 'manual'`, returning payload IDs directly without modifying localStorage history.
   - Server payload order `[A, B, C, D, E]` is preserved identically for all viewers, sessions, and reloads.

---

## 3. Caveats

- **Test Environment vs Backend Runtime**:
  - The client unit test suite (`client/tests/`) runs using Node test runner (`node --test`). Backend mock integration tests in `heroE2EIntegration.test.js` mock database calls while testing service methods.
- **Native Video Assets**:
  - Manual mode save requires 5 movies with verified native video trailers (`heroVideoStatus === 'ready'`). Trying to save manual mode without 5 native-ready movies triggers the HTTP 422 validation response as designed.

---

## 4. Conclusion

All requirements for Milestone 3 (Frontend Admin UI & Exact Manual Order Preservation) specified in `ORIGINAL_REQUEST.md` (Sections 7 & 8) and `explorer_m3_1/handoff.md` have been fully implemented and verified:
- `HeroSettings.jsx` features 3 clearly labeled sections, non-leaking `selectedIds` state, HTTP 422 `MANUAL_HERO_INVALID` error handling, immediate live state update, and authoritative manual mode copy.
- `HeroSection.jsx` and `heroDailyShuffle.js` enforce exact manual order preservation `[A, B, C, D, E]` by bypassing per-user daily shuffle in manual mode.
- All 100 unit tests pass, zero lint errors were reported, and production build succeeded cleanly.

---

## 5. Verification Method

### Executed Verification Commands & Verbatim Outputs

1. **Client Unit Tests (`cd client && npm test`)**:
   ```
   ✔ M3: Admin UI initialization extracts selectedIds strictly from settings.movieIds/manualSelection and liveMovies from hero.liveMovies (0.3204ms)
   ✔ M3: HTTP 422 MANUAL_HERO_INVALID error structure parsing (0.3596ms)
   ✔ M3: Immediate live update uses data.liveHero.movies upon successful save (0.2353ms)
   ✔ M3: HeroSettings.jsx source code verification for 3 labeled sections, 422 error handling, and live state (9.6987ms)
   ✔ M3: Exact Manual Order preservation [A, B, C, D, E] across reloads and viewer IDs (0.9953ms)
   ...
   ℹ tests 100
   ℹ pass 100
   ℹ fail 0
   ℹ duration_ms 1525.7052
   ```

2. **Client ESLint (`cd client && npm run lint`)**:
   ```
   > client@0.0.0 lint
   > eslint .
   (Exited with code 0, 0 errors)
   ```

3. **Client Vite Build (`cd client && npm run build`)**:
   ```
   > client@0.0.0 build
   > vite build

   vite v8.0.10 building client environment for production...
   transforming...✓ 1938 modules transformed.
   rendering chunks...
   dist/assets/HeroSettings-uOGDsNBr.js              30.80 kB │ gzip:   8.39 kB
   dist/assets/Home-DNuLFY7l.js                      41.05 kB │ gzip:  13.83 kB
   dist/assets/index-CbWJ7bbl.js                    409.84 kB │ gzip: 129.67 kB
   ✓ built in 589ms
   ```
