## 2026-08-02T16:20:39Z

You are Worker 1 implementing Milestone 1 for the NitroCine project.
Your working directory for metadata/reports is: e:/NitroCine/.agents/worker_m1

Context & Scope:
Read Explorer 1 handoff: e:/NitroCine/.agents/explorer_1/handoff.md
Read Explorer 2 handoff: e:/NitroCine/.agents/explorer_2/handoff.md
Read requirements in e:/NitroCine/.agents/ORIGINAL_REQUEST.md (R1 and R2) and e:/NitroCine/AGENTS.md.

Task Instructions:
1. Implement Requirement R1 (Unify API Client Configuration):
   - Modify `client/src/services/tmdb.js` line 17 to use `VITE_BASE_URL` without `DEV` mode overriding to `''`:
     `const API_BASE = (runtimeEnv.VITE_BASE_URL || '').trim().replace(/\/$/, '');`
   - Ensure all public/Home GET API requests and Admin axios API requests use `VITE_BASE_URL`.

2. Implement Requirement R2 (Make Manual Hero Selection Authoritative & UI Sync):
   - Modify `server/services/heroRotationService.js` and `server/services/heroService.js`:
     - In `getPublicHomeHero()` / `getPublicHeroRotation()`, check `SiteConfig` `homeHero.mode`.
     - When `mode === 'manual'`, query the exact 5 movies from `settings.movieIds` in saved order.
     - Normalize movies retaining native video metadata (`normalizeHeroMovie(movie)` without `{ posterOnly: true }` so ready MP4 video URLs are preserved).
     - Return public payload with `effectiveMode: 'manual'`.
     - In `getAdminHomeHero()`, populate `selectedMovies` using saved `settings.movieIds` (not auto-rotation batch movies), so Admin UI loads saved manual selections on mount.
     - Ensure cache invalidation (`invalidateHeroCaches()`, `bumpHeroCacheGeneration()`) is called on admin PUT updates.
   - Modify `client/src/pages/admin/HeroSettings.jsx`:
     - In `fetchHeroSettings`, set `selectedIds` state to `hero.settings?.movieIds` (or `hero.selectedMovies`), not auto-rotation `activeMovies`.
     - Add visual distinction to distinguish between "Currently live on Home" and "Manual selection" (e.g. status badges indicating whether Manual mode or Auto mode is live, clear section labels).
     - Update banner copy.

3. Testing & Verification:
   - Add/update unit and integration tests covering: Admin and Home Hero using same API base URL, and Manual mode becoming authoritative with exact 5 movies returned in saved order.
   - Run `npm test` in `e:/NitroCine/client` and `npm test` in `e:/NitroCine/server`. Ensure all tests pass cleanly.

4. Handoff:


## 2026-08-02T16:21:24Z

**Context**: Updated Implementation Constraints for Milestone 1 (R1 & R2).

**Content**: Please adhere strictly to the following updated constraints from `ORIGINAL_REQUEST.md`:

1. **Unified API URL**:
   - Normalize `VITE_BASE_URL` by trimming whitespace, removing trailing slash, and preventing duplicated `/api/api`.
   - Ensure all fetch/axios instances consume a single shared frontend API client module.
   - Perform a repo-wide check to ensure no hardcoded backend URLs or direct `fetch('/api/...')` calls bypass the shared client.

2. **Manual Mode Semantics**:
   - Response payload must include explicit `configuredMode` and `effectiveMode`.
   - When `configuredMode === "manual"`: public Hero endpoint must bypass active auto-rotation batches, return exact 5 saved movie IDs in Admin selection order, and retain native video metadata (`heroVideoUrl`, `heroVideoStatus`, etc. — no poster-only conversion).
   - Validation error must be thrown on Save if movie IDs are invalid/missing.
   - Include non-sensitive diagnostic `meta` object in public Hero response (`configuredMode`, `effectiveMode`, `source`, `version`, `environment`). Do NOT expose DB credentials or secret URIs.
   - Saving manual selection must atomically persist mode and ordered movie IDs, invalidate Redis/server cache & ETags, and make subsequent GET `/api/show/hero` return immediately.
   - Admin UI must show two separate sections: "Currently live on Home" and "Manual selection".

3. **Testing**:
   - Run `npm test` in `client/` and `server/`.
