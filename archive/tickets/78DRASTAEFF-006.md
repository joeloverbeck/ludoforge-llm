# 78DRASTAEFF-006: Migrate choice, reveal, binding, and resource handlers to native (env, cursor) signature

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — effects-choice.ts, effects-reveal.ts, effects-binding.ts, effects-resource.ts, effect-registry.ts
**Deps**: 78DRASTAEFF-002, 78DRASTAEFF-003

## Problem

Four effect handler files contain 14 `simple()`-wrapped handlers that need migration to native `(env, cursor)` signatures:

- **effects-choice.ts** (8 handlers): `applyChooseOne`, `applyChooseN`, `applySetMarker`, `applyShiftMarker`, `applySetGlobalMarker`, `applyFlipGlobalMarker`, `applyShiftGlobalMarker` (+ `applyRollRandom` handled in ticket 007 as it uses `compat()`)
- **effects-reveal.ts** (2 handlers): `applyReveal`, `applyConceal`
- **effects-binding.ts** (1 handler): `applyBindValue`
- **effects-resource.ts** (1 handler): `applyTransferVar`

Note: `applyChooseOne` and `applyChooseN` are 7 of the 8 choice handlers. `applyRollRandom` uses `compat()` and is in ticket 007.

## Assumption Reassessment (2026-03-23)

1. All 12 listed handlers have `(effect, ctx: EffectContext) => EffectResult` signature — confirmed.
2. Marker handlers (`setMarker`, `shiftMarker`, etc.) modify `state.markers` or `state.globalMarkers` — need `ensureMarkerCloned` from `state-draft.ts`.
3. `applyChooseOne`/`applyChooseN` are read-heavy (eval conditions, build pending choices) and may not modify state at all in discovery mode.
4. `applyReveal`/`applyConceal` modify `state.reveals` — need mutable access to the reveals record.
5. `applyBindValue` only modifies bindings (not state) — simplest migration.
6. `applyTransferVar` calls `writeScopedVarsToState` — switch to `writeScopedVarsMutable`.

## Architecture Check

1. Each file is independent — migration order within this ticket doesn't matter.
2. `applyBindValue` is the simplest (doesn't touch state) — good smoke test for the migration pattern.
3. Marker handlers need a new `ensureGlobalMarkerCloned` or direct mutable writes to `state.globalMarkers` (which is shallow-cloned by `createMutableState`).

## What to Change

### 1. Migrate `effects-binding.ts` (1 handler)

- `applyBindValue`: change to `EffectHandler<'bindValue'>`, return `{ state: cursor.state, rng: cursor.rng, bindings: newBindings }`

### 2. Migrate `effects-reveal.ts` (2 handlers)

- `applyReveal`, `applyConceal`: change signatures, mutate `state.reveals` directly (already shallow-cloned by `createMutableState`)

### 3. Migrate `effects-resource.ts` (1 handler)

- `applyTransferVar`: change signature, switch from `writeScopedVarsToState` to `writeScopedVarsMutable`

### 4. Migrate `effects-choice.ts` (8 handlers, excluding applyRollRandom)

- `applyChooseOne`, `applyChooseN`: change signatures, use `mergeToEvalContext(env, cursor)` for eval calls
- `applySetMarker`, `applyShiftMarker`: change signatures, use `ensureMarkerCloned` for inner map copy-on-write
- `applySetGlobalMarker`, `applyFlipGlobalMarker`, `applyShiftGlobalMarker`: change signatures, mutate `state.globalMarkers` directly (shallow-cloned at scope entry)

### 5. Remove file-local `resolveEffectBindings` helpers

Each of these files has its own local copy of `resolveEffectBindings`. Remove them and import from `effect-context.ts`.

### 6. Update registry entries in `effect-registry.ts`

Unwrap `simple()` for all 12 handlers.

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify — migrate 8 handlers)
- `packages/engine/src/kernel/effects-reveal.ts` (modify — migrate 2 handlers)
- `packages/engine/src/kernel/effects-binding.ts` (modify — migrate 1 handler)
- `packages/engine/src/kernel/effects-resource.ts` (modify — migrate 1 handler)
- `packages/engine/src/kernel/effect-registry.ts` (modify — unwrap 12 simple() calls)

## Out of Scope

- `applyRollRandom` (uses `compat()`, ticket 007)
- `applyEvaluateSubset` (uses `compat()`, ticket 007)
- Handlers in `effects-var.ts` (ticket 004) or `effects-token.ts` (ticket 005)
- Handlers in `effects-turn-flow.ts` (ticket 007)
- Removing `simple()`/`compat()` function definitions (ticket 008)

## Acceptance Criteria

### Tests That Must Pass

1. `effects-choice.test.ts` — all choice/marker tests pass
2. `effects-reveal.test.ts` — all reveal/conceal tests pass
3. `effects-var.test.ts` — transferVar tests pass (resource tests may live here or in a dedicated file)
4. `effects.golden.test.ts` — golden output unchanged
5. `effects.property.test.ts` — property tests pass
6. FITL and Texas Hold'em E2E tests pass
7. Existing suite: `pnpm turbo test --force`
8. Typecheck: `pnpm turbo typecheck`

### Invariants

1. `applyChooseOne`/`applyChooseN` return `pendingChoice` correctly in discovery mode.
2. Marker mutations use `ensureMarkerCloned` before writing inner maps.
3. `reveals` record mutations are safe because the outer record is shallow-cloned at scope entry.
4. `applyBindValue` MUST NOT modify `cursor.state` — it only changes bindings.

## Test Plan

### New/Modified Tests

1. No new tests — existing suites cover all handlers. Update direct handler calls if any tests invoke handlers with `EffectContext` directly.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "choice|reveal|conceal|bindValue|transferVar|marker"`
2. `pnpm turbo typecheck`
3. `pnpm turbo test --force`

## Outcome

- **Completion date**: 2026-03-24
- **What changed**:
  - `effects-binding.ts`: migrated `applyBindValue` to native `(env, cursor)` signature; removed local `resolveEffectBindings`
  - `effects-reveal.ts`: migrated `applyReveal` and `applyConceal` to native signature; removed local `resolveEffectBindings`; added mutable-path for `state.reveals` when `cursor.tracker` present
  - `effects-resource.ts`: migrated `applyTransferVar` to native signature; removed local `resolveEffectBindings`; added `writeScopedVarsMutable` path when `cursor.tracker` present
  - `effects-choice.ts`: migrated 7 handlers (`applyChooseOne`, `applyChooseN`, `applySetMarker`, `applyShiftMarker`, `applySetGlobalMarker`, `applyFlipGlobalMarker`, `applyShiftGlobalMarker`) to native signature; converted local `resolveEffectBindings` to `resolveChoiceBindings(env, cursor)` (keeps binding template key resolution); added `resolveChoiceBindingsCompat` for `applyRollRandom` (stays on `compat()`); refactored `resolveMarkerLattice`/`resolveGlobalMarkerLattice` to accept `def` directly; added `ensureMarkerCloned` for marker mutations and direct writes for globalMarkers when tracker present
  - `effect-registry.ts`: unwrapped `simple()` for all 12 migrated handlers
- **Deviations from plan**:
  - Ticket step 5 said to remove all local `resolveEffectBindings` and import from `effect-context.ts`. The `effects-choice.ts` version does extra binding template key resolution, so it was kept as `resolveChoiceBindings(env, cursor)` plus a compat wrapper for `applyRollRandom`.
  - Added `OldApplyEffectsWithBudget` type alias in `effects-choice.ts` to keep `applyRollRandom`'s 3-arg batch apply signature compiling (it still uses `compat()`, ticket 007).
- **Verification**: typecheck clean, 4670 tests pass / 0 fail
