# Execution Plan: Restore NitroCine Hero Native-Only Architecture

## Objective
Restore the NitroCine Hero Native-Only Architecture so that the Hero background has exactly two outcomes: a ready native MP4/WebM video or a poster. Completely remove YouTube fallback from the Home Hero while preserving it in the TrailerSection.

## Milestones & Steps

### Milestone 1: Initial Inspection & Baseline (Phase 1)
- **Action**: Spawn Explorer agent to inspect target files, run baseline build/test/lint/E2E suites.
- **Outputs**:
  - Initial codebase analysis and git status (branch, HEAD, uncommitted files).
  - Baseline execution results (passes, failures, YouTube dependencies, mocked states, etc.).
  - Root-cause report detailing where YouTube enters the Hero path, visual delays, auto-unmuting logic, inactive prefetching, server movie order handling, and fallback behavior.
- **Verification**: Validate baseline report.

### Milestone 2: Failing Invariant Tests (Phase 1)
- **Action**: Spawn Worker agent to write failing invariant tests that prove the existence of regressions on current HEAD.
- **Outputs**:
  - Tests proving YouTube creation/requests, server order reordering, auto-unmute on reveal, and prefetching.
  - Test run reports showing these new tests failing on the current HEAD.
- **Verification**: Verify that the new tests fail as expected.

### Milestone 3: Implement Architectural Changes R1-R4 (Phase 2 & 3)
- **Action**: Spawn Worker agent to implement:
  - **R1**: Remove YouTube completely from the Hero flow. Return null for no native source, treat as valid poster-only state, don't show video error, don't auto-switch.
  - **R2**: Remove arbitrary delays (posterWarmupMs, quarantine, etc.). Native video begins loading muted behind poster immediately. Reveal when: generation is current, active movie source, playing event, readyState >= HAVE_CURRENT_DATA, currentTime advanced, visible, no failures. Raise poster immediately on stall, pause, error, document hidden, etc.
  - **R3**: Autoplay must remain muted. Explicit volume click only to unmute. Stored preference does not automatically unmute.
  - **R3 (Prefetch)**: Remove `preloadRemainingTrailerSources`. Only active movie requests native media. Clear/pause previous video. Keep exactly one active video element.
  - **R4**: Preserve server order exactly. Do not reorder.
  - **API Diagnostics**: Expose `data-catalog-source="server|fallback|mock"`. Assert in E2E tests.
- **Verification**: Invariant tests should now pass. Review code.

### Milestone 4: Test Migration & Rewrite (Phase 3)
- **Action**: Rewrite obsolete YouTube Hero E2E tests into native media tests.
- **Outputs**:
  - Migrate useful scenarios (entry loader, poster safety, stable playback, remasking, movie switching, compact UI) to native tests.
  - Ensure real playable fixture `hero-trailer.mp4` is used and not intercepted/hanging.
- **Verification**: Run focused Playwright E2E suites.

### Milestone 5: Full Verification & Audit (Phase 4)
- **Action**: Run full client unit tests, lint, build, E2E tests, and run Forensic Auditor.
- **Verification**:
  - Verify all 16 items in Definition of Done.
  - Verify Forensic Auditor reports clean status.
