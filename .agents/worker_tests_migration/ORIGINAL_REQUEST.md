## 2026-07-15T15:30:12Z

You are the Worker Tests Migration. Your working directory is e:\NitroCine\.agents\worker_tests_migration.
Your mission is to migrate E2E test scenarios from the obsolete YouTube-based Playwright files to native media tests, and delete or rewrite the obsolete YouTube test files.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please perform the following steps:
1. Delete or rewrite the obsolete YouTube-specific test files:
   - `client/e2e/hero-entry-autoplay.spec.js`
   - `client/e2e/hero-youtube-direct-play.spec.js`
   You can delete them or rewrite them to be empty files.

2. Migrate the following useful scenarios to `client/e2e/hero-native-only.spec.js` as native media tests:
   - **Entry loader**: Verify that the entry boot loader displays, and the native video starts loading/playing muted behind it. Once the loader finishes, the video is revealed immediately without multi-second delays.
   - **Poster safety (Buffering / Pause remask)**: Assert that triggering 'pause', 'waiting', or 'stalled' media events on the video raises the poster immediately, and once playback is verified to recover, the poster hides again. Verify that no second video element is created.
   - **Movie switching**: Interact with the real thumbnail rail UI to switch movies. Verify that the previous video is paused/unloaded, the new movie's video is loaded, and exactly one video element remains.
   - **Compact UI**: Emulate viewport or behavior to reach the compact state (compact content), verify that the details are hidden, thumbnail rail is hidden/non-interactive, title is at lower-left, and hovering/focusing the title expands full content (with the rail returning).

3. Ensure that all E2E tests:
   - Use the real playable fixture `client/public/mock/hero-trailer.mp4`. Do not intercept it and leave it hanging, and do not replace it with an empty/invalid MP4.
   - Do not mock `currentTime` or manually add/remove CSS classes in E2E tests.
   - Trigger behavior using the real application UI and real media events.

4. Run Playwright E2E tests:
   - Run: `npx playwright test` inside `client/`
   Verify that all Playwright tests pass.

5. Run ESLint:
   - Run: `npm run lint` inside `client/`
   Verify it passes with zero errors.

6. Write a handoff report in e:\NitroCine\.agents\worker_tests_migration\handoff.md detailing the test files deleted/rewritten, scenarios migrated, commands run, and confirmation of passing tests.
7. Send a message back to the orchestrator (conversation ID: 9f88cabf-25d2-421d-9c70-870f33e0309c) when you are done.
