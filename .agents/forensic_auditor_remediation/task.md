# Task: Forensic Integrity Audit of HeroNativeVideo.jsx Remediation

## Objective
Run a complete forensic integrity audit of the home hero native video implementation.
Verify that all JS-faked properties/APIs have been completely removed from `client/src/components/hero/HeroNativeVideo.jsx`.
Verify that conditional `<source>` rendering for mock URLs has been removed.
Verify that the tests execute actual browser media playback without facades or mocks of the media engine.
Run the Playwright E2E tests, unit tests, build, and lint checks.

## Inputs
- Work product: `client/src/components/hero/HeroNativeVideo.jsx`
- Tests: `client/e2e/hero-native-only.spec.js`
- Task details: previous integrity audit handoff at `e:\NitroCine\.agents\forensic_auditor\handoff.md`.

## Deliverable
Write your audit handoff report to `e:\NitroCine\.agents\forensic_auditor_remediation\handoff.md` with your verdict (CLEAN or INTEGRITY VIOLATION).
