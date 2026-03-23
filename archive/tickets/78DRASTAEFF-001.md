# 78DRASTAEFF-001: Add MutableGameState, DraftTracker, and state-draft infrastructure

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — new kernel module, EffectCursor extension
**Deps**: Spec 77 (completed)

## Problem

Spec 78 requires a mutable working state during effect execution to eliminate ~25K intermediate GameState allocations per 10 games. This ticket creates the foundational types and helpers: `MutableGameState`, `DraftTracker`, `createMutableState`, `freezeState`, and copy-on-write helper functions. It also extends `EffectCursor` with an optional `tracker` field.

## Assumption Reassessment (2026-03-23)

1. `EffectCursor` is defined in `effect-context.ts` with 5 mutable fields (`state`, `rng`, `bindings`, `decisionScope`, `effectPath?`) — confirmed.
2. `GameState` type is in `types.ts` — readonly fields. `Mutable<T>` removes readonly modifiers at type level only.
3. Foundation 7 exception clause is already in `docs/FOUNDATIONS.md` — no change needed.

## Architecture Check

1. `state-draft.ts` is a new leaf module with no outward dependencies beyond `types.ts`. Clean separation.
2. `DraftTracker` tracks copy-on-write at the inner-map level, not at the top-level (top-level maps are eagerly cloned in `createMutableState`).
3. No backwards-compatibility shims — this is additive infrastructure.

## What to Change

### 1. Create `packages/engine/src/kernel/state-draft.ts`

- `Mutable<T>` utility type (removes `readonly` modifiers)
- `MutableGameState` type alias
- `DraftTracker` interface with 4 Sets: `playerVars`, `zoneVars`, `zones`, `markers`
- `createMutableState(state: GameState): MutableGameState` — one-time 19-field spread + shallow clones of all nested records/arrays
- `createDraftTracker(): DraftTracker` — factory returning fresh empty Sets
- `freezeState(mutable: MutableGameState): GameState` — TypeScript cast only, zero runtime cost
- Copy-on-write helpers:
  - `ensurePlayerVarCloned(state: MutableGameState, tracker: DraftTracker, playerId: number): void`
  - `ensureZoneVarCloned(state: MutableGameState, tracker: DraftTracker, zoneId: string): void`
  - `ensureZoneCloned(state: MutableGameState, tracker: DraftTracker, zoneId: string): void`
  - `ensureMarkerCloned(state: MutableGameState, tracker: DraftTracker, key: string): void`

### 2. Extend `EffectCursor` in `effect-context.ts`

Add `tracker?: DraftTracker` as an optional field on the `EffectCursor` interface. Import `DraftTracker` from `state-draft.ts`.

## Files to Touch

- `packages/engine/src/kernel/state-draft.ts` (new)
- `packages/engine/src/kernel/effect-context.ts` (modify — add `tracker?` to EffectCursor)

## Out of Scope

- Wiring `createMutableState`/`createDraftTracker` into the dispatch loop (ticket 002)
- Migrating any effect handlers (tickets 004–007)
- Removing `simple()`/`compat()` wrappers (ticket 008)
- `writeScopedVarsMutable` helper (ticket 003)
- Changes to `docs/FOUNDATIONS.md` — the exception clause already exists
- Changes to any test files — this ticket is pure additive types/helpers

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: `state-draft.test.ts` — `createMutableState` produces a structurally equivalent state to the input (deep equality of all fields)
2. New unit test: `state-draft.test.ts` — `createMutableState` does NOT alias the input's nested objects (identity check: `mutable.globalVars !== original.globalVars`, etc.)
3. New unit test: `state-draft.test.ts` — `freezeState` returns the same reference it receives
4. New unit test: `state-draft.test.ts` — `ensurePlayerVarCloned` clones inner map on first call, is idempotent on second call (same reference)
5. New unit test: `state-draft.test.ts` — `ensureZoneCloned` clones zone token array on first call, is idempotent on second
6. New unit test: `state-draft.test.ts` — `createDraftTracker` returns empty Sets
7. Existing suite: `pnpm turbo test --force`
8. Typecheck: `pnpm turbo typecheck`

### Invariants

1. `createMutableState` MUST shallow-clone all top-level nested records (`globalVars`, `perPlayerVars`, `zoneVars`, `zones`, `actionUsage`, `markers`, `turnOrderState`) and conditionally clone optional fields (`reveals`, `globalMarkers`, `activeLastingEffects`, `interruptPhaseStack`).
2. `EffectCursor.tracker` MUST be optional — existing code that doesn't set it continues to work.
3. No runtime cost in `freezeState` — it's a TypeScript cast only.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/state-draft.test.ts` — unit tests for all exported functions

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "state-draft"`
2. `pnpm turbo typecheck`
3. `pnpm turbo test --force`

## Outcome

- **Completion date**: 2026-03-23
- **What changed**:
  - Created `packages/engine/src/kernel/state-draft.ts` with `Mutable<T>`, `MutableGameState`, `DraftTracker`, `createMutableState`, `createDraftTracker`, `freezeState`, and 4 copy-on-write helpers
  - Extended `EffectCursor` in `effect-context.ts` with optional `tracker?: DraftTracker` field
  - Added re-export in `packages/engine/src/kernel/index.ts`
  - Created `packages/engine/test/unit/kernel/state-draft.test.ts` with 13 unit tests
- **Deviations**: GameState has 18 fields (not 19 as spec/ticket stated) — no functional impact, all fields are correctly cloned
- **Verification**: `pnpm turbo typecheck` passes (3/3), `pnpm -F @ludoforge/engine test` passes (654/654)
