# ENGINEARCH-005: Satisfiability-Aware Choice Legality

**Status**: ✅ COMPLETED
**Spec**: 35 (Frontend Integration Boundaries), 39 (React DOM UI Layer)
**Priority**: P1
**Depends on**: ENGINEARCH-003, ENGINEARCH-004
**Estimated complexity**: L

---

## Summary

Upgrade option legality evaluation from immediate-step illegality checks to full decision-sequence satisfiability semantics for complex/nested choices.

## Assumption Reassessment (2026-02-17)

- `packages/engine/src/kernel/legal-choices.ts` currently evaluates pending-option legality by probing one immediate continuation step. If that probe returns another `pending` decision, the current option is marked `legal` without proving full downstream completion satisfiability.
- `packages/engine/src/kernel/move-decision-sequence.ts` exists and is already the canonical decision-sequence traversal surface used by `legalMoves` template filtering, but it currently follows a deterministic chooser path rather than existential satisfiability search across downstream branches.
- Existing tests already cover many adjacent concerns:
  - deferred legality/costValidation behavior in `packages/engine/test/unit/kernel/legal-choices.test.ts`
  - `chooseN` overflow handling in `packages/engine/test/unit/kernel/legal-choices.test.ts`
  - sequence helper behavior and budget warnings in `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
- The main uncovered gap is specifically a nested-choice regression where immediate probe step is non-illegal but every full completion branch is unsatisfiable, and evaluated legality should not report such option as `legal`.

## Updated Scope

- Refactor decision-sequence satisfiability into a reusable, game-agnostic kernel helper that can classify probe branches as satisfiable / unsatisfiable / unresolved (budget-capped).
- Use that shared satisfiability helper in both:
  - `isMoveDecisionSequenceSatisfiable(...)` (template viability checks), and
  - `legalChoicesEvaluate(...)` option-legality mapping.
- Preserve explicit legality mode split (`legalChoicesDiscover` vs `legalChoicesEvaluate`) and keep runtime/kernel logic agnostic to any specific game data.
- Keep existing deterministic budgets and warnings semantics; unresolved budget cases must map to `unknown` instead of false-positive `legal`.

---

## What Needs to Change

- Introduce satisfiability-aware legality evaluation for pending options in evaluated legality mode.
- Distinguish at least:
  - option immediately illegal,
  - option provisionally legal but unresolved,
  - option satisfiable/legal through full decision completion.
- Reuse decision-sequence machinery to avoid drift between legality evaluation and real completion behavior.
- Ensure legality semantics remain game-agnostic and do not encode game-specific assumptions.
- Keep determinism guarantees intact under identical inputs.

---

## Invariants That Should Pass

- Option legality labels reflect actual downstream satisfiability, not only immediate rejection.
- Evaluated legality never marks an option as fully legal when no satisfiable completion exists.
- Semantics are identical across games defined purely via GameSpecDoc/GameDef.
- No game-specific branches appear in kernel legality logic.

---

## Tests That Should Pass

- `packages/engine/test/unit/kernel/legal-choices.test.ts`
  - add nested-choice regression where immediate step returns pending but all downstream completions are unsatisfiable.
  - assert evaluated legality classification reflects full downstream satisfiability (`illegal`/`unknown`/`legal`) rather than immediate-step-only probing.
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
  - add regression showing satisfiability search considers alternate downstream branches (not only first deterministic chooser path).
- `packages/engine/test/integration/decision-sequence.test.ts`
  - add end-to-end regression for nested/template decisions with satisfiability-sensitive options and verify no false-positive legal template exposure.
- Existing quality gates remain green:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/runner lint`

---

## Outcome

- Completion date: 2026-02-17
- What changed:
  - Added shared satisfiability traversal helper in `packages/engine/src/kernel/decision-sequence-satisfiability.ts` with `satisfiable` / `unsatisfiable` / `unknown` classification and existing move-enumeration budget warning semantics.
  - Refactored `packages/engine/src/kernel/move-decision-sequence.ts` to delegate satisfiability checks to the shared helper (`classifyMoveDecisionSequenceSatisfiability` + updated `isMoveDecisionSequenceSatisfiable`).
  - Updated `packages/engine/src/kernel/legal-choices.ts` evaluated-legality probing to classify downstream pending branches via full sequence satisfiability rather than immediate-step-only probe success.
  - Added regressions in:
    - `packages/engine/test/unit/kernel/legal-choices.test.ts`
    - `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
    - `packages/engine/test/integration/decision-sequence.test.ts`
- Deviations from original plan:
  - No behavior-model deviations; implementation follows updated scope and preserves game-agnostic kernel behavior.
  - Verification was run as targeted build/typecheck + affected tests (below) rather than full workspace quality gates.
- Verification results:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine typecheck` ✅
  - `node --test dist/test/unit/kernel/legal-choices.test.js dist/test/unit/kernel/move-decision-sequence.test.js dist/test/integration/decision-sequence.test.js` (from `packages/engine`) ✅
