# 80INCZOBHAS-002: Instrument Variable Effect Handlers with Incremental Hash Updates

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — effects-var.ts, effects-resource.ts
**Deps**: 80INCZOBHAS-001

## Problem

The `setVar`, `addVar`, `transferVar`, and `setActivePlayer` effect handlers
modify hashed state features (globalVar, perPlayerVar, activePlayer) without
updating the running Zobrist hash. After 001 adds the `_runningHash` field and
helpers, these handlers must call the appropriate hash-update helper whenever
they mutate a hashed feature.

## Assumption Reassessment (2026-03-24)

1. `applySetVar()` is in `effects-var.ts` (~line 65) — modifies globalVars or perPlayerVars — confirmed.
2. `applyAddVar()` is in `effects-var.ts` (~line 149) — adds delta to variable value — confirmed.
3. `applySetActivePlayer()` is in `effects-var.ts` (~line 210) — sets `activePlayer` — confirmed.
4. `applyTransferVar()` is in `effects-resource.ts` (~line 174) — transfers between two scoped variable endpoints — confirmed.
5. All handlers receive `env: EffectEnv` and `cursor: EffectCursor` — confirmed.
6. `cursor.tracker` is present when in mutable-state scope (Spec 78) — confirmed.
7. ZobristTable is accessible via `env.cachedRuntime?.zobristTable` — confirmed.
8. ZobristFeature kinds needed: `globalVar`, `perPlayerVar`, `activePlayer` — confirmed in types-core.ts.

## Architecture Check

1. Each handler already has access to the old value before mutation and the new value after. The hash update is a single helper call inserted between reading the old value and writing the new value (or immediately after the write, using the captured old value).
2. Engine-agnosticism preserved — these are generic variable operations, not game-specific.
3. No shims or aliases. Direct insertion of hash-update calls.

## What to Change

### 1. `applySetVar` — Hash Update for globalVar / perPlayerVar

Before the variable is written, capture the old value. After writing, call `updateRunningHash` with the old and new `ZobristFeature`. Guard behind `cursor.tracker && env.cachedRuntime?.zobristTable` (only update when in mutable-state scope with a table available).

Pattern:
```
if (tracker && table) {
  const oldFeature = { kind: 'globalVar', name, value: oldValue };
  const newFeature = { kind: 'globalVar', name, value: newValue };
  updateRunningHash(state, table, oldFeature, newFeature);
}
```

### 2. `applyAddVar` — Hash Update for globalVar / perPlayerVar

Same pattern as setVar. The old value is the current value; the new value is `oldValue + delta`.

### 3. `applyTransferVar` — Hash Update for Two perPlayerVars

Transfer modifies two variables (source and destination). Capture both old values before mutation, then issue two `updateRunningHash` calls.

### 4. `applySetActivePlayer` — Hash Update for activePlayer

Capture old `state.activePlayer`, then after setting the new value, call `updateRunningHash` with `{ kind: 'activePlayer', playerId: old }` and `{ kind: 'activePlayer', playerId: new }`.

## Files to Touch

- `packages/engine/src/kernel/effects-var.ts` (modify — setVar, addVar, setActivePlayer)
- `packages/engine/src/kernel/effects-resource.ts` (modify — transferVar)

## Out of Scope

- Token effect handlers (ticket 003).
- Marker effect handlers (ticket 004).
- Phase/turn-flow handlers (ticket 005).
- Any changes to types-core.ts, zobrist.ts, initial-state.ts (ticket 001).
- Verification mode or switchover (tickets 006–007).
- Runner package changes.

## Acceptance Criteria

### Tests That Must Pass

1. **Unit test**: `setVar` on a global variable updates `_runningHash` such that `_runningHash === computeFullHash(table, resultState)`.
2. **Unit test**: `setVar` on a per-player variable updates `_runningHash` correctly.
3. **Unit test**: `addVar` on a global variable updates `_runningHash` correctly.
4. **Unit test**: `transferVar` updates `_runningHash` for both source and destination variables.
5. **Unit test**: `setActivePlayer` updates `_runningHash` correctly.
6. **Guard test**: When `cachedRuntime` is `undefined`, handlers do not attempt hash updates (no crash).
7. Existing suite: `pnpm -F @ludoforge/engine test` — all existing tests pass.
8. Existing suite: `pnpm turbo typecheck` — no type errors.

### Invariants

1. After any variable effect handler completes, `state._runningHash` reflects the XOR-diff of the changed feature(s).
2. Handlers that do not modify hashed features (e.g., setting a variable to its current value) still produce a correct hash (XOR out + XOR in with same key = no change).
3. No hash update when `cachedRuntime?.zobristTable` is unavailable — graceful degradation.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/zobrist-incremental-vars.test.ts` — tests for setVar, addVar, transferVar, setActivePlayer hash updates.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
