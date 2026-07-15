# Client Instructions

## Stack
- React
- Vite
- React Router
- Playwright
- Plain CSS/Tailwind patterns already present in the repository

## Architecture
- Components render UI.
- Hooks own reusable stateful behavior.
- API access stays in services.
- Do not fetch directly from deeply nested presentation components.

## Performance
- Do not preload media for inactive movies.
- Avoid heavyweight player and animation dependencies.
- Abort stale network requests.
- Preserve reduced-motion and save-data behavior.

## UI
- Preserve keyboard access and focus behavior.
- Do not remove accessibility attributes to satisfy tests.
- Reuse existing design tokens and layout patterns.

## Validation
- `npm test`
- `npm run lint`
- `npm run build`
- Run focused Playwright files for changed behavior.
