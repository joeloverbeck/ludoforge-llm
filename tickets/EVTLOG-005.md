# EVTLOG-005: Deduplicate optionalPlayerId helper across model files

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The `optionalPlayerId` helper function is defined independently in two files within the same `model/` directory:

- `packages/runner/src/model/trace-projection.ts:101-106`
- `packages/runner/src/model/translate-effect-trace.ts:361-366`

Both implementations are identical: accept `number | undefined`, return `{}` or `{ playerId }`. This is a minor DRY violation — the function is trivial, but having two copies in the same directory creates ambiguity about which is canonical.

## Assumption Reassessment (2026-02-20)

1. `trace-projection.ts` uses `optionalPlayerId` at lines 32, 43, 83.
2. `translate-effect-trace.ts` uses `optionalPlayerId` at lines 56, 151, 164, 186, 197.
3. Both functions have identical signatures and return types: `(playerId: number | undefined) => { readonly playerId?: number }`.
4. Neither function is exported — both are module-private.

## Architecture Check

1. Extracting to a shared utility is the natural approach since both files are in `model/`. The function fits alongside other shared model concerns.
2. No game-specific logic — `optionalPlayerId` is a generic object-construction helper.
3. No backwards-compatibility concerns — both call sites switch to a single import.

## What to Change

### 1. Export `optionalPlayerId` from one canonical location

Choose one of:
- **Option A**: Export from `trace-projection.ts` (already has it) and import into `translate-effect-trace.ts`. Simplest change.
- **Option B**: Create a small `packages/runner/src/model/model-utils.ts` for shared model helpers. More extensible if other helpers emerge.

Recommendation: **Option A** — minimal change, and `trace-projection.ts` is already the lower-level module that `translate-effect-trace.ts` imports.

### 2. Remove the duplicate from `translate-effect-trace.ts`

Delete the local `optionalPlayerId` function definition and add it to the import from `./trace-projection.js`.

## Files to Touch

- `packages/runner/src/model/trace-projection.ts` (modify — export `optionalPlayerId`)
- `packages/runner/src/model/translate-effect-trace.ts` (modify — remove local copy, import from trace-projection)

## Out of Scope

- Creating a general-purpose utility module
- Changing the function's signature or behavior
- Deduplicating other helpers

## Acceptance Criteria

### Tests That Must Pass

1. `translate-effect-trace.test.ts` — all existing tests pass unchanged.
2. `trace-projection.test.ts` — all existing tests pass unchanged.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Exactly one definition of `optionalPlayerId` exists in the runner codebase.
2. The function remains a pure, side-effect-free helper.

## Test Plan

### New/Modified Tests

None — existing tests already exercise both call sites through their respective public APIs. The extraction is a pure refactor with no behavior change.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
