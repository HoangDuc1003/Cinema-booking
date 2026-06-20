---
name: security-hardening
description: Audit and harden NitroCine secrets, environment configuration, authentication, authorization, input validation, booking prices, Stripe webhooks, error responses, and abuse controls. Use for security reviews or changes touching payments, booking, admin APIs, or external credentials.
---

# Harden Security

1. Search tracked files for credential patterns; report exposure without echoing values.
2. Keep secrets server-side and document placeholders only in `.env.example`.
3. Validate and normalize every untrusted route parameter and body field.
4. Derive booking prices and user identity server-side; never trust client totals or user IDs.
5. Verify Stripe signatures against the raw body and make callbacks idempotent.
6. Enforce ownership on pay, cancel, and read operations; enforce admin authorization on mutations.
7. Avoid returning stack traces, provider errors, connection strings, or internal identifiers unnecessarily.
8. Review CORS and origin-derived redirect URLs against an allowlist for production.
9. Add rate limiting or note it as follow-up when endpoints are abuse-sensitive.
10. Verify failure behavior for missing or unavailable Redis because security invariants must not depend solely on it.

Prioritize exploitable findings and keep remediation scoped. Re-run secret scanning and regression tests before handoff.
