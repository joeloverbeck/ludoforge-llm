# GAMEDEFGEN-026: Legality Reason Taxonomy Normalization

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium

## 0) Reassessed baseline (code + tests as of 2026-02-15)

1. The repo already has a dedicated pipeline viability outcome for atomic cost failure:
   - `pipelineAtomicCostValidationFailed` in `src/kernel/pipeline-viability-policy.ts`.
2. Canonical legality taxonomy does **not** include that outcome:
   - `KERNEL_LEGALITY_OUTCOMES`/`ChoiceIllegalReason` in `src/kernel/legality-reasons.ts` only include `pipelineLegalityFailed`.
3. Lossy projection currently exists in discovery/choice flow:
   - `decideDiscoveryLegalChoicesPipelineViability()` maps atomic cost failure to `pipelineLegalityFailed`.
4. `applyMove` has dedicated illegal reasons for legality vs atomic cost (`ACTION_PIPELINE_LEGALITY_PREDICATE_FAILED` vs `ACTION_PIPELINE_COST_VALIDATION_FAILED`) but does not reuse a single canonical projection table for metadata codes.
5. Tests already exist for much of this space:
   - `test/unit/kernel/legality-outcome.test.ts`
   - `test/unit/kernel/pipeline-viability-policy.test.ts`
   - `test/unit/kernel/legality-surface-parity.test.ts`
   The gap is that canonical taxonomy/projection tests do not cover atomic cost as its own canonical reason, and parity tests do not include a dedicated legalChoices reason for that root cause.

## 1) Updated implementation scope

1. Promote `pipelineAtomicCostValidationFailed` to a canonical legality outcome in shared taxonomy (`KernelLegalityOutcome` / `ChoiceIllegalReason`).
2. Normalize projections in one place so this outcome has deterministic mappings for:
   - legal choices illegal reason
   - legal move exclusion reason
   - `applyMove` illegal metadata code projection
3. Remove lossy discovery mapping:
   - atomic cost failure in discovery legal-choices flow must no longer alias to `pipelineLegalityFailed`.
4. Preserve current no-back-compat stance:
   - update tests/contracts to the normalized taxonomy.
5. Keep engine generic:
   - no game-specific branches or identifiers.

## 2) What must be added/fixed

1. Extend legality reason taxonomy to include atomic cost validation failure as a first-class canonical outcome.
2. Normalize mapping rules between:
   - `ChoiceIllegalReason`
   - legal move exclusion reasons
   - `applyMove` illegal metadata/reason codes
3. Eliminate lossy reason translation in discovery legal-choices viability.
4. Keep backward compatibility out of scope: update all affected tests/contracts to the normalized taxonomy.

## 3) Invariants that must pass

1. Each distinct viability failure class has one canonical reason identity.
2. Reason projection between surfaces is deterministic and non-lossy.
3. Illegal reason payloads remain machine-comparable and stable for regression tests.
4. No game-specific reason branches are introduced.

## 4) Tests that must pass

1. Unit: update/add exhaustive mapping table tests for all canonical legality outcomes, including atomic cost validation failure.
2. Unit: update parity tests to assert that atomic cost failure root causes map to dedicated reasons (not legality-failed aliases).
3. Unit: update pipeline viability policy tests so discovery legal-choices atomic cost failure returns the dedicated canonical outcome.
4. Regression: existing move legality and pipeline policy suites pass after taxonomy migration.

## Outcome

- Completion date: 2026-02-15
- What changed:
  - Added `pipelineAtomicCostValidationFailed` to canonical legality taxonomy (`KernelLegalityOutcome` / `ChoiceIllegalReason`).
  - Unified projection mapping by adding canonical apply-move metadata projection for atomic cost failure (`OPERATION_COST_BLOCKED`) in `LEGALITY_OUTCOME_PROJECTIONS`.
  - Centralized canonical `KernelLegalityOutcome -> applyMove IllegalMoveReason` projection in `LEGALITY_OUTCOME_PROJECTIONS` and refactored `applyMove` to consume it instead of local branch mappings.
  - Removed lossy discovery mapping by returning `pipelineAtomicCostValidationFailed` from discovery legal-choices viability when atomic cost validation fails.
  - Expanded parity/mapping coverage in kernel unit tests for the dedicated atomic cost taxonomy path.
- Deviations from original plan:
  - None. Work focused on normalization and non-lossy projection, with no game-specific logic introduced.
- Verification results:
  - `npm run build` passed.
  - Targeted tests passed:
    - `node --test dist/test/unit/kernel/legality-outcome.test.js`
    - `node --test dist/test/unit/kernel/pipeline-viability-policy.test.js`
    - `node --test dist/test/unit/kernel/legality-surface-parity.test.js`
  - `npm run test:unit` passed.
  - `npm run lint` passed.
