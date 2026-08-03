# Technical Context & Findings (Updated)

## Project Summary
NitroCine application at `e:/NitroCine`.
- Frontend: `client/` (React/Vite)
- Backend: `server/` (Express/MongoDB/Redis)

## Invariants & Rules
- `AGENTS.md` at root and `client/src/components/hero/AGENTS.md`.
- No YouTube iframe, YouTube Player API, ReactPlayer, TMDB video lookup in Hero flow.
- Hero media outcome: exactly one native HTML5 video trailer or poster fallback.
- Audio consent & volume rules.
- Mandatory test integrity rules.

## Strict Implementation Constraints (Follow-up 2026-08-02T16:21:03Z)
1. **Unified API URL**: Shared frontend API config module, normalized `VITE_BASE_URL` (trim whitespace, strip trailing slashes, prevent `/api/api` duplication). Repo-wide check for hardcoded/duplicate endpoints.
2. **Manual Mode Semantics**: Explicit `configuredMode` vs `effectiveMode`. Bypass auto-rotation batches, return exact 5 saved movie IDs in order with native trailer metadata. Add non-sensitive diagnostic `meta` output. Atomic save + Redis/server cache invalidation + ETag update. Validation error on missing/invalid movie IDs during Save. Admin UI separate sections: "Currently live on Home" vs "Manual selection".
3. **Native Video Preservation**: Retain `heroVideoUrl`, `heroVideoStatus`, `heroVideoMimeType`, `nativeVideoValid`, poster/backdrop metadata.
4. **Trailer Feature Flag Contract**: `VITE_HERO_TRAILER_MODE` (`native`, `section`, `hybrid`). Default is `hybrid`.
5. **Retry Implementation**: Reset error state, increment retry attempt/nonce, call `video.load()`, `video.play()`, preserve movie index & avoid scrolling/navigation.
6. **Backend Environment Verification**: Admin mutation & public Hero endpoints must return matching non-sensitive backend identity metadata (environment, buildSha, version).
7. **E2E Retry Scenario**: 1st play attempt rejects -> retry click -> 2nd play attempt success without scroll/navigation.
