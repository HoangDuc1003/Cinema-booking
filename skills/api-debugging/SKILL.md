---
name: api-debugging
description: Diagnose NitroCine Express endpoints, middleware ordering, authentication, MongoDB/Redis connectivity, Stripe webhooks, TMDB calls, and client API consumption. Use when an API fails, hangs, returns stale data, or behaves differently locally and on Vercel.
---

# Debug APIs End to End

1. Reproduce with the smallest request and record method, path, status, and response body without secrets.
2. Trace route registration and middleware order. Stripe raw-body handling must precede `express.json()`.
3. Separate auth, validation, connection, query, external API, serialization, and client-display failures.
4. Inspect logs and dependency health; never log tokens, signatures, URLs with credentials, or payment data.
5. Verify environment variable names by presence only.
6. Check serverless-specific issues: duplicate exports, top-level async work, cached broken promises, and unavailable process state.
7. Add a focused regression test or diagnostic script after finding the cause.

Return the root cause with evidence, affected paths, minimal remediation, and verification commands. Do not implement a fix when the request is diagnosis-only.
