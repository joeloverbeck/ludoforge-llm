# FITLGOLT4-007: Add Coverage for `afterGrants` Without Emitted Grants

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Test-only (expected no production logic change unless bug found)
**Deps**: archive/tickets/FITLGOLT4-002.md

## Problem

`effectTiming: afterGrants` includes a fallback behavior where effects execute immediately when no free-operation grants are emitted for the event. This path is implemented but currently not explicitly covered by targeted tests.

## Assumption Reassessment (2026-02-25)

1. Current logic releases deferred effects immediately when `effectTiming` is `afterGrants` and extracted grant batch ids are empty.
2. Existing integration tests cover deferred, explicit-before, omitted timing, multi-grant, and branch override scenarios.
3. No current test directly asserts the zero-grant fallback behavior.

## Architecture Check

1. Locking this invariant with tests makes timing semantics robust against future refactors.
2. Test remains engine-agnostic and uses synthetic GameDef fixtures only.
3. No compatibility behavior added; this validates current strict semantics.

## What to Change

### 1. Add explicit zero-grant fallback test

Extend `event-effect-timing.test.ts` with a case where:
- Event side (or branch) sets `effectTiming: afterGrants`
- Side has effects but no free-operation grants
- Effects execute immediately at event move time

### 2. Optionally add a branch-specific no-grant variant

If practical, add branch-level `afterGrants` with no grants to lock branch override + fallback interaction.

## Files to Touch

- `packages/engine/test/integration/event-effect-timing.test.ts` (modify)

## Out of Scope

- Event data YAML changes
- Trace lifecycle enhancement (FITLGOLT4-006)
- Deferred actor validation hardening (FITLGOLT4-005)

## Acceptance Criteria

### Tests That Must Pass

1. New test proves `afterGrants` + zero grants executes immediately.
2. Existing event timing integration tests continue to pass.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `afterGrants` defers only when there are actual grant batches to wait on.
2. Timing behavior stays deterministic across repeated runs.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/event-effect-timing.test.ts` — add explicit no-grant fallback assertion.

### Commands

1. `pnpm turbo build --filter @ludoforge/engine`
2. `node --test "packages/engine/dist/test/integration/event-effect-timing.test.js"`
3. `pnpm -F @ludoforge/engine test`
