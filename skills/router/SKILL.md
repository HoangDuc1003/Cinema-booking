---
name: router
description: Route NitroCine repository work to the smallest relevant repo-local skill. Use for broad, ambiguous, or cross-cutting requests that may involve repository discovery, architecture, Redis, booking races, performance, API failures, security, or regression testing.
---

# Route Repository Work

1. Read the request and inspect only enough repository context to classify it.
2. Select the smallest set of skills below; order discovery before implementation and verification last.
3. State the selected skills and why before acting.
4. Avoid loading every skill for a narrow task.

| Signal | Skill |
|---|---|
| Unknown ownership, entry point, or dependency path | `$repo-map` |
| Boundary, data-flow, deployment, or trade-off review | `$architecture-review` |
| Redis clients, keys, TTLs, caching, locks, or health | `$redis-integration` |
| Seat holds, race conditions, idempotency, or double booking | `$booking-concurrency` |
| Slow queries, loops, payloads, or rendering | `$performance-optimization` |
| Failing endpoint, webhook, auth, or integration | `$api-debugging` |
| Secrets, input trust, authz, payment, or abuse controls | `$security-hardening` |
| Tests, concurrency simulation, or release confidence | `$test-and-regression` |

For a Redis-backed booking change, normally use: `$repo-map` → `$architecture-review` → `$redis-integration` → `$booking-concurrency` → `$security-hardening` → `$test-and-regression`.
