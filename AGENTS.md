# NitroCine Agent Guide

## Project boundaries
- `client/`: React/Vite frontend.
- `server/`: Express/MongoDB/Redis backend.
- Do not modify unrelated booking, payment, authentication, or seat logic.

## Mandatory workflow
1. Read the latest HEAD and relevant files before planning.
2. Reproduce the bug before editing.
3. Make the smallest coherent patch.
4. Run focused tests first, then lint/build.
5. Report commands and actual outputs.
6. Never claim runtime behavior from static code inspection alone.

## Test integrity
- Do not change tests merely to match the implementation.
- Do not manually add production CSS classes in E2E tests.
- Do not hang a media request and claim playback succeeded.
- Runtime media tests must prove `currentTime` advances.

## Change discipline
- Reuse existing files and abstractions.
- Do not create duplicate helpers, controllers, hooks, or routes.
- Remove temporary scripts and generated diagnostics before completion.
- Do not add dependencies unless existing code cannot solve the problem.

## Security
- Never commit credentials.
- Validate all client-supplied URLs and media metadata server-side.
- Keep secrets in environment variables.

## High-risk areas
- Changes under `client/src/components/hero/` must follow the nearest `AGENTS.md`.
- The Hero background is native video or poster only.
