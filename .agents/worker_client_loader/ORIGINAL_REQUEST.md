## 2026-07-15T16:13:47Z
You are teamwork_preview_worker.
Your working directory is: e:\NitroCine\.agents\worker_client_loader\
Your task is to implement the client-side loader removal for Milestone 6:

1. Update `client/src/pages/Home.jsx` to completely remove:
   - The import of `HomeBootLoader`
   - `loaderMs`, `fadeMs`, `posterWarmupMs`, and other timing configs/logic
   - `introPhase` state and the timers/timeouts setting it
   - Scroll-locking hook linked to `introComplete`
   - `aria-busy`, `aria-hidden`, and `inert` wrappers
   - The rendering of `<HomeBootLoader />`
   - Ensure the component renders immediately:
     <>
       <HeroSection />
       <Suspense fallback={null}>
         <FeatureSection />
         <TrailerSection />
       </Suspense>
     </>

2. Update `client/src/App.jsx` to replace `<HomeBootLoader fadeMs={0} />` with the standard `<Loading />` component for PageFallback. Remove `HomeBootLoader` import from `client/src/App.jsx`.

3. Safely delete:
   - `client/src/components/HomeBootLoader.jsx`
   - `client/src/components/homeBootLoader.css`
   - `client/e2e/hero-entry-autoplay.spec.js`
   - `client/e2e/hero-youtube-direct-play.spec.js`

4. Update `client/e2e/hero-native-only.spec.js` and `client/e2e/hero-direct-play.spec.js`:
   - Remove/update `window.__NITROCINE_HOME_TIMINGS__` override logic since timings are removed.
   - Refactor the "Entry loader" test (and any other test referencing the loader) to assert that `HomeBootLoader` is not rendered, home content is not inert, and the Hero poster/video renders immediately.

5. Verify your changes by running the build, lint, and Playwright E2E tests:
   - cd client
   - npm run lint
   - npm run build
   - npm run test:e2e
   Provide exact results in your report.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## 2026-07-15T16:14:20Z
New requirements received for client loader removal & admin panel.
1. **POST /api/admin/catalog/refresh**: Create a protected admin endpoint in the server (`POST /api/admin/catalog/refresh` in `server/routes/adminRoutes.js` and `server/controllers/adminController.js`) that manually calls `refreshWeeklyCatalog()` using `catalogRefreshService.js`.
2. **Admin UI Button**: Add a button in the client admin UI (e.g. in `client/src/pages/admin/HeroSettings.jsx` or a new section) to manually trigger the catalog refresh by making a POST request to `/api/admin/catalog/refresh`. Show real-time status feedback (e.g. "Refreshing...", "Success", "Failed") and include a checkbox for "Dry Run".
3. **Smart Home Entry**: Instead of a fixed-time loader or instant render, implement a smart loading strategy in `client/src/pages/Home.jsx`:
   - Wait until the 3 main sections (Hero, FeatureSection/Now Showing, and TrailerSection) have received their data.
   - Use skeleton placeholders per-section while loading.
   - Once all 3 sections are ready, render the full page.
   - If any section takes >5s, render whatever is ready and show the rest as skeletons.
4. **Final Project Cleanup & Optimization**:
   - Remove unused files, dead imports, orphaned components (such as `HomeBootLoader.jsx`, `homeBootLoader.css`).
   - Remove temporary/diagnostic scripts created during development.
   - Optimize bundle size, lazy load.
   - Clean up console.log noise.
