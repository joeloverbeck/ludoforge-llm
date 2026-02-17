# STATEMOD-011: Replace Patch-Merge Render Derivation with Deterministic Next-State Transition

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: M
**Spec**: 37 — State Management & Render Model
**Deps**: STATEMOD-010

## Objective

Eliminate remaining patch/merge coupling in store derivation by moving to explicit next-state construction before render-model derivation. This hardens deterministic behavior and improves long-term maintainability of the runner state pipeline.

## Reassessed Assumptions (Current Code/Test Reality)

- `packages/runner/src/store/game-store.ts` already mitigates prior null-clearing bugs with key-presence-aware derivation input selection (`toRenderDerivationInputs` + `key in patch`).
- Current update flow still centers on `setAndDerive(patch: Partial<GameStoreState>)`, which depends on partial patches, key checks, and type assertions when mapping derivation inputs.
- Existing tests already cover many lifecycle and undo re-derivation paths, including a terminal-to-null render projection transition.
- Gaps remain in architecture clarity: derivation currently reasons over `current + patch` instead of a first-class materialized next state object.

## Scope Update

This ticket does **not** redo lifecycle modeling (reserved for `STATEMOD-013`). It focuses on deterministic derivation mechanics:

1. Refactor store update flow in `packages/runner/src/store/game-store.ts` so render derivation always receives a fully materialized next-state snapshot for derivation-relevant fields.
2. Remove/retire helper APIs that rely on `Partial<GameStoreState>` key-presence inference for derivation inputs.
3. Keep the public store API stable.
4. Add regression-oriented tests in `packages/runner/test/store/game-store.test.ts` that lock in deterministic null/omission semantics for derivation fields.

## Architecture Decision

Prefer explicit next-state transition construction for derivation over patch-based input reconstruction. This is more robust than patch inference because it keeps derivation contracts local, typed, and easier to evolve as new store fields are added.

## Invariants That Must Pass

- Derivation observes exactly the state committed in the same update.
- Explicit clears (`null`) are preserved across all nullable derivation inputs.
- Missing fields in an update do not implicitly clear existing state.
- No behavior regression in move selection, choice flow, confirm, cancel, undo, or terminal transitions.

## Tests That Must Pass

- Existing: `pnpm -F @ludoforge/runner test`
- Existing: `pnpm -F @ludoforge/runner lint`
- Existing: `pnpm -F @ludoforge/runner typecheck`
- New/updated tests in `packages/runner/test/store/game-store.test.ts`:
- regression: explicit `terminal: null` transition keeps committed state/render projection aligned
- regression: clearing `choicePending` clears render-model choice fields
- regression: omitted derivation fields remain stable when unrelated fields update

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
- Replaced patch-key inference in `packages/runner/src/store/game-store.ts` with deterministic next-state materialization (`snapshotMutableState` + `materializeNextState`) before derivation.
- Simplified derivation input mapping to consume an explicit materialized state snapshot (`toRenderDerivationInputs(state)`), removing `key in patch` and patch-cast logic.
- Added/updated regression tests in `packages/runner/test/store/game-store.test.ts` covering:
- choice-pending clear reflected in render-model choice fields,
- explicit terminal clear alignment between committed state and render projection,
- unrelated updates preserving derivation fields/render model stability.
- **Deviations from original plan**:
- The ticket was corrected first to reflect that the prior null-clear bug was already mitigated; implementation then targeted the remaining architectural debt only.
- **Verification**:
- `pnpm -F @ludoforge/runner test` passed.
- `pnpm -F @ludoforge/runner lint` passed.
- `pnpm -F @ludoforge/runner typecheck` passed.
