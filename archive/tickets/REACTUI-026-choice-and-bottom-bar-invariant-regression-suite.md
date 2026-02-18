# REACTUI-026: Choice/Bottom-Bar Invariant Regression Suite

**Status**: ✅ COMPLETED
**Spec**: 37 (State Management), 39 (React DOM UI)
**Priority**: P1
**Depends on**: REACTUI-023, REACTUI-024
**Estimated complexity**: M

---

## Summary

Add targeted invariant tests for bottom-bar exclusivity and choice-state validity so future tickets cannot reintroduce ambiguous or overlapping UI states.

---

## Assumptions Reassessment (2026-02-18)

- `REACTUI-023` and `REACTUI-024` already landed core architecture changes this ticket originally assumed were missing:
  - `packages/runner/src/ui/bottom-bar-mode.ts` centralizes bottom-bar mode derivation.
  - `GameContainer` owns bottom-bar branching and renders one branch at a time.
  - `RenderModel.choiceUi` is already a discriminated contract used by container + choice panel.
- Existing tests already cover a substantial portion of this ticket's original scope:
  - `packages/runner/test/ui/bottom-bar-mode.test.ts` validates primary mode mapping.
  - `packages/runner/test/ui/GameContainer.test.ts` validates branch exclusivity by mode.
  - `packages/runner/test/ui/ChoicePanel.test.ts` validates choice-mode rendering guards and invalid-mode non-interactive output.
  - `packages/runner/test/model/derive-render-model-state.test.ts` already includes many choice contract invalid/mismatch projections.
- Therefore, this ticket should focus on **remaining high-risk invariant edges and precedence rules**, not re-implement coverage already present.

---

## What Needs to Change

- Strengthen existing regression suites at model/UI boundaries instead of creating duplicate suites.
- Add/extend explicit negative precedence cases for contradictory source combinations:
  - no simultaneous bottom-bar modes under contradictory inputs.
  - deterministic winner when `activePlayer` context and `choiceUi` context conflict.
  - deterministic fallback when source state is structurally incomplete (for example unknown/missing active player references).
- Add table-driven fixtures for these high-risk combinations to keep coverage maintainable.
- Add choice-panel interaction guards for non-actionable options so invalid/unknown legality cannot trigger dead-end actions.
- Keep ownership boundaries from REACTUI-023:
  - container/shared derivation owns global bottom-bar mode.
  - child components remain presentational with local structural guards only.

---

## Out of Scope

- End-to-end browser interaction tests.
- Performance profiling.

---

## Acceptance Criteria

### Tests that should pass

- `packages/runner/test/model/derive-render-model-state.test.ts`
  - extend only if a new uncovered projection invariant is identified during implementation.
- `packages/runner/test/ui/GameContainer.test.ts`
  - extends exclusivity/precedence assertions for contradictory states.
- `packages/runner/test/ui/bottom-bar-mode.test.ts`
  - adds table-driven precedence/fallback coverage for edge combinations.
- `packages/runner/test/ui/ChoicePanel.test.ts`
  - adds/extends assertions for non-actionable legality states and dead-control prevention.

### Invariants

- Bottom bar renders exactly one mode at a time.
- Choice UI mode is mutually exclusive and exhaustively handled.
- Invalid choice-state combinations cannot leak to interactive dead-end controls.
- Global mode ownership is centralized in container + shared derivation helper.
- Regression tests are deterministic, readable, and enforce architecture contracts.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Updated ticket assumptions/scope to match already-landed REACTUI-023/024 architecture.
  - Added precedence/fallback regression coverage in `packages/runner/test/ui/bottom-bar-mode.test.ts` for contradictory state combinations (including unknown active-player fallback).
  - Added container-level precedence regression in `packages/runner/test/ui/GameContainer.test.ts` to assert AI-turn exclusivity under contradictory confirm-ready state.
  - Added choice interaction guard regression in `packages/runner/test/ui/ChoicePanel.test.ts` to ensure unknown-legality options remain non-actionable and show deterministic fallback feedback.
- **Deviation from original plan**:
  - No new `derive-render-model-state` cases were added because current coverage already exercises the choice-contract invalid/mismatch projections this ticket targeted.
  - Focus shifted from creating new suites to strengthening existing suites where gaps remained.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
