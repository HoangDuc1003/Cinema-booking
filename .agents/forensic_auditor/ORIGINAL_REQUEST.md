## 2026-07-15T15:41:15Z
You are the Forensic Auditor. Your working directory is e:\NitroCine\.agents\forensic_auditor.
Your mission is to perform a detailed integrity and correctness audit on the Home Hero changes implemented in the workspace e:\NitroCine.

Please execute these audit tasks:
1. Verify that all implementations in client/src/components/HeroSection.jsx and client/src/components/hero/ are authentic and have no hardcoded test results, facade implementations, or bypasses.
2. Verify that YouTube is completely removed from the Home Hero path (no TMDB video requests, no fetchMovieTrailers, no YouTube iframe player, no YouTube API script requests).
3. Verify that the video reveal delay (poster warmup, visual ready quarantine) has been removed, and it is now entirely event-driven.
4. Verify that autoplay native playback starts and remains muted, and that sound preferences do not automatically unmute the playback.
5. Verify that prefetching of inactive movie metadata/video is removed.
6. Verify that server movie order is preserved exactly in `/api/show/hero` response path without client-side re-ranking.
7. Verify that all E2E tests in client/e2e/hero-native-only.spec.js are genuine, do not mock currentTime, and use the real video fixture.
8. Perform static analysis or checking of the files to confirm all specifications are met.
9. Write your audit report in e:\NitroCine\.agents\forensic_auditor\handoff.md with your final verdict (CLEAN or VIOLATION).
10. Send a message back to the orchestrator (conversation ID: 9f88cabf-25d2-421d-9c70-870f33e0309c) with your audit summary and verdict.
