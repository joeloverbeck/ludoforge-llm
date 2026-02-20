# EVTLOG-005: Deduplicate optionalPlayerId helper across model files

**Status**: ✅ COMPLETED
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

1. `trace-projection.ts` defines and uses a module-private `optionalPlayerId` helper in effect/trigger projection paths.
2. `translate-effect-trace.ts` defines and uses a separate module-private `optionalPlayerId` helper in effect/trigger translation paths.
3. Both functions have identical signatures and return types: `(playerId: number | undefined) => { readonly playerId?: number }`.
4. `translate-effect-trace.ts` already depends on `trace-projection.ts` for projection APIs; introducing additional helper coupling between these modules would be technically possible but architecturally weaker.

## Architecture Check

1. Extracting to a shared utility is the natural approach since both files are in `model/`. The function fits alongside other shared model concerns.
2. No game-specific logic — `optionalPlayerId` is a generic object-construction helper.
3. `trace-projection.ts` should remain focused on projection concerns; using it as a utility host for unrelated shared helpers creates avoidable coupling.
4. No backwards-compatibility concerns — both call sites switch to a single import.

## What to Change

### 1. Export `optionalPlayerId` from one canonical location

Choose one of:
- **Option A**: Export from `trace-projection.ts` (already has it) and import into `translate-effect-trace.ts`. Smallest immediate diff, but couples translation logic to projection internals.
- **Option B**: Create a small `packages/runner/src/model/model-utils.ts` for shared model helpers. Clearer boundaries and better extensibility.

Recommendation: **Option B** — slightly larger diff, but cleaner architecture with explicit shared utility ownership and lower module coupling.

### 2. Remove duplicates from both modules

Delete the local `optionalPlayerId` function definitions and import from `./model-utils.js` in both modules.

## Files to Touch

- `packages/runner/src/model/model-utils.ts` (new — canonical shared helper location)
- `packages/runner/src/model/trace-projection.ts` (modify — remove local copy, import from model-utils)
- `packages/runner/src/model/translate-effect-trace.ts` (modify — remove local copy, import from model-utils)

## Out of Scope

- Creating a general-purpose utility module
- Changing the function's signature or behavior
- Deduplicating other helpers

## Acceptance Criteria

### Tests That Must Pass

1. `translate-effect-trace.test.ts` — all existing tests pass unchanged.
2. `trace-projection.test.ts` — all existing tests pass unchanged.
3. Existing suite: `pnpm -F @ludoforge/runner test`
4. Runner lint/type safety checks: `pnpm -F @ludoforge/runner lint` and `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Exactly one definition of `optionalPlayerId` exists in the runner codebase.
2. The function remains a pure, side-effect-free helper.
3. Model module boundaries remain explicit: shared helpers live in dedicated utility modules rather than feature modules.

## Test Plan

### New/Modified Tests

None — existing tests already exercise both call sites through their respective public APIs. The extraction is a pure refactor with no behavior change.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- **Completion date**: 2026-02-20
- **What changed**:
  - Added `packages/runner/src/model/model-utils.ts` with canonical `optionalPlayerId`.
  - Updated `packages/runner/src/model/trace-projection.ts` to import shared helper and removed local duplicate.
  - Updated `packages/runner/src/model/translate-effect-trace.ts` to import shared helper and removed local duplicate.
  - Added `packages/runner/test/model/model-utils.test.ts` to assert helper invariants directly.
- **Deviation from original plan**:
  - Original recommendation favored Option A (export from `trace-projection.ts`).
  - Implemented Option B instead to keep module boundaries cleaner and avoid coupling translation logic to projection internals.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed (120 files, 929 tests).
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
