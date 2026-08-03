## 2026-08-02T16:39:03Z
You are Worker 4 implementing Milestone 3 (E2E Integration & Final Verification) for NitroCine.
Your working directory for metadata/reports is: e:/NitroCine/.agents/worker_m3

Context:
- Requirements & Acceptance Criteria: e:/NitroCine/.agents/ORIGINAL_REQUEST.md
- Scope Document: e:/NitroCine/.agents/orchestrator/PROJECT.md
- Previous Handoffs: e:/NitroCine/.agents/worker_m1_fix/handoff.md and e:/NitroCine/.agents/worker_m2/handoff.md

Task Instructions:
1. Implement/Update Automated Integration & E2E Tests:
   - Create or update an integration/E2E test suite (e.g. `client/tests/heroE2EIntegration.test.js` or `e2e/hero-manual-retry.spec.js`) that verifies:
     a. Setting 5 movies in Manual mode and saving.
     b. `GET /api/show/hero` returns exact 5 movie IDs in saved order with native trailer metadata and non-sensitive `meta` diagnostic.
     c. Reloading Home renders the same 5 movies.
     d. Simulating 1st native playback rejection.
     e. Clicking "Retry trailer".
     f. Verifying a 2nd native play attempt occurs without window scroll, navigation away, or movie index change.
2. Perform Objective Backend Environment Verification:
   - Verify that Admin PUT/POST response and public Hero GET response report matching backend identity metadata (`environment`, `version`, build SHA/deployment ID).
3. Run Full Build & Test Suite:
   - Run `npm test` in `e:/NitroCine/client` — MUST pass 100%.
   - Run `node --test server/tests/heroService.test.js server/tests/heroRotationService.test.js` (and full server tests) in `e:/NitroCine` — MUST pass.
   - Run `npm run build` in `e:/NitroCine/client` — MUST succeed with exit code 0.
4. Handoff:
   - Write `changes.md` and `handoff.md` in `e:/NitroCine/.agents/worker_m3/` detailing exact commands run, test results, request URLs, response payloads, backend identity metadata, and build outputs.
   - Send message to orchestrator (conversation ID: ca391f6d-5a51-4e2d-b813-4224c779f542) when complete.
