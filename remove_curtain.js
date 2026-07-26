const fs = require('fs');
const path = 'e:/NitroCine/client/src/components/HeroSection.jsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/import CinematicCurtain from '\.\/hero\/CinematicCurtain';\n/, '');
content = content.replace(/const CURTAIN_POSTER_PREVIEW_MS = 200;\n/, '');
content = content.replace(/const CURTAIN_PREFETCHED_PREVIEW_MS = Math\.max\(0, CURTAIN_POSTER_PREVIEW_MS - HERO_ENDED_POSTER_HOLD_MS\);\n/, '');
content = content.replace(/const CURTAIN_CLOSE_DURATION_MS = 400;\n/, '');
content = content.replace(/const CURTAIN_CLOSED_HOLD_MS = 300;\n/, '');
content = content.replace(/const CURTAIN_OPEN_DURATION_MS = 400;\n/, '');
content = content.replace(/const CURTAIN_REDUCED_MOTION_DURATION_MS = 150;\n/, '');

content = content.replace(/  const \[curtainState, setCurtainState\] = useState\('closed'\);\n/, '');
content = content.replace(/  const \[curtainMounted, setCurtainMounted\] = useState\(false\);\n/, '');
content = content.replace(/  const pendingCurtainPreviewMsRef = useRef\(CURTAIN_POSTER_PREVIEW_MS\);\n/, '');
content = content.replace(/  const curtainStateRef = useRef\('closed'\);\n/, '');
content = content.replace(/  const curtainOpenPendingRef = useRef\(null\);\n/, '');
content = content.replace(/  const curtainEnabled = import\.meta\.env\.VITE_HERO_CURTAIN_ENABLED !== 'false';\n/, '');

content = content.replace(
  /  const videoVisible = verifiedVideoVisible && \([\s\S]*?cinematicRevealed \|\| curtainState === 'opening' \|\| curtainState === 'open'[\s\S]*?\);/,
  "  const videoVisible = verifiedVideoVisible && cinematicRevealed;"
);

content = content.replace(
  /  const prepareCinematicAttempt = useCallback\(\(\{ mountCurtain \}\) => \{\n    clearCinematicTimers\(\);\n    cancelFade\(\);\n    playerRef\.current = null;\n    const shouldMount = curtainEnabled && mountCurtain;\n    const nextCurtainState = shouldMount \? 'previewing' : 'open';\n    curtainStateRef\.current = nextCurtainState;\n    curtainOpenPendingRef\.current = null;\n    verifiedPlaybackGenerationRef\.current = null;\n    attemptStartedAtRef\.current = null;\n    setCurtainState\(nextCurtainState\);\n    setCurtainMounted\(shouldMount\);\n    setCinematicRevealed\(!shouldMount\);\n  \}, \[cancelFade, clearCinematicTimers, curtainEnabled\]\);/,
  `  const prepareCinematicAttempt = useCallback(() => {
    clearCinematicTimers();
    cancelFade();
    playerRef.current = null;
    verifiedPlaybackGenerationRef.current = null;
    attemptStartedAtRef.current = null;
    setCinematicRevealed(false);
  }, [cancelFade, clearCinematicTimers]);`
);

content = content.replace(/  const beginCurtainOpening = useCallback\([\s\S]*?\}, \[curtainEnabled, reducedMotion, scheduleCinematicTimer\]\);\n/, '');
content = content.replace(/  const beginCurtainClosing = useCallback\([\s\S]*?\}, \[beginCurtainOpening, curtainEnabled, reducedMotion, scheduleCinematicTimer\]\);\n/, '');

content = content.replace(/    curtainPreviewMs = CURTAIN_POSTER_PREVIEW_MS,\n/, '');
content = content.replace(/    prepareCinematicAttempt\(\{ mountCurtain: true \}\);/g, '    prepareCinematicAttempt();');
content = content.replace(/    beginCurtainClosing\(generation, curtainPreviewMs\);\n/, '');

content = content.replace(/    prepareCinematicAttempt\(\{ mountCurtain: false \}\);/g, '    prepareCinematicAttempt();');

content = content.replace(/    continueTrailer = false,\n    curtainPreviewMs = CURTAIN_POSTER_PREVIEW_MS,\n/g, '    continueTrailer = false,\n');
content = content.replace(/    pendingCurtainPreviewMsRef\.current = continueTrailer \? curtainPreviewMs : CURTAIN_POSTER_PREVIEW_MS;\n/g, '');

content = content.replace(
  /  const handleVisualReady = useCallback\(\(payload\) => \{\n    revealVerifiedVideo\(payload\);\n    if \(curtainOpenPendingRef\.current === payload\.generation\) \{\n      beginCurtainOpening\(payload\.generation, \{ visualReadyNow: true \}\);\n    \}\n  \}, \[beginCurtainOpening, revealVerifiedVideo\]\);/,
  `  const handleVisualReady = useCallback((payload) => {
    revealVerifiedVideo(payload);
    setCinematicRevealed(true);
  }, [revealVerifiedVideo]);`
);

content = content.replace(
  /  const handleCurtainRevealComplete = useCallback\(\(\) => \{\n    if \(curtainStateRef\.current !== 'open'\) return;\n    setCurtainMounted\(false\);\n  \}, \[\]\);\n\n\n\n/,
  ""
);

content = content.replace(
  /      \{curtainMounted && \(\n        <CinematicCurtain\n          state=\{curtainState\}\n          onRevealComplete=\{handleCurtainRevealComplete\}\n        \/>\n      \)\}\n\n/,
  ""
);

content = content.replace(/if \(curtainState !== 'closed'\) return;\n/g, '');
content = content.replace(/\[curtainState, /g, '[');
content = content.replace(/        continueTrailer: true,\n        curtainPreviewMs: CURTAIN_PREFETCHED_PREVIEW_MS,\n/g, '        continueTrailer: true,\n');
content = content.replace(/    if \(!shouldContinue\) pendingCurtainPreviewMsRef\.current = CURTAIN_POSTER_PREVIEW_MS;\n/, '');
content = content.replace(/      const curtainPreviewMs = pendingCurtainPreviewMsRef\.current;\n      pendingCurtainPreviewMsRef\.current = CURTAIN_POSTER_PREVIEW_MS;\n      timerId = window\.setTimeout\(\(\) => \{\n        void startTrailerAttempt\(\{ source: 'continuation', curtainPreviewMs \}\);\n      \}, 0\);/g, `      timerId = window.setTimeout(() => {\n        void startTrailerAttempt({ source: 'continuation' });\n      }, 0);`);

// Some hook dependencies might need to be cleaned up
// e.g., prepareCinematicAttempt dependency array
content = content.replace(/, prepareCinematicAttempt, reducedMotion\]\)/g, ', prepareCinematicAttempt])');

// We also need to fix `cinematicRevealed` when attempting: wait, when we attempt to start a trailer, `prepareCinematicAttempt()` sets `setCinematicRevealed(false)`, and `handleVisualReady` sets it to `true`.
// What about `useCallback` dependency arrays? If we removed `beginCurtainOpening`, `curtainEnabled`, `curtainState`, etc. from arrays, we might need to remove them if ESLint complains. It's usually fine or we can let eslint fix it if configured.

fs.writeFileSync(path, content, 'utf8');
console.log('done');
