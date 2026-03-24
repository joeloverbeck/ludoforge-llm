# 80INCZOBHAS-004: Instrument Marker Effect Handlers with Incremental Hash Updates

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — effects-choice.ts
**Deps**: 80INCZOBHAS-001

## Problem

Marker effect handlers (`setMarker`, `shiftMarker`, `setGlobalMarker`,
`flipGlobalMarker`, `shiftGlobalMarker`) modify `markerState` and
`globalMarkerState` Zobrist features without updating the running hash.
FITL relies heavily on markers (support/opposition in every space, coup round
markers, global capability markers) — correct incremental hashing for markers
is critical for FITL performance.

## Assumption Reassessment (2026-03-24)

1. `applySetMarker` is in `effects-choice.ts` (~line 1098) — sets marker state at a space within a marker track — confirmed.
2. `applyShiftMarker` is in `effects-choice.ts` (~line 1174) — cycles marker through state lattice — confirmed.
3. `applySetGlobalMarker` is in `effects-choice.ts` (~line 1262) — sets global marker state — confirmed.
4. `applyShiftGlobalMarker` is in `effects-choice.ts` (~line 1309) — cycles global marker — confirmed.
5. `applyFlipGlobalMarker` is in `effects-choice.ts` (~line 1366) — toggles boolean global marker — confirmed.
6. ZobristFeature `markerState` uses `{ kind: 'markerState', spaceId, markerId, state }` — confirmed.
7. ZobristFeature `globalMarkerState` uses `{ kind: 'globalMarkerState', markerId, state }` — confirmed.
8. All handlers receive `env: EffectEnv` and `cursor: EffectCursor` — confirmed.

## Architecture Check

1. Marker operations are always single-feature updates: one marker changes from old state to new state. Each handler needs exactly one `updateRunningHash` call.
2. `flipGlobalMarker` toggles between two states — same update pattern as set.
3. Engine-agnosticism preserved — markers are a generic kernel concept.

## What to Change

### 1. `applySetMarker` — markerState Feature

Capture old marker state for the given (spaceId, markerId) before writing. After writing, call `updateRunningHash` with `{ kind: 'markerState', spaceId, markerId, state: oldState }` → `{ kind: 'markerState', spaceId, markerId, state: newState }`.

### 2. `applyShiftMarker` — markerState Feature

Same pattern. The lattice shift produces a new state from the old state. Capture old, compute new, update hash.

### 3. `applySetGlobalMarker` — globalMarkerState Feature

Capture old global marker state. After writing, call `updateRunningHash` with `{ kind: 'globalMarkerState', markerId, state: oldState }` → `{ kind: 'globalMarkerState', markerId, state: newState }`.

### 4. `applyFlipGlobalMarker` — globalMarkerState Feature

Capture old state, flip produces new state. Same `updateRunningHash` pattern.

### 5. `applyShiftGlobalMarker` — globalMarkerState Feature

Capture old state, shift produces new state. Same `updateRunningHash` pattern.

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify — 5 marker handlers)

## Out of Scope

- Variable effect handlers (ticket 002).
- Token effect handlers (ticket 003).
- Phase/turn-flow handlers (ticket 005).
- `applyRollRandom` in effects-choice.ts — RNG state is NOT hashed; no update needed.
- Any changes to types-core.ts, zobrist.ts, initial-state.ts (ticket 001).
- Verification mode or switchover (tickets 006–007).
- Runner package changes.

## Acceptance Criteria

### Tests That Must Pass

1. **Unit test**: `setMarker` updates `_runningHash` such that the hash matches `computeFullHash`.
2. **Unit test**: `shiftMarker` (forward and backward shift) updates `_runningHash` correctly.
3. **Unit test**: `setGlobalMarker` updates `_runningHash` correctly.
4. **Unit test**: `flipGlobalMarker` toggles the hash correctly (flip twice = original hash).
5. **Unit test**: `shiftGlobalMarker` updates `_runningHash` correctly.
6. **Guard test**: Hash update skipped gracefully when `cachedRuntime?.zobristTable` is unavailable.
7. Existing suite: `pnpm -F @ludoforge/engine test` — all existing tests pass.
8. Existing suite: `pnpm turbo typecheck` — no type errors.

### Invariants

1. After any marker handler, `_runningHash` reflects the XOR-diff of the changed marker feature.
2. Flipping a global marker twice returns `_runningHash` to its original value.
3. Setting a marker to its current state produces no net hash change (XOR out + XOR in same key).
4. Marker operations modify exactly one Zobrist feature each.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/zobrist-incremental-markers.test.ts` — tests for all 5 marker handlers' hash behavior.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
