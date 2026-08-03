## 2026-08-03T04:24:25Z
You are Explorer 2 for NitroCine Native Hero Production Repair.
Working directory for metadata: e:\NitroCine\.agents\explorer_2

Your task:
1. Thoroughly investigate backend files in `server/`:
   - Inspect `server/controllers/showController.js` and `server/controllers/adminController.js`, routes (`/api/show/hero`, `/api/admin/hero` or equivalents), models (`ShowConfig`, `Movie`, etc.), caching (Redis, server cache, ETags, versions).
   - Map current implementation of `updateHomeHero` and `getAdminHomeHero`.
2. Analyze requirements for Manual Mode (R3) & Backend Identity (R4):
   - Manual mode must bypass active auto-rotation batches and return exactly 5 saved manual movie IDs in order when `configuredMode === 'manual'`.
   - `updateHomeHero` must validate exactly 5 unique native-ready movies (`heroVideoStatus === 'ready'`). If invalid, reject with HTTP 422 atomically preserving previous config.
   - `getAdminHomeHero` must return separate fields for `liveMovies`, `manualSelection`, and `rotation`.
   - `meta` response field must safely include `configuredMode`, `effectiveMode`, `source`, `version`, `buildSha`, `deploymentId`, `environment` without leaking secrets.
   - Admin save must atomically persist mode and ordered IDs, invalidate Redis/server cache, update ETag/version, and trigger immediate GET refetch.
3. Do NOT edit any source code. Write your findings, code references, exact file paths, line numbers, and backend refactoring strategy to `e:\NitroCine\.agents\explorer_2\analysis.md` and a self-contained handoff report to `e:\NitroCine\.agents\explorer_2\handoff.md`.
