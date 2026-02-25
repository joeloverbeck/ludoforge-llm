# FITLGOLT4-007: Add Coverage for `afterGrants` Without Emitted Grants

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Test-only (expected no production logic change unless bug found)
**Deps**: archive/tickets/FITLGOLT4-002.md

## Problem

`effectTiming: afterGrants` supports a fallback where event effects execute in the same move when the event emits no pending grant batches. The fallback is implemented in runtime, but there is no targeted assertion that locks this invariant.

## Assumption Reassessment (2026-02-25)

1. Runtime behavior is implemented in `applyTurnFlowEligibilityAfterMove` (`packages/engine/src/kernel/turn-flow-eligibility.ts`): when a deferred candidate has `requiredGrantBatchIds.length === 0`, it is released immediately (not queued).
2. Existing integration tests in `packages/engine/test/integration/event-effect-timing.test.ts` cover: deferred with grant, explicit `beforeGrants`, omitted timing default, multi-grant release, branch timing override, and per-deferred lifecycle ordering.
3. No current test directly asserts `afterGrants` fallback for zero emitted grant batches on either side-only or branch-selected paths.

## Architecture Reassessment

1. Keeping `afterGrants` semantics keyed to emitted grant batches (not merely presence of a grant declaration) is the cleaner architecture: it is deterministic, generic, and avoids special-case behavior.
2. Explicit tests for zero-batch fallback reduce regression risk in turn-flow refactors without introducing game-specific logic.
3. No backward-compat shims or aliases are needed; this ticket codifies current strict behavior.

## Scope (Updated)

1. Add explicit side-level `afterGrants` + zero-batch fallback coverage.
2. Add explicit branch-level `afterGrants` + zero-batch fallback coverage.
3. Keep production code unchanged unless a real runtime bug is discovered.

## What to Change

### 1. Add side-level zero-grant fallback test

Extend `event-effect-timing.test.ts` with a case where:
- Event side sets `effectTiming: afterGrants`
- Side has effects and no free-operation grants
- Effects execute immediately at event move time
- Deferred lifecycle emits `released` + `executed` with no `queued`

### 2. Add branch-level zero-grant fallback test

Add a branch-selected case where:
- Side or branch resolves to `effectTiming: afterGrants`
- Branch contributes effects and no free-operation grants
- Effects execute immediately
- No pending grants/deferred payload remain after move

## Files to Touch

- `packages/engine/test/integration/event-effect-timing.test.ts` (modify)

## Out of Scope

- Event data YAML changes
- Trace lifecycle enhancement (FITLGOLT4-006)
- Deferred actor validation hardening (FITLGOLT4-005)

## Acceptance Criteria

### Tests That Must Pass

1. New test proves side-level `afterGrants` + zero emitted grants executes immediately.
2. New test proves branch-level `afterGrants` + zero emitted grants executes immediately.
3. Existing event timing integration tests continue to pass.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `afterGrants` defers only when there are actual emitted grant batch ids to wait on.
2. Zero-batch `afterGrants` produces immediate release/execute lifecycle behavior.
3. Timing behavior stays deterministic across repeated runs.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/event-effect-timing.test.ts` — add side-level no-grant fallback assertion.
2. `packages/engine/test/integration/event-effect-timing.test.ts` — add branch-level no-grant fallback assertion.

### Commands

1. `pnpm turbo build --filter @ludoforge/engine`
2. `node --test "packages/engine/dist/test/integration/event-effect-timing.test.js"`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint --filter @ludoforge/engine`

## Outcome

- Completion date: 2026-02-25
- What changed:
  - Added explicit side-level `afterGrants` zero-grant fallback coverage in `packages/engine/test/integration/event-effect-timing.test.ts`.
  - Added explicit branch-level `afterGrants` zero-grant fallback coverage in `packages/engine/test/integration/event-effect-timing.test.ts`.
  - Updated FITL integration tests that assumed 2-player initialization to align with current strict FITL player-count contract (`[4,4]`) and made related assertions/setup robust (notably turn-order setup and momentum expectation logic).
- Deviations from original plan:
  - The ticket originally scoped to one integration test file. During mandatory hard-suite verification, unrelated FITL integration failures surfaced due stale assumptions about FITL player count and action availability. These were corrected to restore whole-repo green status before finalization.
- Verification results:
  - `pnpm turbo build --filter @ludoforge/engine` ✅
  - `node --test "packages/engine/dist/test/integration/event-effect-timing.test.js"` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo test` ✅
  - `pnpm turbo lint` ✅
