## 2026-08-02T16:29:32Z
You are Worker 2 tasked with fixing the JSX corruption in client/src/pages/admin/HeroSettings.jsx for Milestone 1.
Your working directory for metadata/reports is: e:/NitroCine/.agents/worker_m1_fix

Context:
Reviewer 2 VETO report: e:/NitroCine/.agents/reviewer_m1_2/review.md
Target File: e:/NitroCine/client/src/pages/admin/HeroSettings.jsx

Issue:
During Milestone 1 implementation, lines 508–549 of `client/src/pages/admin/HeroSettings.jsx` were corrupted during text replacement:
1. The `<button>` tag at line 508 for `handleCatalogRefresh` was left unclosed (missing closing `</button>` and label text "Refresh Catalog").
2. The wrapper `<div className="grid lg:grid-cols-[360px_1fr] gap-6">` and `<div className="bg-white/[0.04] border border-white/10 rounded-lg p-4">` for the "Selected Hero" / "Manual selection" panel were deleted.
3. The `selectedMovies.map((movie, index) => ...)` mapping construct was deleted, leaving undefined variable references (`index`, `movie`) and an orphaned `))}</div></div>`.

Task Instructions:
1. Fix `client/src/pages/admin/HeroSettings.jsx` around lines 508–549:
   - Repair the `<button>` tag for `handleCatalogRefresh` with proper label ("Refresh Catalog") and status indicator.
   - Restore the full "Selected Hero / Manual selection" sidebar grid and component mapping (`selectedMovies.map(...)`), showing the selected movie title, poster image, and order.
   - Ensure separate UI sections: "Currently live on Home" badge/banner and "Manual selection" section.
2. Run build and tests:
   - Run `npm run build` in `e:/NitroCine/client` — MUST succeed with exit code 0.
   - Run `npm test` in `e:/NitroCine/client` — MUST pass all 73+ tests.
   - Run `node --test server/tests/heroService.test.js server/tests/heroRotationService.test.js` in `e:/NitroCine` — MUST pass 19+ server tests.
3. Write `changes.md` and `handoff.md` in `e:/NitroCine/.agents/worker_m1_fix/`. Send message to orchestrator (conversation ID: ca391f6d-5a51-4e2d-b813-4224c779f542) when complete.
