# 128FULSCODRA-003: Convert effect handler files to use widened draft scope

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel effect handlers (markers, tokens, vars, reveals)
**Deps**: `archive/tickets/128FULSCODRA-002.md`

## Problem

After ticket 002 establishes the single draft scope in `applyMoveCore`, effect handler files still contain immutable fallback paths (spread-based state creation) that activate when no tracker is provided. With the widened scope, a tracker is always available. This ticket converts the remaining spread sites in effect handler files to use the COW helpers from ticket 001, ensuring the draft scope is fully utilized in the innermost kernel layer.

## Assumption Reassessment (2026-04-13)

1. `effects-markers.ts` has 7 `...cursor.state` spread sites — these are in the immutable fallback path; the mutable path (when `cursor.tracker` is present) already exists from Spec 78. Confirmed.
2. `effects-token.ts` has 2-4 spread sites outside the current draft scope. Confirmed.
3. `effects-var.ts` has 1 spread site. Confirmed.
4. `effects-reveal.ts` has 2 spread sites. Confirmed.
5. `scoped-var-runtime-access.ts` has 1 spread site. Confirmed.
6. All these files already import from `state-draft.ts` and use the `MutableGameState`/`DraftTracker` types. Confirmed.

## Architecture Check

1. Effect handlers already have dual-path logic from Spec 78 — this ticket ensures the mutable path is always taken by guaranteeing a tracker is always provided from the widened scope. The immutable fallback paths become dead code and can be removed.
2. No game-specific logic — these are generic effect handlers operating on GameState structure.
3. No backwards-compatibility shims — the fallback paths are removed, not preserved behind a flag.

## What to Change

### 1. effects-markers.ts — remove immutable fallback paths

The 5 marker effect handlers (`applySetMarker`, `applyShiftMarker`, `applySetGlobalMarker`, `applyShiftGlobalMarker`, `applyFlipGlobalMarker`) each have a dual-path: mutable when `cursor.tracker` is present, immutable spread when absent. With the widened draft scope, `cursor.tracker` is always present. Remove the immutable fallback branches and assert tracker presence at the top of each handler.

For global marker handlers, use the new `ensureGlobalMarkersCloned` COW helper (from ticket 001) instead of the existing per-marker pattern where appropriate.

### 2. effects-token.ts — convert remaining spread sites

Convert the 2-4 spread sites outside the current draft scope to use `ensureZoneCloned` and direct mutation. These are typically zone mutation finalization patterns that create new state objects instead of mutating the already-cloned zone arrays.

### 3. effects-var.ts — convert spread site

Convert the 1 spread site to direct mutation using existing COW helpers.

### 4. effects-reveal.ts — convert spread sites

Convert the 2 spread sites to use `ensureRevealsCloned` (from ticket 001) and direct mutation.

### 5. scoped-var-runtime-access.ts — convert spread site

Convert the 1 spread site to direct mutation using existing COW helpers.

## Files to Touch

- `packages/engine/src/kernel/effects-markers.ts` (modify)
- `packages/engine/src/kernel/effects-token.ts` (modify)
- `packages/engine/src/kernel/effects-var.ts` (modify)
- `packages/engine/src/kernel/effects-reveal.ts` (modify)
- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)

## Out of Scope

- Converting spread sites in turn flow files (ticket 004)
- Converting spread sites in lifecycle files (ticket 005)
- Modifying `applyMoveCore` plumbing (ticket 002)

## Acceptance Criteria

### Tests That Must Pass

1. All existing effect handler tests pass with identical behavior
2. All existing determinism tests pass with identical stateHash values
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Foundation 8 (Determinism): same inputs produce identical outputs
2. Every effect handler asserts tracker presence — no silent fallback to immutable path
3. COW helpers are called before any nested mutation — no aliased writes

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/effects-markers.test.ts` — verify marker handlers produce identical state with and without prior tracker mutations in scope
2. `packages/engine/test/kernel/effects-reveal.test.ts` — verify reveal COW helper works correctly for undefined and defined reveal states

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "effects"`
2. `pnpm turbo build && pnpm turbo test`
