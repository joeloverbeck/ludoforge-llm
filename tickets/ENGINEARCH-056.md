# ENGINEARCH-056: Restore strict endpoint/value coupling for batched scoped-var writes

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel scoped-var write contract tightening + tests
**Deps**: none

## Problem

`writeScopedVarsToState` introduced a broad write item contract (`endpoint: RuntimeScopedVarEndpoint`, `value: VariableValue`) that can represent invalid combinations (for example `zone` endpoint with boolean value). This weakens compile-time guarantees for int-only zone variable writes and risks contract drift in future call sites.

## Assumption Reassessment (2026-02-26)

1. `zoneVars` are int-only by architecture and schema/validation contracts; runtime zone write paths should not accept boolean payloads.
2. Current `ScopedVarWrite` in `scoped-var-runtime-access.ts` no longer couples endpoint scope to value type.
3. Current runtime implementation still casts zone writes via `as number`, so compile-time invalid combinations are not prevented at the batched helper boundary.
4. **Mismatch + correction**: batched write contracts must preserve strict scope/value coupling (`zone -> number`, `global|pvar -> VariableValue`) exactly like single-write expectations.

## Architecture Check

1. Tight endpoint/value coupling is cleaner and more robust than permissive unions because invalid write shapes become unrepresentable.
2. This is kernel-internal and game-agnostic; it does not introduce game-specific rules into GameDef or simulator logic.
3. No backwards-compatibility shims/aliases are introduced.

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
