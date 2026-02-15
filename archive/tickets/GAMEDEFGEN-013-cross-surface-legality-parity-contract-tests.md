# GAMEDEFGEN-013: Add Cross-Surface Legality Parity Contract Tests

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium

## Assumption Reassessment (2026-02-15)

Observed current state:
1. A parity suite already exists at `test/unit/kernel/legality-surface-parity.test.ts`.
2. Existing coverage is partial and non-table-driven (currently covers `phaseMismatch`, `actionLimitExceeded`, `pipelineNotApplicable`, `pipelineLegalityFailed`).
3. Cross-surface malformed applicability evaluation parity is covered in `test/unit/applicability-dispatch.test.ts`, but malformed selector/predicate parity is still fragmented across multiple files.

Discrepancy vs original ticket assumptions:
1. The ticket assumed the parity suite did not exist yet.
2. The ticket scope implied full scenario parity coverage was absent; in reality, only a subset is missing.

## 1) Updated Scope (What Still Needs To Change)

1. Refactor/expand `test/unit/kernel/legality-surface-parity.test.ts` into a table-driven contract suite.
2. Add missing not-applicable outcome parity scenarios:
   - `actorNotApplicable`
   - `executorNotApplicable`
3. Add contract tests asserting typed error projection consistency across surfaces for:
   - malformed selector spec (`RUNTIME_CONTRACT_INVALID` with selector/surface context)
   - malformed pipeline predicate evaluation (`ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED`)
4. Keep fixtures generic and engine-level (no game-specific branching/hardcoding).

## 2) Invariants That Must Hold

1. Equivalent scenarios produce parity-consistent outcomes across all entry points.
2. Divergences are only those explicitly specified by surface contract (discoverability vs illegality signaling vs exception).
3. Malformed predicate and selector errors retain typed runtime error behavior.
4. Parity tests remain deterministic and stable under repeated runs.

## 3) Test Targets

1. New unit contract suite for cross-surface legality parity (table-driven).
2. Unit coverage for malformed predicate and selector error projection consistency.
3. Regression: existing legality/applicability dispatch tests continue to pass.
4. Full kernel unit suite for touched files passes.

## Outcome

- Completion date: 2026-02-15
- What changed:
  - Reassessed and corrected ticket assumptions to reflect existing partial parity coverage.
  - Expanded `test/unit/kernel/legality-surface-parity.test.ts` into a table-driven contract suite.
  - Added missing not-applicable parity cases: `actorNotApplicable` and `executorNotApplicable`.
  - Added cross-surface typed error projection checks for malformed selector specs and malformed legality predicate evaluation.
- Deviations from original plan:
  - No production kernel code changes were needed; architecture already centralizes parity mapping via `legality-outcome.ts`, so only contract test coverage was expanded.
- Verification results:
  - `npm run build` passed.
  - `npm run test` passed.
  - `npm run lint` passed.
