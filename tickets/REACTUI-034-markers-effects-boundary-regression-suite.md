# REACTUI-034: Marker/Effect RenderModel Boundary Regression Suite

**Status**: ACTIVE
**Spec**: 37 (State Management), 39 (React DOM UI Layer)
**Priority**: P1
**Depends on**: REACTUI-031, REACTUI-032
**Estimated complexity**: S

---

## Summary

Add strict boundary/regression tests for marker/effect projection contracts so malformed or sparse game metadata cannot silently leak fragile UI behavior.

---

## What Needs to Change

- Strengthen `packages/runner/test/model/derive-render-model-state.test.ts` with focused marker/effect boundary coverage:
  - missing lattice entries.
  - unknown states/effect metadata values.
  - empty optional metadata.
  - deterministic projection ordering.
- Add/strengthen targeted tests in `packages/runner/test/ui/GlobalMarkersBar.test.ts` and `packages/runner/test/ui/ActiveEffectsPanel.test.ts` for sparse/malformed-but-accepted projection inputs.
- Keep validation/projection boundary in model derivation (UI must not become validator of game semantics).

---

## Invariants

- Marker/effect projection boundary behavior is deterministic and explicitly tested.
- UI components remain tolerant display consumers of RenderModel outputs.
- No game-specific conditionals are introduced in tests or production code.
- Contract regressions fail fast in model tests before UI behavior drifts.

---

## Tests that Should Pass

- `packages/runner/test/model/derive-render-model-state.test.ts`
  - marker/effect boundary cases covered and deterministic.
- `packages/runner/test/ui/GlobalMarkersBar.test.ts`
  - robust rendering for projection edge cases (including empty possible states).
- `packages/runner/test/ui/ActiveEffectsPanel.test.ts`
  - robust rendering for projection edge cases (including sparse attributes).
- `packages/runner/test/model/render-model-types.test.ts`
  - updated fixtures conform to strengthened contracts.
