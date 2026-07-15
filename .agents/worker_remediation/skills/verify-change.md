---
name: verify-change
description: >
  Review a completed repository change before merge. Use when checking Codex
  output, validating a plan implementation, detecting regressions, reviewing
  changed tests, or deciding whether a patch is safe to merge.
---

# Verify Change

1. Identify the real HEAD and base commit.
2. Review the complete diff, not only the agent summary.
3. Compare changes against the nearest AGENTS.md.
4. Check for unrelated files and duplicated abstractions.
5. Review production code before reviewing modified tests.
6. Reject tests that:
   - manually force application state;
   - mock away the behavior being tested;
   - remove assertions to obtain green results.
7. Run focused tests.
8. Run lint and build.
9. Perform runtime verification for user-visible behavior.
10. Return one verdict:
    - approved;
    - approved with minor follow-up;
    - blocked.
