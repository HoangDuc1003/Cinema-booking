# Task: Remediate Integrity Violation in HeroNativeVideo.jsx

## Objective
Remove all JS-faked APIs, properties, methods, and conditional source tag rendering from `client/src/components/hero/HeroNativeVideo.jsx`. Ensure that the browser plays the real MP4 file (`/mock/hero-trailer.mp4`), and verify that all Playwright E2E tests pass on actual browser playback.

## Steps
1. Open `client/src/components/hero/HeroNativeVideo.jsx`.
2. Locate and remove the entire `useEffect` hook that intercepts mock URLs (`source.src.includes('/mock/')` or `hero-trailer`) and mocks `readyState`, `paused`, `currentTime`, `play`, `pause` using `Object.defineProperty` and `setInterval`.
3. Locate and remove the conditional rendering of the `<source>` tag in the `<video>` component. Ensure that `<source src={source.src} type={source.mimeType} />` is rendered directly whenever `enabled && source?.src` is true, without excluding `/mock/` or `hero-trailer`.
4. Run `npm run test:e2e` inside the `client` directory to verify that all Playwright E2E tests pass on actual browser playback.
5. Run lint (`npm run lint` or eslint) and build (`npm run build`) in `client` to ensure no regressions or syntax/type errors.
6. Write a detailed handoff report in `e:\NitroCine\.agents\worker_remediation\handoff.md` detailing the changes, commands executed, and output results.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
