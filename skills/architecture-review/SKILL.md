---
name: architecture-review
description: Review NitroCine architecture, service boundaries, data ownership, failure modes, serverless behavior, and consistency trade-offs. Use for design reviews and before cross-cutting changes to booking, payment, caching, or external integrations.
---

# Review Architecture

1. Establish the source of truth for every datum. MongoDB must own booking correctness; Redis may accelerate or coordinate it.
2. Draw the read path, write path, invalidation path, and recovery path.
3. Check atomic boundaries across Show, Booking, seat reservations, Stripe, and Redis.
4. Classify each dependency failure as fail-open, fail-closed, retryable, or degraded.
5. Review serverless constraints: warm singleton reuse, connection storms, no durable process memory, and request timeouts.
6. Record trade-offs and migration compatibility before proposing large structural changes.

Require durable invariants for money and inventory. Never rely on cache eviction, a process-local mutex, or Redis alone to prevent double booking. Prefer small services with explicit key factories and invalidation helpers over cache calls scattered through controllers.

Return findings by severity, then a recommended design and a proportional verification plan.
