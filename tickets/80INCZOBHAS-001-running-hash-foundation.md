# 80INCZOBHAS-001: Running Hash Foundation — GameState Field, Helpers, and EffectEnv Threading

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel types, zobrist helpers, effect context, initial state, state-draft
**Deps**: Spec 78 (Draft State, completed)

## Problem

`computeFullHash` recomputes the entire Zobrist hash on every `applyMove` call,
iterating all ~110 features (Texas Hold'em) or ~500+ features (FITL). Most
features do not change between moves. This ticket lays the foundation for
incremental updates by adding a `_runningHash` field to `GameState`, creating
mutable-state hash-update helpers, and ensuring the `ZobristTable` is accessible
from effect handlers.

## Assumption Reassessment (2026-03-24)

1. `GameState` is defined in `packages/engine/src/kernel/types-core.ts` (~line 857) — confirmed.
2. `MutableGameState` is `Mutable<GameState>` in `packages/engine/src/kernel/state-draft.ts` (~line 19) — confirmed; adding a field to `GameState` automatically makes it writable on `MutableGameState`.
3. `EffectEnv` is defined in `packages/engine/src/kernel/effect-context.ts` (~line 179) and already has a `cachedRuntime?: GameDefRuntime` field — confirmed.
4. `GameDefRuntime` already carries `zobristTable: ZobristTable` — confirmed via `cachedRuntime?.zobristTable` usage in `apply-move.ts`.
5. `updateHashFeatureChange` and `updateHashTokenPlacement` already exist in `zobrist.ts` (~lines 190–211) but operate on plain `bigint` return values, not on `MutableGameState._runningHash` in place — confirmed.
6. `initialState()` in `initial-state.ts` already calls `computeFullHash` and sets `stateHash` — confirmed (~line 116).
7. `createMutableState()` in `state-draft.ts` shallow-clones GameState — confirmed; `_runningHash` (a bigint primitive) will be writable on the mutable copy without special handling.

## Architecture Check

1. **Option B** (access via `EffectEnv.cachedRuntime.zobristTable`) is chosen over adding a new field to `EffectEnv`. This avoids widening the `EffectEnv` interface and leverages an existing threading path. All call sites in `apply-move.ts` already pass `cachedRuntime`.
2. `_runningHash` is a kernel-internal optimization field — not game-specific, not exposed in GameDef or GameSpecDoc. Engine-agnosticism preserved.
3. No backwards-compatibility shims. The `_runningHash` field is added cleanly alongside `stateHash`.

## What to Change

### 1. Add `_runningHash` to `GameState`

In `types-core.ts`, add `readonly _runningHash: bigint` to the `GameState` interface. This is the incrementally maintained Zobrist hash, set at initial state creation and updated by effect handlers.

### 2. Create Mutable-State Hash-Update Helpers

In `zobrist.ts`, add three helper functions that operate on `MutableGameState` in place:

- `updateRunningHash(state, table, oldFeature, newFeature)` — XOR out old, XOR in new.
- `addToRunningHash(state, table, feature)` — XOR in a new feature (token created).
- `removeFromRunningHash(state, table, feature)` — XOR out a removed feature (token destroyed).

These wrap the existing `zobristKey` function. They mutate `state._runningHash` directly (valid within the Spec 78 mutable-state scope).

### 3. Seed `_runningHash` in `initialState()`

In `initial-state.ts`, after calling `computeFullHash`, set both `stateHash` and `_runningHash` to the computed hash value.

### 4. Propagate `_runningHash` Through State Copies

In `state-draft.ts`, ensure `createMutableState` copies `_runningHash` (it will, since it's a shallow clone of GameState, but verify). In `freezeState`, no change needed (type-cast only).

### 5. Update Schema Artifacts (if applicable)

Check if `GameState` is reflected in any JSON Schema under `packages/engine/schemas/`. If `_runningHash` should be excluded from serialized state (it's internal), add an exclusion note.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — add `_runningHash` to `GameState`)
- `packages/engine/src/kernel/zobrist.ts` (modify — add 3 mutable-state helpers)
- `packages/engine/src/kernel/initial-state.ts` (modify — seed `_runningHash`)
- `packages/engine/src/kernel/state-draft.ts` (verify — may need no change if shallow clone covers it)
- `packages/engine/src/kernel/apply-move.ts` (modify — pass `_runningHash: 0n` in any intermediate state construction that creates a fresh GameState, e.g. for `advanceToDecisionPoint` scratch states)

## Out of Scope

- Modifying any effect handlers (tickets 002–005).
- Replacing `computeFullHash` in `applyMoveCore` (ticket 006).
- Adding verification mode or new tests beyond unit tests for the helpers (ticket 007).
- Changing `EffectEnv` interface (using Option B via `cachedRuntime`).
- Runner package changes.
- JSON Schema artifact changes (if `_runningHash` is not serialized).

## Acceptance Criteria

### Tests That Must Pass

1. **Unit test**: `updateRunningHash` produces `hash ^ zobristKey(old) ^ zobristKey(new)` for known features.
2. **Unit test**: `addToRunningHash` produces `hash ^ zobristKey(feature)`.
3. **Unit test**: `removeFromRunningHash` produces `hash ^ zobristKey(feature)`.
4. **Unit test**: `initialState()` returns a state where `_runningHash === stateHash`.
5. Existing suite: `pnpm -F @ludoforge/engine test` — all existing tests pass (no regressions).
6. Existing suite: `pnpm turbo typecheck` — no type errors.

### Invariants

1. `GameState._runningHash` is always a `bigint`.
2. After `initialState()`, `state._runningHash === state.stateHash`.
3. `MutableGameState._runningHash` is writable (mutable).
4. No existing test behavior changes — `stateHash` values remain identical.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/zobrist-incremental-helpers.test.ts` — unit tests for the 3 new helper functions.
2. `packages/engine/test/unit/kernel/initial-state-running-hash.test.ts` — verify `_runningHash` is seeded correctly.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
