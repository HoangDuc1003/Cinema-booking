---
name: repo-map
description: Map NitroCine code ownership, entry points, routes, models, data flows, configuration, and affected files. Use before unfamiliar, cross-cutting, or high-risk repository changes and when asked for a repo map or impact analysis.
---

# Map the Repository

1. Start with `rg --files`, package manifests, entry points, route registration, and environment examples.
2. Trace one request vertically: client caller → route → middleware → controller/service → model/external system.
3. Use `rg` to find all readers and writers of each affected model field, cache key, and endpoint.
4. Inspect `git status` and `git diff`; preserve unrelated user changes.
5. Report a compact tree, ownership table, runtime data flow, and affected-file list before editing.

Treat these as NitroCine anchors:

- `client/src/context/AppContext.jsx`: API client and auth context.
- `client/src/pages/SeatLayout.jsx`: show selection, seat map, polling, and booking.
- `server/api/index.js`: middleware order, webhook body handling, health, and routes.
- `server/controllers/`: HTTP orchestration.
- `server/services/`: reusable integration and domain behavior.
- `server/models/`: MongoDB invariants and indexes.

Flag unknown runtime assumptions, especially MongoDB transaction support, serverless connection reuse, and third-party webhook ordering.
