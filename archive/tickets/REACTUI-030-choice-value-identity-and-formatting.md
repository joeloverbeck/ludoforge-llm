# REACTUI-030: Choice Value Identity/Formatting Utility

**Status**: ✅ COMPLETED
**Spec**: 37 (State Management), 39 (React DOM UI)
**Priority**: P2
**Depends on**: REACTUI-024
**Estimated complexity**: S

---

## Summary

Add a shared, deterministic utility for choice-value identity and fallback formatting so UI keys, comparisons, and generic labels do not rely on `String(value)` behavior.

## Assumption Check (2026-02-18)

- `String(value)` is currently used for choice-value fallback display in `packages/runner/src/model/derive-render-model.ts` (`deriveChoiceBreadcrumb()` and `deriveRenderChoiceOptions()`), so label generation is coupled to JS coercion.
- `String(value)` is currently used for option row keys and test ids in `packages/runner/src/ui/ChoicePanel.tsx`, so array/scalar identity collisions are possible (for example `['a', 'b']` vs `'a,b'`).
- Current `ChoicePanel` only dispatches `chooseOne` for scalar values (array values are rendered but not selectable in this path), so this ticket should focus on identity + deterministic formatting and not broaden into multi-select behavior.
- Existing tests do not currently enforce a shared identity/formatting utility contract for choice values.

## Updated Scope

- Introduce one shared generic utility module for choice-value identity and fallback formatting (no game-specific branches).
- Route choice fallback display in render-model derivation through that utility instead of `String(value)`.
- Route choice option identity usage in UI rendering (keys/test ids and future-safe identity wiring) through the same utility instead of `String(value)`.
- Add regression tests that lock deterministic behavior for scalar and array values and protect against scalar/array collisions.

---

## What Needs to Change

- Add a choice-value utility module (for example: `packages/runner/src/model/choice-value-utils.ts`) with:
  - stable identity serialization for `MoveParamValue` scalars/arrays.
  - deterministic fallback display formatting for generic paths.
- Replace ad-hoc `String(value)` usage in choice-related rendering/derivation with utility calls where identity or fallback formatting is needed.
- Use stable serialized identity for React keys and selection comparisons in choice UI paths.
- Keep utility fully generic and agnostic to game-specific payload conventions.

---

## Out of Scope

- Rich target-aware labeling (covered by REACTUI-025).
- Game-specific pretty-printers.
- Multi-select interaction implementation changes (covered by REACTUI-008).

---

## Tests that Should Pass

- `packages/runner/test/model/choice-value-utils.test.ts` (new)
  - identity serialization is stable and collision-resistant for supported `MoveParamValue` shapes.
  - fallback formatting is deterministic across scalar/array values.
- `packages/runner/test/ui/ChoicePanel.test.ts`
  - choice option rendering/keys remain stable when values are arrays or non-trivial scalars.
- `packages/runner/test/model/derive-render-model-state.test.ts`
  - breadcrumb/option fallback display uses deterministic utility output.

---

## Invariants

- Choice identity and fallback formatting come from one shared utility.
- No implicit dependence on JavaScript default string coercion for core choice UI behavior.
- Utility remains game-agnostic and reusable across runner model/UI layers.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added shared choice-value utility at `packages/runner/src/model/choice-value-utils.ts` with deterministic identity serialization and fallback formatting for scalar/array `MoveParamValue`.
  - Replaced `String(value)` fallback choice display derivation in `packages/runner/src/model/derive-render-model.ts` with utility-based formatting.
  - Replaced `String(value)` option identity usage in `packages/runner/src/ui/ChoicePanel.tsx` with stable serialized identity for option keys and ids.
  - Added and updated tests:
    - new `packages/runner/test/model/choice-value-utils.test.ts`
    - strengthened `packages/runner/test/model/derive-render-model-state.test.ts`
    - strengthened `packages/runner/test/ui/ChoicePanel.test.ts`
- **Deviation from original plan**:
  - Applied stable identity in `ChoicePanel` option test ids in addition to keys so UI identity usage is uniformly serializer-backed.
  - Did not implement multi-select interaction changes because that remains out of scope and tracked under REACTUI-008.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
