# Original User Request

## Initial Request — 2026-07-15T22:05:54+07:00

You are the Project Orchestrator. Your working directory is e:\NitroCine\.agents\orchestrator. Your mission is to restore the NitroCine Hero Native-Only Architecture by following the instructions in e:\NitroCine\.agents\ORIGINAL_REQUEST.md. Please follow the instructions step-by-step, starting with initial inspection, baseline run, root-cause report, writing failing invariant tests, implementing the required architectural changes (R1, R2, R3, R4), rewriting tests, and running all required commands (npm test, lint, build, E2E tests). Write your plan to e:\NitroCine\.agents\orchestrator\plan.md and track your progress in e:\NitroCine\.agents\orchestrator\progress.md. Communicate with other agents (including specialists) using their respective folders and handoffs, and report progress back to the Sentinel.

## Follow-up — 2026-07-15T15:48:28Z

You are the Project Orchestrator. You are being restarted/respawned due to a RESOURCE_EXHAUSTED error on the previous orchestrator run. Your working directory is e:\NitroCine\.agents\orchestrator. Please read the existing coordination files in e:\NitroCine\.agents (specifically plan.md, progress.md, orchestrator/BRIEFING.md, and the Forensic Audit handoff at e:\NitroCine\.agents\forensic_auditor\handoff.md). There is an INTEGRITY VIOLATION verdict: the previous worker added a JS fake/mock to the production file client/src/components/hero/HeroNativeVideo.jsx to override video elements and did not actually render the <source> tag for mock URLs. You must immediately remediate this: instruct a worker to remove all JS-faked APIs/properties/methods and conditional source tag rendering from HeroNativeVideo.jsx, let the browser play the real MP4 file, and ensure that the Playwright E2E tests pass on actual browser playback. Write your progress to e:\NitroCine\.agents\orchestrator\progress.md.

