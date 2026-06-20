---
name: performance-optimization
description: Measure and optimize NitroCine server queries, cache behavior, response work, client rendering, and collection algorithms. Use for latency, throughput, render churn, nested loops, repeated array scans, cache hit rate, or performance regression work.
---

# Optimize Performance

1. Identify the hot path and establish a before/after measure or complexity argument.
2. Remove repeated linear scans by building `Set` or `Map` once per input version.
3. Use `.lean()`, field selection, indexes, and bounded queries for read-heavy Mongoose paths.
4. Cache only stable, expensive reads; choose TTL from freshness needs and define invalidation first.
5. Memoize derived React collections and callbacks only where they reduce actual repeated work.
6. Avoid `JSON.stringify` equality checks on polling hot paths when a normalized set comparison suffices.
7. Preserve correctness before reducing latency, especially in booking inventory.
8. Run syntax, tests, lint/build, and a focused benchmark or concurrency simulation.

Report the old and new complexity, expected operational effect, cache trade-offs, and measurement limitations.
