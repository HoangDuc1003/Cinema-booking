## 2026-08-03T04:31:34Z
You are Worker 2 implementing Milestone 2: Backend Identity & Controllers (R4) & Manual Mode Backend Logic (R3) for NitroCine Native Hero Production Repair.
Working directory for metadata: e:\NitroCine\.agents\implementer_2

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Task:
1. Read Explorer 2's handoff report at `e:\NitroCine\.agents\explorer_2\handoff.md` and analysis at `e:\NitroCine\.agents\explorer_2\analysis.md`.
2. Refactor `server/controllers/showController.js`:
   - In `getHomeHero`, ensure `res.json(...)` includes `meta: payload.meta` containing `configuredMode`, `effectiveMode`, `source`, `version`, `buildSha`, `deploymentId`, and `environment`.
3. Refactor `server/services/heroService.js`:
   - In `updateHomeHero`, when `nextMode === 'manual'`:
     - Check `ids` length is exactly 5 unique IDs.
     - Fetch candidate movies from `Movie` collection and verify ALL 5 movies exist AND have `heroVideoStatus === 'ready'`.
     - If validation fails, throw HTTP 422 (`Unprocessable Entity`) error, ensuring `SiteConfig` remains untouched (atomic preservation of previous state).
   - In `getAdminHomeHero`, include `liveMovies` (current live 5 public movies) and `manualSelection` (details of manual selection) in the returned response object alongside `rotation`, `settings`, `selectedMovies`, `availableMovies`.
   - Ensure Admin save mutation returns the resulting effective live Hero payload immediately.
   - Ensure cache invalidation (`invalidateHeroCaches()`, `bumpHeroCacheGeneration()`) triggers an immediate call to `getPublicHomeHero()` to pre-warm cache and update ETag before completing the HTTP response.
4. Update/add server unit & integration tests in `server/tests/` (e.g., `heroController.test.js`, `heroService.test.js`, `heroRotationService.test.js`).
5. Run server tests (`cd server && npm test`) and document exact results.
6. Record all modified files, test outputs, and verification in `e:\NitroCine\.agents\implementer_2\changes.md` and `e:\NitroCine\.agents\implementer_2\handoff.md`.
