# REACTUI-029: RenderModel Choice Contract Boundary Validation

**Status**: ✅ COMPLETED
**Spec**: 37 (State Management), 39 (React DOM UI)
**Priority**: P1
**Depends on**: REACTUI-024, REACTUI-028
**Estimated complexity**: XS

---

## Summary

Reassess and harden the existing RenderModel `choiceUi` contract boundary so malformed projections continue to fail deterministically and test coverage fully captures all invalid-reason branches.

---

## Assumption Check (2026-02-18)

- `choiceUi` boundary validation already exists in `packages/runner/src/model/derive-render-model.ts` (`deriveChoiceUi()`), which is invoked directly by `deriveRenderModel()`.
- Deterministic invalid mappings already exist via `RenderChoiceUiInvalidReason` (`ACTION_MOVE_MISMATCH`, `PENDING_CHOICE_MISSING_ACTION`, etc.) and are consumed by UI mode routing.
- Existing tests in `packages/runner/test/model/derive-render-model-state.test.ts` and `packages/runner/test/ui/ChoicePanel.test.ts` already cover substantial positive/negative behavior.
- The original proposal to add a separate validator module would duplicate the current architecture without adding clear robustness.

## Updated Scope

- Keep the single validation boundary in `deriveChoiceUi()` (no new validator module).
- Strengthen tests to cover currently untested invalid-reason branches so the boundary contract is fully regression-protected:
  - `PENDING_CHOICE_MISSING_PARTIAL_MOVE`
  - `CONFIRM_READY_MISSING_ACTION`
- Preserve game-agnostic behavior and deterministic output contracts used by Spec 39 UI state routing.

---

## Out of Scope

- Introducing a parallel validation layer outside `deriveRenderModel`.
- Full RenderModel schema validation beyond choice contract.
- Engine-level GameDef validation changes (already covered by REACTUI-021).

---

## Tests that Should Pass

- `packages/runner/test/model/derive-render-model-state.test.ts`
  - existing valid contracts pass unchanged.
  - all invalid-reason branches are asserted deterministically.
- `packages/runner/test/ui/ChoicePanel.test.ts`
  - invalid contract branch remains non-interactive and deterministic.

---

## Invariants

- Choice contract violations are detected at a single boundary, not piecemeal in UI components.
- Validation behavior is deterministic and game-agnostic.
- Invalid projections cannot silently produce interactive ambiguity.
- Contract checks remain minimal and maintainable (no per-game rules).

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Re-scoped ticket to reflect that contract validation already exists in `deriveChoiceUi()` at the render-model boundary.
  - Added missing negative-branch coverage in `packages/runner/test/model/derive-render-model-state.test.ts` for:
    - `PENDING_CHOICE_MISSING_PARTIAL_MOVE`
    - `CONFIRM_READY_MISSING_ACTION`
- **Deviation from original plan**:
  - Did not add a new validator module or new standalone validator test file because that would duplicate existing architecture and reduce cohesion.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
