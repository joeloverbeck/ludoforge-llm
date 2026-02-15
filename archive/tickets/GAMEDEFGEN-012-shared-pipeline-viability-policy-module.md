# GAMEDEFGEN-012: Introduce Shared Pipeline Viability Policy Module

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium

## 0) Corrected Assumptions (Reassessed Against Current Code/Tests)

1. A shared legality foundation already exists:
   - `src/kernel/action-applicability-preflight.ts` (from GAMEDEFGEN-008) centralizes phase/actor/executor/limits/pipeline-dispatch applicability.
   - `src/kernel/legality-outcome.ts` (from GAMEDEFGEN-011) centralizes canonical legality outcome projections across surfaces.
2. Pipeline viability policy is still partially duplicated in entry points:
   - `src/kernel/legal-moves.ts` inlines legality/cost template inclusion gating.
   - `src/kernel/legal-choices.ts` inlines pipeline legality-failure illegal signaling.
   - `src/kernel/apply-move.ts` inlines preflight-not-applicable illegal messaging and relies on local branching around template discoverability validation.
3. Existing tests already validate significant behavior parity (`test/unit/kernel/legality-surface-parity.test.ts`, `test/unit/kernel/legal-moves.test.ts`, `test/unit/kernel/legal-choices.test.ts`) but do not yet assert a standalone typed policy decision table module.

## Why This Change Is Architecturally Better

1. Extending the current shared architecture (preflight + canonical outcomes) with a shared viability policy module reduces semantic drift risk without adding a parallel policy stack.
2. Typed policy decisions make each surface adapter explicit and auditable, while preserving intentional surface differences.
3. Consolidation improves long-term extensibility by providing one game-agnostic place to evolve pipeline viability semantics.

## 1) What Needs To Change / Be Added

1. Add a shared pipeline viability policy module in `src/kernel/` that consumes:
   - preflight result / pipeline dispatch,
   - pipeline legality and cost predicate evaluations,
   - surface intent (`legalMoves` vs `legalChoices` vs `applyMove` validation projection).
2. Encode policy as explicit typed decisions rather than inline branching:
   - template inclusion/exclusion decision for `legalMoves`,
   - legality-outcome projection decision for `legalChoices`,
   - illegal-move projection decision for `applyMove` validation.
3. Refactor `legalMoves`, `legalChoices`, and `applyMove` to use the shared policy interface and remove duplicated policy branches.
4. Preserve current execution semantics:
   - `atomic` cost validation blocks operation viability;
   - `partial` cost validation does not block template discoverability;
   - no fallback to non-pipeline behavior when pipeline dispatch is configured but unmatched.

## 2) Invariants That Should Pass

1. Policy decisions are deterministic for equivalent `(def, state, action, move)` inputs.
2. Atomic vs partial pipeline semantics remain correct and unchanged.
3. No accidental fallback to non-pipeline action behavior when pipeline policy forbids execution.
4. Policy remains game-agnostic and driven only by GameDef data.

## 3) Tests That Should Pass

1. Unit: pipeline viability policy decision-table tests across applicability/legality/cost scenarios.
2. Unit: entry-point adapter tests proving each surface consumes policy results correctly.
3. Regression unit: existing `legalMoves`/`legalChoices`/`applyMove` pipeline behavior tests pass unchanged.
4. Full touched-suite verification: targeted kernel unit tests plus lint/build gates pass.

## Non-Goals

1. No replacement of preflight dispatch or legality outcome taxonomy modules.
2. No game-specific branching or schema specialization.
3. No broad rewrites outside pipeline viability policy and its direct entry-point adapters.

## Outcome

- Completion date: 2026-02-15
- What was changed:
  - Added shared policy module `src/kernel/pipeline-viability-policy.ts` for typed pipeline viability decisions.
  - Refactored `legalMoves`, `legalChoices`, and `applyMove` to consume shared policy decisions instead of duplicating legality/cost branching.
  - Exported policy module through `src/kernel/index.ts`.
  - Added/updated tests for policy decision tables and entry-point behavior parity.
- Deviations from original plan:
  - During implementation, cost-validation evaluation had to be made surface-aware (`includeCostValidation`) to preserve existing partial-pipeline discoverability semantics and avoid evaluating cost predicates where they are intentionally not part of viability gating.
  - `applyMove` now emits more specific illegal reasons for pipeline legality/cost failures instead of generic "not legal" text in affected tests.
- Verification results:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm run test:all` passed (210 tests, 0 failures).
