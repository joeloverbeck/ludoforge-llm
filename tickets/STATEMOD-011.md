# STATEMOD-011: Replace Patch-Merge Render Derivation with Deterministic Next-State Transition

**Status**: PENDING
**Priority**: HIGH
**Effort**: L
**Spec**: 37 — State Management & Render Model
**Deps**: STATEMOD-010

## Objective

Remove patch/merge ambiguity in store derivation by introducing deterministic next-state construction before render-model derivation. This prevents null/undefined merge bugs and hardens future extensibility.

## What Needs to Change / Be Added

1. Refactor store update flow in `packages/runner/src/store/game-store.ts`:
- replace implicit `Partial<GameStoreState>` merge semantics with explicit next-state construction
- derive `renderModel` from the fully materialized next state
- avoid helper APIs that treat missing/null/undefined ambiguously.
2. Constrain update surface so derivation inputs cannot receive accidental `undefined` for nullable-but-defined fields.
3. Keep external store API unchanged unless a rename/removal improves clarity and consistency significantly.

## Invariants That Must Pass

- Derivation observes exactly the state that is committed in the same update.
- Explicit clears (`null`) are preserved across all nullable derivation inputs.
- Missing fields in an update do not implicitly clear state.
- No behavior regression in move selection, choice flow, confirm, cancel, undo, or terminal transitions.

## Tests That Must Pass

- Existing: `pnpm -F @ludoforge/runner test`
- Existing: `pnpm -F @ludoforge/runner lint`
- Existing: `pnpm -F @ludoforge/runner typecheck`
- New/updated tests in `packages/runner/test/store/game-store.test.ts`:
- regression: explicit `terminal: null` patch path yields `renderModel.terminal === null`
- regression: clearing `choicePending` path clears render-model choice fields
- regression: omitted fields remain stable when unrelated fields update
