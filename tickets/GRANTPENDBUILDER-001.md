# GRANTPENDBUILDER-001: Consolidate pending free-operation grant builder

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — kernel grant construction helper extraction
**Deps**: archive/tickets/INVGRANTSHAPDUP-001.md

## Problem

`toPendingFreeOperationGrant` construction is duplicated in three kernel sites:

1. `packages/engine/src/kernel/turn-flow-eligibility.ts`
2. `packages/engine/src/kernel/free-operation-viability.ts`
3. Inline construction in `packages/engine/src/kernel/effects-turn-flow.ts`

`archive/tickets/INVGRANTSHAPDUP-001.md` verified that all three sites build the same pending-grant shape. Leaving them split is a DRY violation and creates avoidable contract drift risk when the pending grant surface evolves.

## Assumption Reassessment (2026-04-08)

1. The duplication is real, not merely similar-looking code — confirmed by field-by-field comparison in `archive/tickets/INVGRANTSHAPDUP-001.md`
2. `grant-lifecycle.ts` is not the narrowest safe extraction target — confirmed by the live module graph because `grant-lifecycle.ts` and `free-operation-viability.ts` already depend on each other
3. A neutral helper module can own the contract-to-pending transformation without introducing game-specific logic or compatibility shims

## Architecture Check

1. Extracting one authoritative builder into a neutral helper module is cleaner than leaving three copies or forcing the logic into a cycle-prone module
2. The helper remains fully game-agnostic: it transforms a generic `TurnFlowFreeOperationGrantContract` into a generic `TurnFlowPendingFreeOperationGrant`
3. The migration updates all three owned callers in one change, introducing no compatibility wrappers, alias paths, or dual-authority surfaces

## What to Change

### 1. Extract a shared pending-grant builder

Create a narrow kernel helper module that owns the contract-to-pending transformation currently duplicated across the three sites. The helper should accept the already-resolved values each caller legitimately owns, including `grantId`, `sequenceBatchId`, optional resolved `executionContext`, and caller-specific resolved overrides for `seat`, `executeAsSeat`, and `zoneFilter` when needed.

### 2. Migrate all three callers atomically

Update:

1. `packages/engine/src/kernel/turn-flow-eligibility.ts`
2. `packages/engine/src/kernel/free-operation-viability.ts`
3. `packages/engine/src/kernel/effects-turn-flow.ts`

All three callers must use the shared builder. Delete the two local helpers and replace the inline object construction.

### 3. Prove behavior is unchanged

Run the narrowest engine verification that exercises the touched files and confirms there is no contract drift from the extraction.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/src/kernel/` helper module for pending grant construction (new)
- `packages/engine/src/kernel/index.ts` (modify only if the new helper belongs on the public kernel export surface)
- Touched-area engine tests that best prove non-regression (modify if needed)

## Out of Scope

- Changing grant lifecycle semantics
- Moving the helper into `grant-lifecycle.ts` as part of a broader dependency-graph refactor
- Any broader grant authority split beyond this construction deduplication

## Acceptance Criteria

### Tests That Must Pass

1. Focused engine verification for the touched grant-construction path
2. Existing suite: `pnpm -F @ludoforge/engine test`
3. Existing suite: `pnpm -F @ludoforge/engine build`

### Invariants

1. Exactly one authoritative pending-grant builder remains for this contract-to-pending transformation
2. The extraction introduces no import cycle, compatibility wrapper, or behavior change in pending grant construction

## Test Plan

### New/Modified Tests

1. Reuse existing touched-area engine tests if they already cover the three call sites; add focused coverage only if the extraction lacks proof through current tests

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
