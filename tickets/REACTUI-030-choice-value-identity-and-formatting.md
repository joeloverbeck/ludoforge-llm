# REACTUI-030: Choice Value Identity/Formatting Utility

**Status**: PENDING
**Spec**: 37 (State Management), 39 (React DOM UI)
**Priority**: P2
**Depends on**: REACTUI-024
**Estimated complexity**: S

---

## Summary

Add a shared, deterministic utility for choice-value identity and fallback formatting so UI keys, comparisons, and generic labels do not rely on `String(value)` behavior.

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

