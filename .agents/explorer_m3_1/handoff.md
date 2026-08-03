# Handoff Report — Milestone 3: Frontend Admin UI & Exact Manual Order Preservation

## 1. Observation

### 1.1 `client/src/pages/admin/HeroSettings.jsx` Inspection
- **State Initialization (`lines 50–68`)**:
  - `mode`: initialized to `'auto'` (or `hero.settings?.mode`).
  - `selectedIds`: initialized in `fetchHeroSettings` (`lines 227–230`):
    ```javascript
    const savedMovieIds = hero.settings?.movieIds?.length
      ? hero.settings.movieIds
      : (hero.selectedMovies || []).map((movie) => String(movie._id || movie.id));
    setSelectedIds(savedMovieIds.map(String));
    ```
    *Observation*: If `hero.selectedMovies` is ever derived from rotation fallback or active movies, `selectedIds` initialization could leak auto-rotation movies into manual selection.
  - `availableMovies`: initialized from combined movies (`lines 217–225`).
  - `rotation`: initialized from `hero.rotation`.
  - Missing state: explicit `liveMovies` state representing what is effectively live on Home right now (`hero.liveMovies`).

- **Section Rendering & Live Status Indicators (`lines 298–352`, `524–595`)**:
  - `line 302`: `Currently live on Home: {mode === 'manual' ? 'Manual Selection' : 'Auto-Rotation'}` uses the **local component `mode` state**, which reflects unsaved user edits rather than the actual effective live mode on the server.
  - `line 529`: Badge inside Selected Hero section also checks local `mode === 'manual'` rather than server `meta.effectiveMode` or `hero.settings.effectiveMode`.
  - Current sections are:
    1. Top Control Header (Mode buttons: Auto / Manual, Randomize, Save)
    2. Default trailer sound settings
    3. Native Hero pool (Auto mode) showing `rotation.activeBatch` & `rotation.pool`
    4. Weekly Catalog Pool
    5. Grid with "Selected Hero" (left column) and "Movie Library" (right column).
  - *Observation*: The 3 distinct sections requested in Requirement 7 are not clearly delineated:
    1. **Currently live on Home** (`hero.liveMovies`)
    2. **Manual selection** (`hero.manualSelection` / `settings.movieIds`)
    3. **Auto rotation pool** (`hero.rotation.pool` & `hero.rotation.activeMovies`)

- **Publish / Save Button & Validation (`lines 268–289`)**:
  - `line 269`: `if (mode === 'manual' && selectedIds.length !== MAX_HERO_MOVIES)` shows toast error `Choose exactly 5 movies for manual hero selection.`
  - The Save button is not disabled when `mode === 'manual'` and `selectedIds.length !== 5`.
  - There is no inline readiness indicator for each selected movie showing whether its native video trailer is verified (`movie.nativeVideoValid` or `movie.heroVideoStatus === 'ready'`).

- **HTTP 422 Handling (`lines 284–286`)**:
  - Catch block currently handles errors generically:
    ```javascript
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Unable to update hero.');
    }
    ```
  - Backend `updateHomeHero` (`server/services/heroService.js:239–246`) throws HTTP 422 with response:
    ```json
    {
      "success": false,
      "code": "MANUAL_HERO_INVALID",
      "message": "All five Manual Hero movies require verified native trailers.",
      "invalidMovies": [
        {
          "movieId": "...",
          "title": "...",
          "reasons": ["status-not-ready", "not-verified"]
        }
      ]
    }
    ```
  - *Observation*: `HeroSettings.jsx` currently does not parse `code === 'MANUAL_HERO_INVALID'` or render individual `invalidMovies` reasons.

- **UI Copy Audit**:
  - `HeroSettings.jsx:306–308`: "Manual mode displays your exact 5 manually selected movies in order on the Home page. Auto mode rotates movies using the native hero pool."
  - Search for obsolete copy "Manual mode only defines the ordered emergency poster fallback":
    - Found only in `ORIGINAL_REQUEST.md`. No remaining occurrences found in `HeroSettings.jsx` or active client source code.

- **Immediate Live Update after Save (`lines 276–283`)**:
  - Currently: `setMode(data.settings?.mode || mode); setSelectedIds((data.settings?.movieIds || selectedIds).map(String));`
  - Backend response contains `data.liveHero` (`server/controllers/adminController.js:98`), but `HeroSettings.jsx` does not update `liveMovies` state directly from `data.liveHero`.

---

### 1.2 `client/src/components/HeroSection.jsx` Inspection
- **Ordering Logic & Manual Bypass (`lines 425–454`)**:
  ```javascript
  const meta = data.meta || data;
  const settings = data.settings || {};
  const isManualMode = settings.mode === 'manual'
    || settings.configuredMode === 'manual'
    || settings.effectiveMode === 'manual'
    || meta.mode === 'manual'
    || meta.configuredMode === 'manual'
    || meta.effectiveMode === 'manual'
    || meta.source === 'manual-selection';

  const dailyOrderIds = !isManualMode
    ? getOrComputeDailyOrder({ ... })
    : [];
  const shuffledMovies = dailyOrderIds.length > 0
    ? applyDailyOrder(preparedMovies, dailyOrderIds)
    : preparedMovies;
  ```
- **Observations**:
  - `HeroSection.jsx` accurately checks `isManualMode` across `settings` and `meta` fields.
  - When `isManualMode` is true, `dailyOrderIds` is set to `[]`, skipping `getOrComputeDailyOrder()` and `applyDailyOrder()`. `shuffledMovies` receives `preparedMovies` directly in payload order.

---

### 1.3 `client/src/utils/heroDailyShuffle.js` Inspection
- **Bypass Check (`lines 233–236`)**:
  ```javascript
  const mode = meta.mode || meta.configuredMode || meta.effectiveMode || meta.settingsMode;
  if (mode === 'manual' || meta.source === 'manual-selection') {
    return movies.map((m) => String(m._id || m.id));
  }
  ```
- **Observation**: `getOrComputeDailyOrder` independently checks if mode is manual and returns `movies.map(m => String(m._id || m.id))` directly without accessing local storage history or applying seeded random shuffles.

---

## 2. Logic Chain

1. **Section Delineation & Data Mapping in Admin UI**:
   - *Observation*: Backend `getAdminHomeHero()` returns `{ settings, liveMovies, manualSelection, availableMovies, rotation, meta }`.
   - *Reasoning*: To make the Admin UI unambiguous, `HeroSettings.jsx` must map data explicitly into three distinct sections:
     - **Section 1: Currently Live on Home** -> data source: `hero.liveMovies` (array of movies currently live on Home). Top badge must show `hero.meta?.effectiveMode` or `hero.settings?.effectiveMode` ("Live Mode: Manual" vs "Live Mode: Auto-Rotation"), distinct from local unsaved edit state.
     - **Section 2: Manual Selection** -> data source: `hero.manualSelection?.movies` or `hero.settings?.movieIds`. `selectedIds` state must ONLY initialize from `hero.manualSelection?.movieIds` or `hero.settings?.movieIds` — NEVER from `hero.rotation.activeMovies`.
     - **Section 3: Auto Rotation Pool** -> data source: `hero.rotation.pool` (15 candidate pool) and `hero.rotation.activeBatch`.
   - *Conclusion*: Update `HeroSettings.jsx` state management and section layout to enforce this 3-section separation.

2. **HTTP 422 Error Surfacing (`MANUAL_HERO_INVALID`)**:
   - *Observation*: When validation fails during save in Manual mode, backend returns HTTP 422 with `code: "MANUAL_HERO_INVALID"` and an array `invalidMovies`.
   - *Reasoning*: Users need clear, itemized feedback on why a movie was rejected (e.g. `status-not-ready`, `duplicate-video-url`, `not-verified`).
   - *Conclusion*: Update `handleSave` catch block in `HeroSettings.jsx` to parse `error.response?.data?.code === 'MANUAL_HERO_INVALID'`, format the specific per-movie failure reasons from `invalidMovies`, and present them both in the toast error and as an inline error summary callout above the Manual Selection section.

3. **Validation & Save UX in HeroSettings.jsx**:
   - *Observation*: When mode is `'manual'`, saving requires exactly 5 movies, each with a verified native video trailer.
   - *Reasoning*: If `selectedIds.length !== 5`, the Publish/Save button should either be visually disabled with a tooltip or produce an immediate inline validation message. Each item in the Manual Selection list should show a native video status badge (`Verified native trailer` vs `Trailer issue: ...`).
   - *Conclusion*: Add visual status badges and disable/validate button state accordingly.

4. **Immediate UI Update after Save**:
   - *Observation*: Backend PUT `/api/admin/hero` returns `{ success: true, settings, liveHero, meta }`.
   - *Reasoning*: To give immediate visual feedback without page reload, successful saves must update `liveMovies` from `data.liveHero.movies` and update `mode` / `selectedIds`.
   - *Conclusion*: Update `handleSave` success path to update `liveMovies` state directly from `data.liveHero?.movies` or trigger `fetchHeroSettings()`.

5. **Home Daily Shuffle Bypass in Manual Mode**:
   - *Observation*: `HeroSection.jsx` and `heroDailyShuffle.js` both check `isManualMode`.
   - *Reasoning*: Manual mode demands exact preservation of server payload order [A, B, C, D, E] for all viewers, sessions, and reloads.
   - *Conclusion*: Ensure `HeroSection.jsx` bypasses `getOrComputeDailyOrder()` and `applyDailyOrder()`, ensuring `shuffledMovies` is identical to payload `preparedMovies`.

---

## 3. Caveats

1. **Backend Alignment**:
   - Implementation relies on backend `getAdminHomeHero()` returning `liveMovies` and `manualSelection`, and PUT `/api/admin/hero` returning `liveHero` and HTTP 422 `MANUAL_HERO_INVALID`. (Verified in `server/services/heroService.js` and `server/controllers/adminController.js`).
2. **Native Video Uploader**:
   - `HeroVideoUploader` component is embedded inside movie items. Updating a video triggers `onUpdated={fetchHeroSettings}`, which re-fetches hero settings.
3. **No Code Edits Performed by Explorer**:
   - As an exploration agent, no production code changes have been committed. The specifications below are designed for immediate implementation by implementer subagents.

---

## 4. Conclusion & Actionable Specification

### Implementation Specification for Milestone 3

#### Component A: `client/src/pages/admin/HeroSettings.jsx`
1. **State Management Updates**:
   - Add state: `const [liveMovies, setLiveMovies] = useState([]);`
   - Add state: `const [liveMeta, setLiveMeta] = useState(null);`
   - Add state: `const [invalidMoviesError, setInvalidMoviesError] = useState(null);`
   - In `fetchHeroSettings()`:
     - `setLiveMovies(hero.liveMovies || []);`
     - `setLiveMeta(hero.meta || null);`
     - Initialize `selectedIds` strictly from `hero.settings?.movieIds` or `(hero.manualSelection?.movies || []).map(m => String(m._id || m.id))`. Never fallback to `hero.rotation.activeMovies`.

2. **Section Layout & Data Mapping**:
   - **Section 1 — Currently Live on Home**:
     - Header: "1. Currently Live on Home"
     - Badges: `Live Mode: {liveMeta?.effectiveMode === 'manual' ? 'Manual Selection' : 'Auto-Rotation'}`
     - Display: Grid of 5 live movies (`liveMovies`) with poster thumbnail, title, release year, and native video status badge.
   - **Section 2 — Manual Selection (Authoritative)**:
     - Header: "2. Manual Selection" `({selectedIds.length}/5)`
     - Copy: "Manual mode displays your exact 5 selected movies in this exact order on Home. All 5 movies must have verified native video trailers."
     - Display: Reorderable cards for `selectedMovies` with position numbers (1-5), up/down controls, remove button, native video status badge, and video uploader.
     - Inline Error Callout: If `invalidMoviesError` is set, render a red/amber alert box detailing each invalid movie and its rejection reasons.
   - **Section 3 — Auto Rotation Pool**:
     - Header: "3. Auto Rotation Pool"
     - Display: `rotation.pool` (15 candidate movies) and active batch info.

3. **HTTP 422 Handling & Save Logic**:
   - In `handleSave()`:
     ```javascript
     setInvalidMoviesError(null);
     try {
       setSaving(true);
       const { data } = await axios.put('/api/admin/hero', { mode, movieIds: selectedIds });
       if (!data.success) {
         toast.error(data.message || 'Unable to update hero.');
         return;
       }
       toast.success(data.message || 'Hero updated successfully.');
       setMode(data.settings?.configuredMode || data.settings?.mode || mode);
       setSelectedIds((data.settings?.movieIds || selectedIds).map(String));
       if (data.liveHero?.movies) {
         setLiveMovies(data.liveHero.movies);
       }
       setLiveMeta(data.meta || null);
     } catch (error) {
       const resp = error.response?.data;
       if (error.response?.status === 422 && resp?.code === 'MANUAL_HERO_INVALID') {
         setInvalidMoviesError(resp.invalidMovies || []);
         const details = (resp.invalidMovies || [])
           .map((m) => `${m.title || m.movieId}: ${(m.reasons || []).join(', ')}`)
           .join('; ');
         toast.error(`Manual Selection Invalid: ${resp.message} (${details})`, { duration: 7000 });
       } else {
         toast.error(resp?.message || error.message || 'Unable to update hero.');
       }
     } finally {
       setSaving(false);
     }
     ```

#### Component B: `client/src/components/HeroSection.jsx`
1. Confirm `isManualMode` evaluation:
   ```javascript
   const isManualMode = settings.mode === 'manual'
     || settings.configuredMode === 'manual'
     || settings.effectiveMode === 'manual'
     || meta.mode === 'manual'
     || meta.configuredMode === 'manual'
     || meta.effectiveMode === 'manual'
     || meta.source === 'manual-selection';
   ```
2. When `isManualMode` is true, bypass `getOrComputeDailyOrder` and `applyDailyOrder`. Set `shuffledMovies` directly to `preparedMovies`.

---

## 5. Verification Method

### 5.1 Automated Unit & Integration Verification
Run existing client test suite to ensure hero daily shuffle bypass and contract tests pass:
```powershell
node --test client/tests/heroShuffleBypass.test.js
node --test client/tests/heroDailyShuffle.test.js
```

### 5.2 Manual / Playwright Flow Verification
1. **Admin UI Save with Missing Native Video (HTTP 422)**:
   - Select a movie without a verified native trailer into Manual Selection.
   - Click Save in Manual mode.
   - Verify HTTP 422 `MANUAL_HERO_INVALID` is caught, toast displays specific reasons, and inline error banner lists the invalid movie.
2. **Admin UI Save Valid Manual Selection**:
   - Select 5 movies with verified native trailers.
   - Click Save in Manual mode.
   - Verify success toast, and verify "Currently Live on Home" section updates immediately to show the 5 movies in the exact manual order [A, B, C, D, E].
3. **Home Hero Exact Order & Shuffle Bypass**:
   - Open Home page (`GET /api/show/hero`).
   - Verify payload returns mode `manual`, source `manual-selection`, and movies `[A, B, C, D, E]`.
   - Reload Home page across multiple browser sessions / viewer IDs and verify the rendered slide order remains strictly `[A, B, C, D, E]`.
