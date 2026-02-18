# REACTUI-024: Discriminated Choice UI Contract

**Status**: ✅ COMPLETED
**Spec**: 35-00 (Frontend Implementation Roadmap), 39 (React DOM UI)
**Priority**: P1
**Depends on**: REACTUI-023
**Estimated complexity**: L

---

## Summary

Replace loose choice render fields with a discriminated UI contract so choice rendering is mutually exclusive, explicit, and invariant-safe.

---

## Assumptions Reassessment (2026-02-18)

- `RenderModel` currently exposes parallel nullable fields (`choiceType`, `currentChoiceOptions`, `currentChoiceDomain`, `choiceMin`, `choiceMax`) in `packages/runner/src/model/render-model.ts`.
- `deriveRenderModel()` currently projects those fields independently in `packages/runner/src/model/derive-render-model.ts`, which allows structurally ambiguous combinations.
- `ChoicePanel` and `deriveBottomBarState()` currently infer mode from ad-hoc combinations of those nullable fields, not one discriminated payload.
- `currentChoiceDomain` is currently always `null` in derivation, so numeric-mode states are representable by type but not produced by current runtime projections.
- Existing tests validate happy-path field projection and rendering, but do not fully codify invalid mixed-state normalization for the choice contract boundary.

These mismatches make the original dependency/scope assumptions stale; scope below is corrected to match the current codebase.

---

## What Needs to Change

- Introduce a single discriminated `choiceUi` payload in render-model derivation (at minimum covering `none`, `discreteOne`, `discreteMany`, `numeric`, `confirmReady`).
- Remove legacy parallel choice fields from the render-model contract once the discriminated payload is in place (no aliasing/backward compatibility path).
- Derive `choiceUi` in one place with deterministic normalization of mixed/invalid source combinations.
- Update `ChoicePanel` to branch on `choiceUi.kind` only (no independent parallel condition branches).
- Update bottom-bar mode derivation to consume the discriminated contract so choice-pending vs confirm-ready is contract-driven.
- Keep game logic/data flow unchanged: this ticket is render-model/UI contract architecture, not kernel/worker protocol expansion.

---

## Out of Scope

- New gameplay features beyond existing choice flow.
- Worker/kernel protocol changes outside runner render-model projections.

---

## Acceptance Criteria

### Tests that should pass

- `packages/runner/test/model/derive-render-model-state.test.ts`
  - validates each `choiceUi.kind` mapping from store context.
  - validates impossible source combinations are normalized deterministically.
- `packages/runner/test/model/render-model-types.test.ts`
  - validates discriminated contract typing and exhaustiveness.
- `packages/runner/test/ui/bottom-bar-mode.test.ts`
  - validates mode derivation uses `choiceUi.kind` (not legacy nullable combinations).
- `packages/runner/test/ui/ChoicePanel.test.ts`
  - validates mutually exclusive rendering based on `choiceUi.kind`.

### Invariants

- Choice rendering mode is represented by one discriminated value.
- Only one choice mode can be active at a time.
- No silent no-op interactions for structurally invalid options.
- Contract remains game-agnostic and data-driven.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Replaced legacy parallel choice render fields with a discriminated `choiceUi` contract in `RenderModel`.
  - Centralized choice-mode derivation in `deriveRenderModel()` with deterministic normalization for invalid `chooseN` bounds.
  - Extended render derivation context with `partialMove` so `confirmReady` is derived in the model layer.
  - Updated `ChoicePanel` and bottom-bar mode derivation to switch on `choiceUi.kind` only.
  - Updated runner tests to assert the discriminated contract and added invariant-focused regression coverage.
- **Deviations from original plan**:
  - `numeric` is now a first-class contract variant and is derived when a `chooseOne` pending request has no options but includes numeric bounds; concrete numeric input UI behavior remains out of scope.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
