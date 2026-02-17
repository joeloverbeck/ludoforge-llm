# ENGINEARCH-005: Satisfiability-Aware Choice Legality

**Status**: PENDING
**Spec**: 35 (Frontend Integration Boundaries), 39 (React DOM UI Layer)
**Priority**: P1
**Depends on**: ENGINEARCH-003, ENGINEARCH-004
**Estimated complexity**: L

---

## Summary

Upgrade option legality evaluation from immediate-step illegality checks to full decision-sequence satisfiability semantics for complex/nested choices.

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
  - add nested-choice regression where immediate step passes but downstream sequence is unsatisfiable.
  - assert evaluated legality classification matches satisfiability outcome.
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
  - assert consistency between sequence satisfiability and legality labels.
- `packages/engine/test/integration/decision-sequence.test.ts`
  - add end-to-end regression for nested/template decisions with satisfiability-sensitive options.
- Existing quality gates remain green:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/runner lint`
