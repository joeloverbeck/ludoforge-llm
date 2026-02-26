# ENGINEARCH-056: Restore strict endpoint/value coupling for batched scoped-var writes

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel scoped-var write contract tightening + tests
**Deps**: none

## Problem

`writeScopedVarsToState` introduced a broad write item contract (`endpoint: RuntimeScopedVarEndpoint`, `value: VariableValue`) that can represent invalid combinations (for example `zone` endpoint with boolean value). This weakens compile-time guarantees for int-only zone variable writes and risks contract drift in future call sites.

## Assumption Reassessment (2026-02-26)

1. `zoneVars` are int-only by architecture and schema/validation contracts; runtime zone write paths should not accept boolean payloads.
2. Current `ScopedVarWrite` in `scoped-var-runtime-access.ts` no longer couples endpoint scope to value type.
3. `writeScopedVarToState`/`writeScopedVarToBranches` expose overloads that preserve strict coupling for single writes, but `writeScopedVarsToState`/`writeScopedVarsToBranches` currently accept `ScopedVarWrite[]` where `value` is always `VariableValue`.
4. Current shared writer implementation still uses `as number` on zone writes; with the broad batched write type this means compile-time invalid combinations are representable until they hit implementation details.
5. **Mismatch + correction**: batched contracts must preserve strict scope/value coupling (`zone -> number`, `global|pvar -> VariableValue`) just like single-write contracts.

## Architecture Check

1. Tight endpoint/value coupling is cleaner and more robust than permissive unions because invalid write shapes become unrepresentable.
2. Keeping coupling at the type boundary is more extensible than relying on internal casts; future call sites get compile-time safety without additional runtime branching.
3. This is kernel-internal and game-agnostic; it does not introduce game-specific rules into GameDef or simulator logic.
4. No backwards-compatibility shims/aliases are introduced.

## What to Change

### 1. Tighten batched write type contracts

Refactor `ScopedVarWrite` (or equivalent helper-level type) so `zone` writes require numeric values at compile time, while `global`/`pvar` retain `VariableValue`.

### 2. Add type-level guard coverage

Expand `scoped-var-runtime-access.test.ts` compile-time assertions to reject `zone`+boolean batched writes and preserve valid combinations.

### 3. Keep runtime behavior unchanged

No semantic behavior changes in effect handlers; this is contract hardening only.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify/add)

## Out of Scope

- New runtime effect features
- GameSpecDoc/GameDef schema behavior changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Batched scoped write types reject invalid `zone` boolean payloads at compile time.
2. Valid batched write combinations across `global`/`pvar`/`zone` compile and run unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Int-only zone variable write contracts remain enforced at helper boundaries.
2. Scoped-var write APIs remain game-agnostic and deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — add compile-time assertions for batched write scope/value coupling.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-26
- **What changed**:
  - Tightened batched scoped write typing in `scoped-var-runtime-access.ts` so invalid `zone`+boolean writes are not representable.
  - Refactored single-write helper APIs to consume `ScopedVarWrite` objects, keeping endpoint/value coupling in one structural unit.
  - Added `toScopedVarWrite(...)` overloaded constructor so broad runtime endpoints are converted through one strict, validated path.
  - Removed cast-based zone write assignment by routing writes through discriminated/guarded shapes.
  - Added compile-time assertions in `scoped-var-runtime-access.test.ts` to lock valid/invalid batched scope/value combinations.
  - Revalidated engine build, targeted unit test, full engine test suite, and engine lint.
- **Deviations from original plan**:
  - Introduced `toScopedVarWrite(...)` as a strict constructor entrypoint for mixed-scope runtime endpoints, instead of widening `ScopedVarWrite` itself; this kept the public write union fully scope-discriminated.
- **Verification**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`291` tests).
  - `pnpm -F @ludoforge/engine lint` passed.
