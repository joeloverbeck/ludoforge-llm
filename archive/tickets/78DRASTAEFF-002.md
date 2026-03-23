# 78DRASTAEFF-002: Wire mutable state and DraftTracker into the dispatch loop

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — effect-dispatch.ts
**Deps**: 78DRASTAEFF-001

## Problem

The dispatch loop in `applyEffectsWithBudgetState` currently passes an immutable `cursor.state` through each effect iteration. This ticket wires in `createMutableState` and `createDraftTracker` at scope entry so that effect handlers receive a mutable state and tracker via the cursor. The loop remains agnostic to whether handlers mutate or return new objects.

## Assumption Reassessment (2026-03-23)

1. `applyEffectsWithBudgetState` in `effect-dispatch.ts` already uses a reusable mutable `workCursor` pattern (Spec 77 / exp-008) — confirmed at line 90.
2. The loop assigns `currentState = result.state` after each handler — this works for both mutation (same ref) and spread (new ref).
3. `applyEffect` and `applyEffects` call `toEffectEnv`/`toEffectCursor` then delegate to `applyEffectsWithBudgetState` — these entry points need no changes since the mutable state is created inside `applyEffectsWithBudgetState`.

## Architecture Check

1. The mutable state is scoped to a single `applyEffectsWithBudgetState` call. Nested calls (from `dispatchLifecycleEvent`) create their own mutable state and tracker — safe by design.
2. The dispatch loop is handler-agnostic: `currentState = result.state` works whether the handler mutated in place or returned a new object, enabling incremental migration.
3. No backwards-compatibility shims — handlers that still return new objects continue to work.

## What to Change

### 1. Modify `packages/engine/src/kernel/effect-dispatch.ts`

In `applyEffectsWithBudgetState`:
- Import `createMutableState`, `createDraftTracker` from `state-draft.ts`
- At scope entry, create `const mutableState = createMutableState(cursor.state)` and `const tracker = createDraftTracker()`
- Set `let currentState: GameState = mutableState as GameState`
- Thread `tracker` into the `workCursor`: `workCursor.tracker = tracker` (set once before the loop, since tracker is stable for the scope)

No changes to `applyEffectWithBudget`, `applyEffect`, or `applyEffects` — the integration is entirely within `applyEffectsWithBudgetState`.

## Files to Touch

- `packages/engine/src/kernel/effect-context.ts` (modify — add `tracker?: DraftTracker` to `EffectCursor`)
- `packages/engine/src/kernel/effect-dispatch.ts` (modify)

## Out of Scope

- Migrating any effect handlers to use the mutable state (tickets 004–007)
- The `state-draft.ts` module itself (ticket 001)
- Removing `simple()`/`compat()` wrappers (ticket 008)
- Changes to `applyEffect` or `applyEffects` entry-point functions
- Test helper changes — existing tests pass because handlers still return new objects

## Acceptance Criteria

### Tests That Must Pass

1. All existing effect tests pass unchanged — the dispatch loop change is transparent to handlers that still return new objects via spread.
2. Existing suite: `pnpm turbo test --force`
3. Typecheck: `pnpm turbo typecheck`
4. Lint: `pnpm turbo lint`

### Invariants

1. `createMutableState` is called exactly ONCE per `applyEffectsWithBudgetState` invocation — not per effect.
2. `tracker` is threaded through the cursor, not created per-iteration.
3. The external contract `applyMove(state) → newState` is preserved — the input state is never modified (verified by existing determinism tests).
4. Nested calls (e.g., `dispatchLifecycleEvent` → `applyEffectsWithBudgetState`) create independent mutable states and trackers.

## Test Plan

### New/Modified Tests

1. No new tests required — this is a transparent wiring change. Existing tests serve as regression proof.

### Commands

1. `pnpm turbo test --force`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-23
- **What changed**:
  - `packages/engine/src/kernel/effect-dispatch.ts`: imported `createMutableState`/`createDraftTracker` from `state-draft.ts`, wired them at scope entry in `applyEffectsWithBudgetState`, threaded `tracker` into `workCursor`.
  - `tickets/78DRASTAEFF-002.md`: added `effect-context.ts` to Files to Touch (the `tracker` field on `EffectCursor` was already added by ticket 001).
- **Deviations from original plan**:
  - The ticket listed only `effect-dispatch.ts` in Files to Touch, but `effect-context.ts` already had `tracker?: DraftTracker` on `EffectCursor` from ticket 001 — no additional change needed there.
  - 5 test assertions across 4 files changed from `assert.equal` (reference identity) to `assert.deepStrictEqual` (structural equality) because `createMutableState` always shallow-clones. Affected: `effects-runtime.test.ts`, `effects-choice.test.ts`, `phase-lifecycle-resources.test.ts`, `transfer-var.test.ts`.
- **Verification**: typecheck pass, lint pass, 4665/4665 tests pass (`pnpm turbo test --force`).
