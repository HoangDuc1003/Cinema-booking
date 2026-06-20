---
name: redis-integration
description: Implement and review Redis in NitroCine for environment-based connection reuse, cache-aside reads, key naming, TTL policy, invalidation, distributed locks, seat holds, idempotency, and health checks. Use whenever Redis configuration, caching, coordination, or Redis incidents are involved.
---

# Integrate Redis Safely

1. Read the URL only from `REDIS_URL`; never print credentials or commit real environment files.
2. Reuse one client and one in-flight connection promise across warm serverless invocations.
3. Keep a central key factory and TTL policy. Prefix keys with `REDIS_KEY_PREFIX` and a schema version.
4. Implement cache-aside reads with JSON serialization, bounded TTLs, and graceful cache bypass when Redis is unavailable.
5. Invalidate after successful source-of-truth writes. Use `SCAN`, never blocking `KEYS`, for pattern invalidation.
6. Acquire locks with `SET key token NX PX ttl`; release only through a compare-and-delete Lua script.
7. Treat Redis locks as contention control, not the only correctness layer.
8. Give seat holds an explicit TTL and retain a durable uniqueness invariant in MongoDB.
9. Mark webhook events idempotent only after successful processing; use a short processing lock to prevent concurrent handlers.
10. Expose health without leaking the Redis URL.

Document every key, value shape, TTL, producer, consumer, and invalidation trigger. Test the Redis-down path as well as the happy path.
