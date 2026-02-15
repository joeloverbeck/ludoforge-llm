# GAMEDEFGEN-011: Unify Legality Outcome Taxonomy Across Kernel Surfaces

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium

## 0) Reassessed Baseline (Code/Test Reality)

1. Applicability outcomes are already centralized for preflight gating in `resolveActionApplicabilityPreflight` via `ActionApplicabilityNotApplicableReason`:
   - `phaseMismatch`
   - `actorNotApplicable`
   - `executorNotApplicable`
   - `actionLimitExceeded`
   - `pipelineNotApplicable`
2. `legalChoices` currently maps preflight outcomes using local branching and independently maps pipeline legality failure to `pipelineLegalityFailed`.
3. `applyMove` currently maps preflight outcomes to `ILLEGAL_MOVE` metadata codes via local branching. Decision-sequence legality failures were being collapsed to `OPERATION_NOT_DISPATCHABLE`, which obscured canonical parity (for example pipeline legality failure was not projected to `OPERATION_LEGALITY_FAILED` during validation).
4. `legalMoves` uses inclusion/exclusion semantics and does not expose reason payloads, so parity must be expressed as deterministic filtering behavior rather than emitted reason values.
5. Existing tests cover many individual cases, but there is no explicit shared-mapper parity suite asserting canonical-to-surface projection consistency.

## 1) What Needs To Change / Be Added

1. Introduce a canonical legality outcome taxonomy in `src/kernel/` that:
   - reuses existing preflight applicability outcomes; and
   - adds the missing predicate outcome needed for pipeline legality failure parity.
2. Replace local branching mappings with shared typed projection helpers from canonical outcomes to each surface-specific response shape:
   - `legalMoves`: inclusion/exclusion semantics.
   - `legalChoices`: `ChoiceIllegalRequest.reason` semantics.
   - `applyMove`: `ILLEGAL_MOVE` metadata code semantics.
3. Remove duplicated or divergent mapping paths in `legalChoices` and `applyMove` by routing both through shared projections.
4. Keep the model game-agnostic and data-driven; no game-specific identifiers or branching.

## 2) Invariants That Should Pass

1. Equivalent applicability and legality-predicate failures map to one canonical outcome regardless of entry point.
2. Surface-specific projections are deterministic and stable.
3. Invalid selector/spec errors remain explicit runtime-contract failures and are not downgraded into legality outcomes.
4. The change introduces no game-specific behavior and preserves engine genericity.

## 3) Tests That Should Pass

1. Unit: canonical outcome type/mapper tests for each outcome variant.
2. Unit: `legalChoices` reason projection parity tests for phase/actor/executor/limits/pipeline/predicate outcomes.
3. Unit: `applyMove` illegal metadata code projection parity tests for the same scenarios.
4. Unit: `legalMoves` deterministic inclusion/exclusion parity tests for canonical outcomes that gate move emission.
5. Regression: existing kernel legality tests continue to pass without behavior regressions.

## Outcome

- Completion date: 2026-02-15
- What changed:
  - Added canonical legality outcome projections in `src/kernel/legality-outcome.ts`.
  - Routed `legalChoices` and `applyMove` legality projection through shared typed mappers.
  - Aligned `applyMove` decision-sequence illegal projection to preserve canonical reason-to-code parity (instead of collapsing to `OPERATION_NOT_DISPATCHABLE`).
  - Added parity coverage in `test/unit/kernel/legality-outcome.test.ts` and `test/unit/kernel/legality-surface-parity.test.ts`.
- Deviations from original plan:
  - Scope was narrowed/clarified to extend the existing preflight taxonomy rather than replacing it wholesale, because applicability outcomes were already centralized.
  - Included a targeted behavior fix in `applyMove` validation mapping to close a parity gap discovered during reassessment.
- Verification results:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm run test:all` passed.
