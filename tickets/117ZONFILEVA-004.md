# 117ZONFILEVA-004: Remove dead catch blocks and error wrapper

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel legal-moves, apply-move, turn-flow-error
**Deps**: `archive/tickets/117ZONFILEVA-002.md`

## Problem

After tickets 002 and 003, `evaluateZoneFilterForMove()` and all its callers use the result type. The `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` error is no longer thrown by any migrated path. Two downstream catch blocks in `legal-moves.ts` and `apply-move.ts` that caught this error are now dead code. The error factory `freeOperationZoneFilterEvaluationError()` and its error code in `turn-flow-error.ts` are also unreferenced.

## Assumption Reassessment (2026-04-07)

1. `legal-moves.ts:686` catches `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` from `resolveStrongestRequiredFreeOperationOutcomeGrant()` — confirmed. After ticket 002, `doesGrantAuthorizeMove()` handles zone-filter results internally; this error can no longer propagate.
2. `apply-move.ts:542` catches `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` and re-throws — confirmed. Same reasoning: the error no longer propagates.
3. `freeOperationZoneFilterEvaluationError()` in `turn-flow-error.ts` at lines 42-68 — confirmed. Factory function and `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` type constant at line 4.
4. No other code path references `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` outside the 8 sites in the spec evidence table — confirmed via grep. All other sites will have been migrated by tickets 002-003.

## Architecture Check

1. Removing dead code aligns with Foundation 14 (No Backwards Compatibility) — no compatibility shims or dead catch blocks left behind.
2. The error code removal is safe only after all catch sites are migrated — this ticket's dependency on 003 enforces that ordering.
3. Before removing, grep for `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` to confirm zero remaining references in source files. Test files are handled in ticket 005.

## What to Change

### 1. Remove dead catch block in `legal-moves.ts`

At line 686, remove the `if (isTurnFlowErrorCode(error, 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED'))` branch. The surrounding try-catch may still be needed for other error types — preserve the try-catch structure, just remove the dead branch.

### 2. Remove dead catch clause in `apply-move.ts`

At line 542, remove the `if (isTurnFlowErrorCode(err, 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED'))` branch. Same guidance: preserve the surrounding try-catch, remove only the dead clause.

### 3. Remove `freeOperationZoneFilterEvaluationError()` and error code

In `turn-flow-error.ts`:
- Remove the `freeOperationZoneFilterEvaluationError()` factory function (lines 42-68).
- Remove `'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED'` from the `TurnFlowErrorCode` type (line 4).
- Remove associated imports (e.g., `FreeOperationZoneFilterErrorInput` if it becomes unused).

**Pre-removal verification**: Grep for `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` and `freeOperationZoneFilterEvaluationError` across all source files (excluding test files, which are ticket 005). Confirm zero matches before deleting.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify — remove dead catch branch at line 686)
- `packages/engine/src/kernel/apply-move.ts` (modify — remove dead catch clause at line 542)
- `packages/engine/src/kernel/turn-flow-error.ts` (modify — remove error factory, error code, and associated types)

## Out of Scope

- Migrating test assertions that check for the error code (ticket 005)
- Changing `shouldDeferFreeOperationZoneFilterFailure()` logic
- Any changes to the result type definition (ticket 001)

## Acceptance Criteria

### Tests That Must Pass

1. Grep for `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` in `packages/engine/src/` returns zero matches.
2. Grep for `freeOperationZoneFilterEvaluationError` in `packages/engine/src/` returns zero matches.
3. Existing suite: `pnpm turbo test --force` — note: test files still reference the error code and will fail until ticket 005 migrates them. Run `pnpm turbo typecheck` and `pnpm turbo build` as the primary verification. Full test suite pass is deferred to ticket 005.

### Invariants

1. `TurnFlowErrorCode` no longer includes `'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED'`.
2. No source file in `packages/engine/src/` references the removed error code or factory.

## Test Plan

### New/Modified Tests

1. No new tests — this is dead code removal. Test assertion migration is ticket 005.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo typecheck`
3. `grep -r 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED' packages/engine/src/` — expect zero matches
