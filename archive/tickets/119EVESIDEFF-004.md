# 119EVESIDEFF-004: Remove resolve function exports and migrate test files

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel exports and test migration
**Deps**: `archive/tickets/119EVESIDEFF-003.md`

## Problem

`resolveEventFreeOperationGrants` and `resolveEventEligibilityOverrides` are still exported from `event-execution.ts` but no longer have source-code consumers after ticket 003. Two test files directly import them. Per Foundation 14, unused exports must be removed and tests migrated in the same change.

## Assumption Reassessment (2026-04-08)

1. `resolveEventFreeOperationGrants` is exported at `event-execution.ts:624-634` — confirmed.
2. `resolveEventEligibilityOverrides` is exported at `event-execution.ts:636-648` — confirmed.
3. After ticket 003, no source file imports these functions — only 2 test files:
   - `packages/engine/test/integration/fitl-events-1968-nva.test.ts` (imports `resolveEventEligibilityOverrides`)
   - `packages/engine/test/unit/kernel/event-execution-targets.test.ts` (imports both)
4. Both functions are re-exported from the kernel barrel (`packages/engine/src/kernel/index.ts`) — confirmed. Barrel re-exports must also be removed.

## Architecture Check

1. Removing unused exports reduces API surface and eliminates the dual-path problem (manifest vs. direct resolve). Clean per Foundation 14.
2. Test migration validates the manifest path works correctly for the scenarios these tests covered.
3. No backwards compatibility — exports are removed, not deprecated.

## What to Change

### 1. Remove exports from `event-execution.ts`

Change `resolveEventFreeOperationGrants` and `resolveEventEligibilityOverrides` from `export const` to `const` (or remove them entirely if no internal callers remain after ticket 003). Check whether any internal function in `event-execution.ts` still calls them — if not, they can be deleted since `executeEventMove` now uses the internal helpers directly.

### 2. Remove re-exports from kernel barrel

Remove `resolveEventFreeOperationGrants` and `resolveEventEligibilityOverrides` from the kernel barrel export file.

### 3. Migrate `fitl-events-1968-nva.test.ts`

This test imports `resolveEventEligibilityOverrides` to assert on eligibility overrides for the 1968 NVA event card. Migrate it to:
- Call `executeEventMove` instead
- Assert on `result.sideEffectManifest.overrides` for the same expected values

### 4. Migrate `event-execution-targets.test.ts`

This test imports both `resolveEventFreeOperationGrants` and `resolveEventEligibilityOverrides` to test grant/override extraction for various event cards. Migrate it to:
- Call `executeEventMove` for each test case
- Assert on `result.sideEffectManifest.grants` and `result.sideEffectManifest.overrides`

### 5. Add manifest structure unit test

Add a focused unit test (can be in the migrated `event-execution-targets.test.ts` or a new file) that verifies `executeEventMove` produces a manifest with the expected structure for a representative event card that has all three side-effect types (grants, overrides, and deferred effects).

## Files to Touch

- `packages/engine/src/kernel/event-execution.ts` (modify — remove exports or delete functions)
- `packages/engine/src/kernel/index.ts` (modify — remove re-exports)
- `packages/engine/test/integration/fitl-events-1968-nva.test.ts` (modify)
- `packages/engine/test/unit/kernel/event-execution-targets.test.ts` (modify)

## Out of Scope

- Modifying any other test files — the remaining ~114 event test files do not import the resolve functions
- Adding new public API — the manifest is produced by `executeEventMove` which is already public

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes — no dangling references to removed exports
2. `pnpm -F @ludoforge/engine test` — full engine test suite passes including migrated tests
3. `pnpm turbo lint` passes
4. Migrated tests assert the same behavioral properties as before (grant counts, override targets, deferred effect presence)

### Invariants

1. `resolveEventFreeOperationGrants` and `resolveEventEligibilityOverrides` are no longer in the public API (not exported from kernel barrel)
2. No test file imports either function
3. The manifest path is the sole way to obtain event side-effects outside `event-execution.ts`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-1968-nva.test.ts` — migrated from resolve function to manifest assertions
2. `packages/engine/test/unit/kernel/event-execution-targets.test.ts` — migrated from resolve functions to manifest assertions, plus new manifest structure test

### Commands

1. `pnpm -F @ludoforge/engine test` — full engine test suite
2. `pnpm turbo typecheck` — type safety across packages
3. `pnpm turbo lint` — no new lint violations

## Outcome

- Completed: 2026-04-09
- What changed:
  - Removed `resolveEventFreeOperationGrants` and `resolveEventEligibilityOverrides` from `packages/engine/src/kernel/event-execution.ts`.
  - Replaced the broad `event-execution` barrel re-export in `packages/engine/src/kernel/index.ts` with explicit exports that keep the manifest-era public surface while excluding the removed helpers.
  - Migrated `packages/engine/test/integration/fitl-events-1968-nva.test.ts` and `packages/engine/test/unit/kernel/event-execution-targets.test.ts` to assert through `executeEventMove(...).sideEffectManifest`.
- Deviations from original plan:
  - No material deviation. The manifest structure coverage was satisfied inside the migrated `event-execution-targets` unit surface rather than a separate new test file.
- Verification results:
  - Passed `pnpm -F @ludoforge/engine build`
  - Passed `pnpm turbo typecheck`
  - Passed `pnpm turbo lint`
  - Passed `pnpm -F @ludoforge/engine test`
  - Passed `pnpm run check:ticket-deps`
