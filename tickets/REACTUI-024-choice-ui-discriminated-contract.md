# REACTUI-024: Discriminated Choice UI Contract

**Status**: PENDING
**Spec**: 37 (State Management), 39 (React DOM UI)
**Priority**: P1
**Depends on**: REACTUI-008
**Estimated complexity**: L

---

## Summary

Replace loose choice render fields with a discriminated UI contract so choice rendering is mutually exclusive, explicit, and invariant-safe.

---

## What Needs to Change

- Introduce a single discriminated `choiceUi` payload in render-model derivation (for example: `none`, `discreteOne`, `discreteMany`, `numeric`, `confirmReady`).
- Remove ambiguous combinations where UI currently infers mode from multiple nullable fields.
- Update `ChoicePanel` to switch on `choiceUi.kind` only (no independent parallel condition branches).
- Ensure illegal/impossible state combinations are rejected by derivation or mapped to a deterministic fallback error state.
- Update any affected types and selectors in runner store/model modules.

---

## Out of Scope

- New gameplay features beyond existing choice flow.
- Worker/kernel protocol changes outside runner render-model projections.

---

## Acceptance Criteria

### Tests that should pass

- `packages/runner/test/model/derive-render-model-state.test.ts`
  - validates each `choiceUi.kind` mapping from store context.
  - validates impossible source combinations are normalized/rejected deterministically.
- `packages/runner/test/model/render-model-types.test.ts`
  - validates discriminated contract typing and exhaustiveness.
- `packages/runner/test/ui/ChoicePanel.test.ts`
  - validates mutually exclusive rendering based on `choiceUi.kind`.

### Invariants

- Choice rendering mode is represented by one discriminated value.
- Only one choice mode can be active at a time.
- No silent no-op interactions for structurally invalid options.
- Contract remains game-agnostic and data-driven.

