# ENGINEAGNO-007: Consolidate Duplicate Replay Helpers Across Test Suites

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: No kernel semantic change; test architecture consolidation
**Deps**: ENGINEAGNO-004, ENGINEAGNO-005, ENGINEAGNO-006

## Problem

Replay helper logic remains duplicated in some suites (for example tournament e2e local `replayTrace`). This duplicates semantics, diagnostics, and maintenance burden, and risks divergence as replay tooling evolves.

To keep architecture clean and extensible for many `GameSpecDoc` games, replay behavior should come from one shared game-agnostic harness.

## What to Change

1. Replace remaining local replay helper implementations in tests with shared replay harness utilities.
2. Keep per-suite assertions but remove duplicated replay plumbing.
3. Standardize replay diagnostics usage (key vars, strictness mode, expected hash checks) across migrated suites.
4. Ensure no game-specific replay logic is introduced into shared helpers.

## Invariants

1. Replay execution semantics are centralized in one shared helper path.
2. Existing deterministic assertions (state hashes, per-step legality checks) remain preserved.
3. Test suites remain readable: domain assertions local, replay mechanics shared.
4. No regression in game-agnostic behavior or Texas-specific assertions.

## Tests

1. E2E: migrated suites (including tournament replay checks) pass unchanged behavioral assertions.
2. Unit/Integration regression: replay-related suites continue to pass with shared harness.
3. Determinism regression: replayed traces still match expected state hashes and final-state checks.
