# Original User Request

## Follow-up — 2026-07-15T16:04:00Z

Title:
Precomputed Weekly Movie Catalog with Twice-Daily Rotation and Instant Home Entry

Repository:
e:\NitroCine

Integrity mode:
development

Primary objective:

Precompute and store a validated weekly catalog pool containing exactly
150 unique active movies so the Home page never has to wait for live TMDB
requests.

The weekly pool must serve seven days and rotate the visible movie selection
twice daily at:

- 08:00 Asia/Ho_Chi_Minh
- 20:00 Asia/Ho_Chi_Minh

A completely new 150-movie batch must be prepared every Monday at:

- 03:00 Asia/Ho_Chi_Minh

The Home page must render immediately and must not show the existing artificial
three-second HomeBootLoader.

Do not clear the Movie collection before the replacement batch is complete.
Do not delete historical Movie documents that may be referenced by Shows,
Bookings, favorites, reviews, Hero assets, or other user data.

## Follow-up (New Requirements) — 2026-07-15T16:13:55Z

### NEW R5: Admin UI Seed Trigger Button
Add a protected admin route and a corresponding button in the admin panel UI that allows an authenticated admin to manually trigger the catalog refresh (the same `refreshWeeklyCatalog()` service used by CLI and Inngest). This is critical for deployed environments (e.g., Vercel) where CLI access is not available.
- Server endpoint (e.g., `POST /api/admin/catalog/refresh`) protected by admin authentication.
- A simple button in the existing admin UI (or a minimal `/admin` page) with progress/status feedback (refreshing, success, failure) and a dry-run option if feasible.

### NEW R6: Smart Home Entry (Replace Fixed 3s Wait)
Instead of a fixed 3-second `HomeBootLoader`, implement a smart loading strategy:
- Do NOT show a fixed-time loader.
- Wait until the 3 main sections (Hero, NowShowing/FeatureSection, TrailerSection) have received their data from the API/cache.
- Once all 3 sections have data ready, render the full page.
- Use skeleton placeholders per-section while individual sections load, NOT a full-screen blocking overlay.
- If any section takes too long (e.g., >5s timeout), render whatever is ready and show the rest as skeletons.

### NEW R7: Final Project Cleanup & Performance Optimization
- Remove unused files, dead imports, orphaned components.
- Remove temporary/diagnostic scripts created during development.
- Optimize bundle size (lazy loading, code splitting where beneficial).
- Ensure no console.log spam in production builds.
- Clean up any duplicate helper functions or services.
