# Implementation Changes — Milestone 1: Unified API Configuration (R2)

## Files Created / Modified

1. **`client/src/lib/apiClient.js`** (Created)
   - Created unified API client module exporting `getNormalizedApiBase`, `API_BASE_URL`, `API_BASE`, `buildApiUrl`, `apiClient` (shared Axios instance), and `fetchApi` (fetch wrapper with timeout).
   - Normalizes `VITE_BASE_URL` by trimming whitespace, removing trailing slash, stripping `/api` suffixes, allowing empty string in dev mode for Vite proxy support, and preventing duplicated `/api/api` paths.
   - Configured request interceptor on `apiClient` to automatically fix any `/api/api/` path prefixes.

2. **`client/src/context/AppContext.jsx`** (Modified)
   - Replaced duplicate `getNormalizedApiBase` and local `axios.create` call with imports of `apiClient` and `getNormalizedApiBase` from `../lib/apiClient.js`.
   - Maintained exported `axios` in `AppContext` context value so all dependent contexts and components (e.g. `ProfileContext`, `MyBookings`, `SeatLayout`, `AddShows`, `DashBoard`, `HeroSettings`, `HeroVideoUploader`, `ListBookings`, `ListShows`) receive the unified `apiClient` with token interceptor support.

3. **`client/src/services/tmdb.js`** (Modified)
   - Imported `getNormalizedApiBase` and `buildApiUrl` from `../lib/apiClient.js`.
   - Removed duplicated `getNormalizedApiBase` definition and used normalized `API_BASE` derived via `lib/apiClient.js`.

4. **`client/src/components/hero/heroImages.js`** (Modified)
   - Imported `API_BASE_URL`, `getNormalizedApiBase`, `buildApiUrl` from `../../lib/apiClient.js`.
   - Updated `runtimeApiBase` to use `API_BASE_URL` and `getTmdbImageProxyUrl` to use `getNormalizedApiBase` and `buildApiUrl`, ensuring image proxy URLs handle `/api` normalization and avoid double `/api/api` paths.

5. **`client/tests/apiClientConfig.test.js`** (Modified)
   - Refactored test suite to directly verify `client/src/lib/apiClient.js` functions:
     * `getNormalizedApiBase` handles whitespace, trailing slashes, `/api` suffixes, and empty string/null.
     * `buildApiUrl` constructs clean paths and prevents duplicated `/api/api` paths.
     * `apiClient` exports configured Axios instance with correct `baseURL`.
     * `tmdb.js` and `AppContext.jsx` consume `client/src/lib/apiClient.js`.

## Verification Commands & Output

Command:
```bash
cd client && npm test
```

Output:
```
> client@0.0.0 test
> node --test

✔ getHeroTrailerMode handles all environment flag cases (1.9217ms)
✔ native trailer retry resets error state, increments retryNonce, and replays without scroll (9.6559ms)
✔ VITE_HERO_TRAILER_MODE supports native, section, and hybrid semantics (3.0585ms)
✔ apiClient.js normalizes base URLs correctly (1.7446ms)
✔ buildApiUrl constructs clean paths and prevents duplicated /api/api (0.5122ms)
✔ apiClient exports configured Axios instance and fetch wrapper (0.1992ms)
✔ tmdb.js consumes lib/apiClient.js (9.2683ms)
✔ AppContext.jsx consumes lib/apiClient.js (1.9166ms)
...
ℹ tests 85
ℹ suites 0
ℹ pass 85
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1484.7997
```
