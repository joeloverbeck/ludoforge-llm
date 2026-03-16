# 62MCTSSEAVIS-006: Observability Baseline Run

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test execution and analysis only
**Deps**: 62MCTSSEAVIS-003, 62MCTSSEAVIS-004, 62MCTSSEAVIS-005

## Problem

Before implementing decision nodes, we need a baseline: run FITL MCTS fast tests with the visitor enabled to record what crashes, what gets dropped, and where template completion fails. This data guides tuning in later tickets.

## What to Change

### 1. Wire ConsoleVisitor into FITL MCTS fast tests

Enable visitor in the test helper config for all 10 FITL scenarios.

### 2. Run and record output

Execute fast test suite. Capture visitor output. Document:
- Which scenarios crash and at what point
- How many templates are dropped and why
- Whether `applyMoveFailure` events cluster on specific actions
- Pool utilization

### 3. Write analysis summary

Create a brief analysis doc (or comments in test file) capturing the baseline state before decision node work begins.

## Files to Touch

- `packages/engine/test/integration/fitl-mcts-*.test.ts` or equivalent (modify — enable visitor)
- Test execution output (analysis artifact, not committed)

## Out of Scope

- Fixing any crashes or failures discovered (that's Phase 2+)
- Decision node implementation
- CI workflow changes
- Runner integration
- Any changes to production MCTS source code

## Acceptance Criteria

### Tests That Must Pass

1. Tests run to completion (may have expected failures in scenarios — the point is observability, not pass/fail)
2. Visitor events are emitted and captured — `searchStart` and `searchComplete` (or crash) appear in output
3. `templateDropped` events are captured with reasons
4. Existing passing tests still pass: `pnpm -F @ludoforge/engine test`

### Invariants

1. No production source code changes in this ticket
2. Baseline data is observational — no tuning or behavioral changes
3. Existing test expectations unchanged

## Test Plan

### Commands

1. `RUN_MCTS_FITL_E2E=1 pnpm -F @ludoforge/engine test:e2e` (with visitor enabled)
2. `pnpm -F @ludoforge/engine test` (regression check)
