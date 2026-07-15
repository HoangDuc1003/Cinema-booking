## 2026-07-15T15:12:27Z
You are the Worker Tests. Your working directory is e:\NitroCine\.agents\worker_tests.
Your mission is to add or rewrite invariant tests in client/e2e/hero-native-only.spec.js that fail on the current regression.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please do the following:
1. Edit client/e2e/hero-native-only.spec.js to:
   - Import Buffer: `import { Buffer } from 'node:buffer';` at the top to fix the linter error.
   - Fix the mock response for `**/api/show/hero` at line 38-44. The mock should fulfill with `{ success: true, movies }` instead of raw array `movies`.
   - Update the existing tests or add new tests to assert that:
     - The Hero creates a YouTube iframe or requests YouTube/TMDB videos on current HEAD. (This is already asserted in some tests, but double check).
     - Native server order is preserved (the "Server order is preserved client-side" test already asserts this).
     - Automatic playback is unmuted after reveal. Write a test where localStorage has sound preference set to 'on' or standard flow, and check if the video is unmuted. On current HEAD, this should fail (i.e. we want to assert that the video remains muted, but on current HEAD the production code will unmute it, causing our test to fail).
     - Inactive movie metadata or video is NOT prefetched. Set up a mock with 5 movies, start the page, and assert that none of the inactive movies' media files are prefetched. On current HEAD, this should fail because `preloadRemainingTrailerSources` fetches them.
2. Run the newly updated/added tests using `npx playwright test client/e2e/hero-native-only.spec.js` inside e:\NitroCine\client.
3. Verify that these invariant tests FAIL on the current HEAD.
4. Write a handoff report in e:\NitroCine\.agents\worker_tests\handoff.md detailing the test changes you made, the commands run, and the failing test names/outputs.
5. Send a message back to the orchestrator (conversation ID: 9f88cabf-25d2-421d-9c70-870f33e0309c) with the test results and a path to your handoff file.
