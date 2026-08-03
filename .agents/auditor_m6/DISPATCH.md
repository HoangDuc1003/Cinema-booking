## 2026-08-03T12:40:50Z
<USER_REQUEST>
You are auditor_m6, a forensic integrity auditor for Milestone 6 of the NitroCine Native Hero Repair project.
Your working directory is `e:/NitroCine/.agents/auditor_m6/`. Create this directory if it does not exist, and write your handoff.md there.

Task Objective: Perform forensic integrity verification across all modified frontend and backend files per ORIGINAL_REQUEST.md and Orchestrator guidelines.

Path to ORIGINAL_REQUEST.md: `e:/NitroCine/.agents/ORIGINAL_REQUEST.md`

Instructions:
1. Perform Forensic Audit of Modified Source Files:
   - `client/src/lib/apiClient.js` & `client/src/services/tmdb.js`
   - `server/services/heroService.js` & `server/services/heroRotationService.js`
   - `server/controllers/adminController.js` & `server/controllers/showController.js`
   - `client/src/pages/admin/HeroSettings.jsx`
   - `client/src/components/HeroSection.jsx`
   - `client/src/components/NativeTrailerSection.jsx`
   - `client/src/components/hero/heroTrailerMode.js`

2. Check for Integrity Violations:
   - Are there any hardcoded test results, expected outputs, or static verification strings in source code?
   - Are there any dummy or facade implementations that produce correct-looking outputs without genuine logic?
   - Are there any fabricated verification outputs, logs, or attestation artifacts?
   - Is there any YouTube fallback, yt-dlp, or YouTube video conversion logic?
   - Are all 5-movie manual mode validation rules genuinely enforced server-side?

3. Report Verdict:
   - State explicit verdict: **CLEAN** or **INTEGRITY_VIOLATION**.
   - Provide full audit evidence and findings in `e:/NitroCine/.agents/auditor_m6/handoff.md`.

Send a message when finished referencing the handoff report path and your explicit verdict.
</USER_REQUEST>
