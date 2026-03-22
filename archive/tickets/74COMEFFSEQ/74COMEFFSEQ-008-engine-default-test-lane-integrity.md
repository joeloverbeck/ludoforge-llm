# 74COMEFFSEQ-008: Engine Default Test Lane Integrity

**Status**: NOT IMPLEMENTED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — engine test runner scripts and test-lane policy coverage
**Deps**: None

## Problem

The engine's default test lane is currently not trustworthy. `pnpm -F @ludoforge/engine test` can fail after a clean build with widespread `MODULE_NOT_FOUND` errors for `dist/test/unit/*.js` paths that the runner attempts to execute but that are not present in `dist/`.

This is test-infrastructure drift, not a compiled-effects bug. Until it is fixed, active tickets that require "existing suite passes" cannot make a truthful completion claim, and the repository loses Foundation 11's guarantee that architecture is proven by automated tests.

## Assumption Reassessment (2026-03-22)

1. `packages/engine/scripts/run-tests.mjs` defines the engine default lane as `['dist/test/unit/**/*.test.js', ...integration-core-dist-paths]`, while integration and e2e lanes are derived explicitly from source inventories in `test-lane-manifest.mjs`. Confirmed.
2. `packages/engine/scripts/test-lane-manifest.mjs` does not currently inventory unit tests. Confirmed, but that alone is not evidence of a bug.
3. The earlier `MODULE_NOT_FOUND` failures that motivated this ticket were reproduced only while `pnpm -F @ludoforge/engine test` was running concurrently with another engine build/typecheck flow that cleaned `packages/engine/dist/` mid-run. Corrected.
4. Sequential verification shows the default lane itself is healthy: `pnpm -F @ludoforge/engine test` passes after a normal build/test run and resolves the expected unit and integration files. Corrected.
5. Because the ticket’s core problem statement was wrong, changing the default lane to a new manifest-backed model would not fix the real issue and would add unnecessary architecture churn. Corrected scope: no implementation should happen under this ticket.

## Architecture Check

1. Rewriting a healthy default lane would violate Foundations 9 and 10 by introducing churn without a real architectural defect.
2. The actual problem was concurrent `dist/` cleanup during test execution, not lane taxonomy. Fixing the wrong layer would be less robust than the current architecture.
3. The clean action is to reject this ticket’s implementation scope and preserve the existing default lane until there is a verified lane-design problem.
4. If concurrency hardening is desired later, it should be scoped as a separate ticket about build/test coordination rather than mislabelled as default-lane integrity.

## What to Change

### 1. Do not modify the engine test runner under this ticket

No code changes should be made under this ticket, because the verified root cause is not a default-lane design bug.

### 2. Correct dependent planning

Any active ticket that references this ticket as a prerequisite for a healthy engine test harness must be corrected to remove that dependency and reflect the actual finding.

## Files to Touch

- `tickets/74COMEFFSEQ-008-engine-default-test-lane-integrity.md` (modify)
- `tickets/74COMEFFSEQ-007-test-suite-and-benchmarks.md` (modify)

## Out of Scope

- Modifying `packages/engine/scripts/run-tests.mjs`
- Modifying `packages/engine/scripts/test-lane-manifest.mjs`
- Adding new lane-policy tests for a problem that does not exist
- Compiled-effects implementation details

## Acceptance Criteria

### Tests That Must Pass

1. Sequential verification confirms `pnpm -F @ludoforge/engine test` passes.
2. This ticket does not change engine scripts or tests.
3. Any dependent active ticket is updated so it no longer assumes a nonexistent default-lane bug.

### Invariants

1. Tickets must be corrected before implementation when investigation disproves their assumptions.
2. No unnecessary architecture churn should be introduced for a misdiagnosed problem.

## Test Plan

### New/Modified Tests

1. No new or modified code tests under this ticket.
2. `tickets/74COMEFFSEQ-007-test-suite-and-benchmarks.md` — remove the incorrect dependency and incorrect harness assumption.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - Investigated the reported default-lane failure and verified the engine default lane is healthy when run sequentially.
  - Corrected `74COMEFFSEQ-007` to remove its dependency on this ticket and to reflect the actual finding.
  - Did not modify engine code or test-runner scripts because the ticket’s implementation premise was wrong.
- Deviations from original plan:
  - The original plan proposed rewriting the default lane around a manifest-backed unit-test inventory.
  - That plan was rejected after verification showed the observed `MODULE_NOT_FOUND` errors were caused by a concurrent build/test race that cleaned `dist/` mid-run, not by a broken default lane.
- Verification results:
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm run check:ticket-deps` passed.
