# REACTUI-026: Choice/Bottom-Bar Invariant Regression Suite

**Status**: PENDING
**Spec**: 37 (State Management), 39 (React DOM UI)
**Priority**: P1
**Depends on**: REACTUI-023, REACTUI-024
**Estimated complexity**: M

---

## Summary

Add targeted invariant tests for bottom-bar exclusivity and choice-state validity so future tickets cannot reintroduce ambiguous or overlapping UI states.

---

## What Needs to Change

- Add a dedicated regression suite for UI state invariants at model + UI boundaries.
- Codify negative cases explicitly:
  - no simultaneous bottom-bar modes.
  - no mixed choice-mode render states.
  - no enabled action controls during confirm-ready choice state.
- Add table-driven fixtures for high-risk state combinations (including invalid/edge combinations).
- Ensure tests assert deterministic fallback behavior for invalid source states.

---

## Out of Scope

- End-to-end browser interaction tests.
- Performance profiling.

---

## Acceptance Criteria

### Tests that should pass

- `packages/runner/test/model/derive-render-model-state.test.ts`
  - adds table-driven invariant cases for choice projection validity.
- `packages/runner/test/ui/GameContainer.test.ts`
  - asserts bottom-bar exclusivity across lifecycle/turn/choice scenarios.
- `packages/runner/test/ui/ChoicePanel.test.ts`
  - asserts no mixed-mode rendering and no silent actionable dead controls.
- `packages/runner/test/ui/ActionToolbar.test.ts`
  - asserts toolbar hidden for non-action bottom-bar modes.
- `packages/runner/test/ui/UndoControl.test.ts`
  - asserts undo hidden for non-action bottom-bar modes.

### Invariants

- Bottom bar renders exactly one mode at a time.
- Choice UI mode is mutually exclusive and exhaustively handled.
- Invalid choice-state combinations cannot leak to interactive dead-end controls.
- Regression tests are deterministic, readable, and enforce architecture contracts.

