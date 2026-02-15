# GAMEDEFGEN-010: Canonical Illegal-Reason Enums Across Legality APIs

**Status**: ✅ COMPLETED  
**Priority**: MEDIUM  
**Effort**: Small-Medium

## Assumption Reassessment (2026-02-15)

### What the ticket originally assumed

1. A canonical legality reason taxonomy does not yet exist.
2. `legalChoices`, `legalMoves`, and `applyMove` still drift on reason semantics.
3. Tests for cross-surface parity and canonical mapping are missing.

### What is actually true in current code

1. A canonical projection layer already exists in `src/kernel/legality-outcome.ts` (`KernelLegalityOutcome` + projection helpers).
2. Cross-surface runtime parity tests already exist (`test/unit/kernel/legality-outcome.test.ts`, `test/unit/kernel/legality-surface-parity.test.ts`).
3. Remaining discrepancy: reason unions are still duplicated in `src/kernel/types-core.ts` and `src/kernel/action-applicability-preflight.ts` instead of being owned by a single canonical type module.

### Corrected scope for this ticket

1. Keep existing behavior and existing reason values unchanged.
2. Introduce a single canonical ownership module for legality reason unions.
3. Refactor preflight/types/projection modules to consume canonical types from that module (remove duplicated union literals).
4. Strengthen tests to lock the single-source reason contract and prevent future drift.

## 1) What Needs To Change / Be Added

1. Define single-source canonical legality reason types in one kernel module (no duplicated union literals across surfaces).
2. Repoint `action-applicability-preflight`, `legality-outcome`, and `types-core` reason typing to that module.
3. Preserve existing runtime reason values and existing metadata code mappings.
4. Ensure taxonomy remains engine-generic and not game-specific.

## 2) Invariants That Should Pass

1. Illegal reason values are strongly typed and consistent across relevant kernel APIs.
2. Canonical reason type ownership exists in one place; consumer modules import it instead of re-declaring it.
3. Existing valid flows preserve behavior; only type ownership/refactoring changes.
4. Downstream consumers (agents/sim/test helpers) can rely on stable reason enums.

## 3) Tests That Should Pass

1. Unit: canonical reason mapping tests continue to pass (`legality-outcome` projections).
2. Unit: cross-surface parity tests continue to pass (`legalChoices`/`legalMoves`/`applyMove`).
3. Unit: add/strengthen tests to ensure canonical reason arrays/unions remain synchronized and exhaustive.
4. Regression: full relevant kernel test suites pass with unchanged runtime reason strings.

## Outcome

- Completion date: 2026-02-15
- Actually changed:
  - Added `src/kernel/legality-reasons.ts` as canonical ownership for legality reason unions (`ActionApplicabilityNotApplicableReason`, `KernelLegalityOutcome`, `ChoiceIllegalReason`).
  - Refactored `src/kernel/action-applicability-preflight.ts`, `src/kernel/legality-outcome.ts`, and `src/kernel/types-core.ts` to import canonical reason types instead of duplicating union literals.
  - Exported canonical reason module via `src/kernel/index.ts`.
  - Strengthened `test/unit/kernel/legality-outcome.test.ts` with a stable canonical-outcome-list assertion and projection checks using canonical outcomes.
- Deviations from original plan:
  - No behavioral/runtime reason-string changes were needed because projection behavior and cross-surface parity were already implemented before this ticket pass.
  - Scope focused on type ownership consolidation and drift prevention.
- Verification results:
  - `npm run build` passed.
  - Focused tests passed: `node --test dist/test/unit/kernel/legality-outcome.test.js dist/test/unit/kernel/legality-surface-parity.test.js dist/test/unit/kernel/action-applicability-preflight.test.js`.
  - Full unit suite passed: `npm run test:unit`.
  - Lint passed: `npm run lint`.
