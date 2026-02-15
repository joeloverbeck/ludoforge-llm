# GAMEDEFGEN-011: Unify Legality Outcome Taxonomy Across Kernel Surfaces

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Medium

## 1) What Needs To Change / Be Added

1. Introduce a single canonical legality outcome taxonomy in `src/kernel/` that covers applicability and predicate outcomes currently reported differently by `legalMoves`, `legalChoices`, and `applyMove`.
2. Replace ad-hoc string/code mappings with shared typed mappings from canonical outcomes to each surface-specific response shape:
   - `legalMoves`: inclusion/exclusion semantics.
   - `legalChoices`: `ChoiceIllegalRequest.reason` semantics.
   - `applyMove`: `ILLEGAL_MOVE` metadata code semantics.
3. Remove duplicated or divergent outcome naming paths and ensure each entry point depends on the canonical outcome source.
4. Keep the model game-agnostic and data-driven; no game-specific identifiers or branching.

## 2) Invariants That Should Pass

1. Equivalent legality failures map to one canonical outcome regardless of entry point.
2. Surface-specific projections are deterministic and stable.
3. Invalid selector/spec errors remain explicit runtime-contract failures and are not downgraded into legality outcomes.
4. The change introduces no game-specific behavior and preserves engine genericity.

## 3) Tests That Should Pass

1. Unit: canonical outcome type/mapper tests for each outcome variant.
2. Unit: `legalChoices` reason mapping parity tests for phase/actor/executor/limits/pipeline/predicate outcomes.
3. Unit: `applyMove` illegal metadata code mapping parity tests for the same scenarios.
4. Regression: existing kernel legality tests continue to pass without behavior regressions.
