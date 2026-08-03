# Handoff Report — Milestone 1: Unified API Client Configuration Analysis & Specification

## 1. Observation

### 1.1 Shared API Client Module (`client/src/lib/apiClient.js`)
- **Location**: `client/src/lib/apiClient.js` (79 lines)
- **Exports**:
  - `getNormalizedApiBase(url)`: Trims whitespace, strips trailing slashes (`/+$/`), strips trailing `/api`.
  - `API_BASE_URL` & `API_BASE`: Evaluated once from `import.meta.env.VITE_BASE_URL` (or `process.env.VITE_BASE_URL`).
  - `buildApiUrl(path)`: Formats paths into absolute/relative URLs, handling absolute URLs, empty `API_BASE_URL` (for Vite proxy), leading slashes, and deduplicating `/api/api` to `/api`.
  - `apiClient`: Shared Axios instance created with `baseURL: API_BASE_URL`, containing a request interceptor to fix `/api/api/` occurrences.
  - `fetchApi(path, options, timeoutMs)`: Fetch wrapper using `buildApiUrl` and `requestWithTimeout` from `client/src/services/fetchWithTimeout.js`.
- **Observed Behavior**: Correctly normalizes `VITE_BASE_URL`, allows empty string `""` for Vite dev server proxying, and prevents duplicate `/api/api`.

### 1.2 Call Site Audit Results (`client/src/`)

#### 1.2.1 `client/src/services/tmdb.js` (Line 18, Line 84, Line 135, Line 612)
- **Observation**: `tmdb.js` imports `getNormalizedApiBase` and `buildApiUrl` from `../lib/apiClient.js`, but defines its own local constant:
  ```javascript
  const API_BASE = getNormalizedApiBase(runtimeEnv.VITE_BASE_URL);
  ```
  It then performs manual string template concatenations:
  - Line 84 (`fetchBackendJson`): `fetchWithTimeout(\`${API_BASE}/api/show/tmdb\${path}\`, options, timeoutMs)`
  - Line 135 (`loadHomeHeroFromServer`): `fetchWithTimeout(\`${API_BASE}/api/show/hero\`, { signal, headers }, HERO_API_TIMEOUT_MS)`
  - Line 612 (`fetchMovieShowtimes`): `fetchWithTimeout(\`${API_BASE}/api/show/\${encodeURIComponent(movieId)}\`, { signal }, SHOWTIME_API_TIMEOUT_MS)`
- **Requirement Gap**: `tmdb.js` bypasses `buildApiUrl()` and `fetchApi()` exported by `client/src/lib/apiClient.js` by performing manual string interpolation with its own `API_BASE` variable.

#### 1.2.2 `client/src/context/AppContext.jsx` (Lines 5, 25-68, 72, 87, 99, 128)
- **Observation**:
  - Line 5: `import { apiClient as api, getNormalizedApiBase } from '../lib/apiClient.js';`
  - Lines 25-68: Attaches Clerk token authorization header interceptor to `api` (`apiClient`).
  - Lines 72, 87, 99: Uses `api.get('/api/show/all')`, `api.get('/api/admin/is-admin')`, `api.get('/api/user/favorites')`.
  - Line 128: Provides `axios: api` in `AppContext` value.
- **Compliance Status**: Compliant. All consumers of `useAppContext().axios` automatically route requests through `apiClient`.

#### 1.2.3 Admin Pages & User Context Callers
- **Files**:
  - `client/src/pages/admin/HeroSettings.jsx` (Lines 74, 92, 115, 134, 153, 209, 276)
  - `client/src/pages/admin/HeroVideoUploader.jsx` (Lines 79, 119, 142)
  - `client/src/pages/admin/DashBoard.jsx` (Line 47)
  - `client/src/pages/admin/AddShows.jsx` (Lines 22, 95)
  - `client/src/pages/admin/ListBookings.jsx` (Line 17)
  - `client/src/pages/admin/ListShows.jsx` (Line 17)
  - `client/src/pages/MyBookings.jsx` (Lines 36, 63, 89, 108)
  - `client/src/pages/SeatLayout.jsx` (Lines 181, 205)
  - `client/src/services/profileService.js` (Lines 2, 7, 12, 17)
- **Observation**: All of these files destructure `axios` from `useAppContext()`. Because `AppContext` provides `apiClient`, all Admin mutations (e.g. `PUT /api/admin/hero`) and user operations use the unified `apiClient` base URL.
- **Compliance Status**: Compliant.

#### 1.2.4 Hero & Component Callers
- **Files**:
  - `client/src/components/HeroSection.jsx` (Line 507) -> calls `fetchHomeHero()` from `tmdb.js`.
  - `client/src/components/NativeTrailerSection.jsx` (Lines 134-135) -> calls `fetchHomeHero()` and `fetchHomeNowShowing()` from `tmdb.js`.
  - `client/src/hooks/useMobileHomeData.js` (Lines 32-33) -> calls `fetchHomeHero()` and `fetchHomeNowShowing()` from `tmdb.js`.
  - `client/src/components/hero/heroImages.js` (Lines 1, 40) -> imports `API_BASE_URL`, `getNormalizedApiBase`, `buildApiUrl` from `lib/apiClient.js`. Line 40 calls `buildApiUrl(\`\${base}/api/show/tmdb/image?\${query}\`)`.
- **Compliance Status**: When `tmdb.js` is refactored to use `buildApiUrl`/`fetchApi`, all Hero and UI components will implicitly use the unified API configuration.

### 1.3 Test Suite Execution Results
- **Command**: `node --test client/tests/apiClientConfig.test.js`
- **Output**:
  - `✔ apiClient.js normalizes base URLs correctly`
  - `✔ buildApiUrl constructs clean paths and prevents duplicated /api/api`
  - `✔ apiClient exports configured Axios instance and fetch wrapper`
  - `✔ tmdb.js consumes lib/apiClient.js`
  - `✔ AppContext.jsx consumes lib/apiClient.js`
  - Total: 5 tests passed, 0 failed.

---

## 2. Logic Chain

1. **Premise**: Requirements R1 & Section 1/14 mandate that all frontend API requests (Axios and fetch) must consume a single shared configuration module (`client/src/lib/apiClient.js`) that reads `VITE_BASE_URL` once and normalizes it. Admin mutations (`PUT /api/admin/hero`) and Home Hero queries (`GET /api/show/hero`) must resolve to the exact same origin under the same runtime environment.
2. **Analysis of `client/src/lib/apiClient.js`**:
   - The module `client/src/lib/apiClient.js` is already implemented with proper normalization functions (`getNormalizedApiBase`, `buildApiUrl`), exports (`API_BASE_URL`, `apiClient`, `fetchApi`), and `/api/api` deduplication.
   - Minor enhancement: Improve `getNormalizedApiBase` with a loop to ensure multiple trailing `/api` segments are stripped, and enhance `apiClient.interceptors.request` to handle any string containing `/api/api/`.
3. **Analysis of Callers**:
   - `AppContext.jsx` imports `apiClient` as `api` and provides it to all React components via context as `axios`.
   - All Admin components (`HeroSettings.jsx`, `HeroVideoUploader.jsx`, etc.) call `useAppContext().axios`, meaning Admin requests resolve to `apiClient`'s `API_BASE_URL`.
   - `tmdb.js` currently reads `VITE_BASE_URL` directly and constructs URLs via string interpolation `\${API_BASE}/api/...`.
4. **Refactoring Plan**:
   - Modify `tmdb.js` to remove its local `API_BASE` variable and delegate URL resolution directly to `buildApiUrl` / `fetchApi` exported from `lib/apiClient.js`.
   - Simplify `heroImages.js` line 40 to pass `/api/show/tmdb/image...` directly to `buildApiUrl()`.

---

## 3. Caveats

1. **Environment Variable Injection**: In Vite, `import.meta.env.VITE_BASE_URL` is statically replaced at build time, while Node/Test environments evaluate `process.env.VITE_BASE_URL`. `lib/apiClient.js` handles both gracefully via fallback.
2. **Vite Dev Server Proxy**: When `VITE_BASE_URL` is empty (`""`), `API_BASE_URL` evaluates to `""`, causing paths like `/api/show/hero` to remain relative. This is expected and required behavior when relying on Vite dev server proxying.
3. **TMDB Direct Images vs Proxy**: TMDB poster/backdrop images (`image.tmdb.org`) use full HTTPS URLs. `buildApiUrl` detects absolute URLs starting with `http://` or `https://` and returns them without prepending `API_BASE_URL`.

---

## 4. Conclusion & Actionable Specification

### 4.1 Required Changes in `client/src/services/tmdb.js`
- **Imports**:
  ```javascript
  import { buildApiUrl, fetchApi, API_BASE_URL } from '../lib/apiClient.js';
  ```
- **Remove**:
  ```javascript
  // Remove local API_BASE declaration:
  // const API_BASE = getNormalizedApiBase(runtimeEnv.VITE_BASE_URL);
  ```
- **Update Request Helpers**:
  - `fetchBackendJson`:
    ```javascript
    const response = await fetchWithTimeout(
        buildApiUrl(`/api/show/tmdb${path}`),
        options,
        timeoutMs,
    );
    ```
  - `loadHomeHeroFromServer`:
    ```javascript
    const response = await fetchWithTimeout(
        buildApiUrl('/api/show/hero'),
        { signal, headers },
        HERO_API_TIMEOUT_MS,
    );
    ```
  - `fetchMovieShowtimes`:
    ```javascript
    const response = await fetchWithTimeout(
        buildApiUrl(`/api/show/${encodeURIComponent(movieId)}`),
        { signal },
        SHOWTIME_API_TIMEOUT_MS,
    );
    ```

### 4.2 Required Refinements in `client/src/lib/apiClient.js`
- **Ensure Interceptor Handles Any URL Substring**:
  ```javascript
  apiClient.interceptors.request.use((config) => {
    if (config.url) {
      let url = String(config.url).trim();
      if (url.includes('/api/api/')) {
        config.url = url.replace(/\/api\/api\//g, '/api/');
      }
    }
    return config;
  });
  ```
- **Ensure Base URL Normalization Handles Edge Cases**:
  ```javascript
  export const getNormalizedApiBase = (url) => {
    let base = (url || '').trim().replace(/\/+$/, '');
    while (base.endsWith('/api')) {
      base = base.slice(0, -4).replace(/\/+$/, '');
    }
    return base;
  };
  ```

### 4.3 Summary of File-by-File Status

| File | Status | Planned Change |
|---|---|---|
| `client/src/lib/apiClient.js` | Needs minor hardening | Enhance `/api/api/` interceptor & base URL normalization |
| `client/src/services/tmdb.js` | Needs refactoring | Replace local `API_BASE` with `buildApiUrl()` / `fetchApi()` |
| `client/src/context/AppContext.jsx` | Verified | Already imports `apiClient` and exposes via context |
| `client/src/pages/admin/HeroSettings.jsx` | Verified | Consumes `useAppContext().axios` (`apiClient`) |
| `client/src/pages/admin/HeroVideoUploader.jsx` | Verified | Consumes `useAppContext().axios` (`apiClient`) |
| `client/src/components/hero/heroImages.js` | Verified | Simplifies `buildApiUrl` call |

---

## 5. Verification Method

To verify independent compliance of the Unified API Client Configuration:

1. **Run Unit Tests**:
   ```powershell
   node --test client/tests/apiClientConfig.test.js
   ```
2. **Verify Repository-Wide Compliance**:
   Run grep checks to ensure no hardcoded backend URLs or duplicate base URL declarations exist:
   ```powershell
   rg -n "axios\.create" client/src
   rg -n "VITE_BASE_URL" client/src
   ```
   - `axios.create` must only match `client/src/lib/apiClient.js`.
   - `VITE_BASE_URL` in `client/src` must only match `client/src/lib/apiClient.js`.
