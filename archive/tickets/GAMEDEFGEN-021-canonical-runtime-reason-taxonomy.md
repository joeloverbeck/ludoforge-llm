# GAMEDEFGEN-021: Canonical Runtime Reason Taxonomy Across Kernel Errors

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium

## Reassessed Baseline (Current Code/Test Reality)

1. `src/kernel/legality-reasons.ts` already centralizes legality outcomes (`phaseMismatch`, `actorNotApplicable`, etc.) and is covered by `test/unit/kernel/legality-outcome.test.ts`.
2. Runtime reason ownership is still split:
   - `src/kernel/runtime-error.ts` inlines reason literals like `invalidSelectorSpec`, `applicabilityEvaluationFailed`, and `pipelinePredicateEvaluationFailed`.
   - `src/kernel/effect-error.ts` defines a separate `EffectRuntimeReason` union with its own reason literals.
3. Existing tests already assert these values in runtime and effect contracts:
   - `test/unit/kernel/runtime-error-contracts.test.ts`
   - `test/unit/effect-error-contracts.test.ts`
   - parity/runtime path tests across `legalMoves`, `legalChoices`, and `applyMove`.
4. Therefore, the gap is not legality-outcome centralization; the gap is missing single-source ownership for non-legality runtime reason tags across kernel runtime/effect surfaces.

## 1) What Needs To Change / Be Added (Updated Scope)

1. Introduce one canonical runtime-reason taxonomy module for kernel runtime/effect reason tags.
2. Migrate `runtime-error.ts` and `effect-error.ts` to import reason constants/types from that module (no inlined reason literals for canonical runtime tags).
3. Keep `legality-reasons.ts` as the legality-outcome domain module; do not duplicate those outcomes into the new runtime-reason taxonomy.
4. Preserve behavior, error codes, and human-readable messages while enforcing typed canonical reason ownership for machine-readable reason tags.
5. No aliasing/back-compat shims: callers should use canonical reason exports directly.

## 2) Invariants That Should Pass

1. Non-legality runtime reason values are owned in one canonical module and imported by all runtime/effect error producers.
2. No duplicate semantic runtime reasons exist under different strings.
3. Runtime reason taxonomy stays engine-generic and game-agnostic.
4. Existing runtime/effect error behavior and diagnostics remain stable while reason ownership becomes canonical.

## 3) Tests That Should Pass

1. Unit: canonical runtime reason registry tests assert expected non-legality reason sets/types.
2. Unit: runtime error producers (`selector`, `pipeline`) emit only canonical reason members.
3. Unit: effect runtime error producers emit only canonical reason members.
4. Regression: existing legality/runtime-contract and parity suites continue passing with canonical reason ownership enforced.

## Outcome

- Completion date: 2026-02-15
- Implemented:
  - Added canonical taxonomy module `src/kernel/runtime-reasons.ts` covering runtime-contract, pipeline-runtime, and effect-runtime reason tags.
  - Migrated `src/kernel/runtime-error.ts`, `src/kernel/selector-runtime-contract.ts`, and `src/kernel/effect-error.ts` to consume canonical exported reason constants/types.
  - Canonicalized illegal-move runtime reasons and made `ILLEGAL_MOVE.reason` the authoritative machine-readable discriminator.
  - Removed redundant `ILLEGAL_MOVE.context.metadata.code` duplication from apply-move emitters; metadata now carries only non-redundant contextual detail.
  - Exported taxonomy through `src/kernel/index.ts`.
  - Added `test/unit/kernel/runtime-reasons.test.ts` to lock reason registry shape and deduplication.
  - Strengthened existing contract tests to reference canonical runtime reason constants in `test/unit/kernel/runtime-error-contracts.test.ts` and `test/unit/effect-error-contracts.test.ts`.
  - Updated legality/parity and FITL integration tests to assert canonical illegal-move reason tags directly rather than duplicated metadata codes.
- Deviations from original plan:
  - Kept legality-outcome ownership in `src/kernel/legality-reasons.ts` (already canonical), and limited this ticket to non-legality runtime reasons to avoid redundant taxonomy duplication.
- Verification:
  - `npm run lint` passed.
  - `npm run build` passed.
  - `npm run test:all` passed after rebuild (`215` tests, `0` failures).
