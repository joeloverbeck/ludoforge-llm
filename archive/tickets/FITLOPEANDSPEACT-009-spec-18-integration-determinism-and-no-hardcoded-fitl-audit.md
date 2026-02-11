# FITLOPEANDSPEACT-009 - Spec 18 Integration, Determinism, and No-Hardcoded-FITL Audit

**Status**: ✅ COMPLETED  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: `FITLOPEANDSPEACT-001` through `FITLOPEANDSPEACT-008`

## Goal
Close Spec 18 with full integration coverage across operation + special-activity sequencing, free/limited-operation interactions, deterministic trace regression, and explicit no-hardcoded-FITL audit checks.

## Scope
- Reassess and align Spec 18 closure checks with the current test layout (which already splits operation/special-activity families across focused integration suites).
- Add missing integration-level determinism coverage for operation-heavy FITL profile execution.
- Add explicit audit tests preventing FITL-id/name branching in shared compiler/kernel paths.
- Verify illegal attempts continue producing deterministic diagnostics with faction/rule reasons.

## Reassessed assumptions
- The "all 16 families" integration coverage already exists in:
  - `test/integration/fitl-coin-operations.test.ts`
  - `test/integration/fitl-insurgent-operations.test.ts`
  - `test/integration/fitl-us-arvn-special-activities.test.ts`
  - `test/integration/fitl-nva-vc-special-activities.test.ts`
- A new consolidated `fitl-operations-special-activities-e2e` file is not required for Spec 18 closure.
- The existing `test/integration/fitl-card-flow-determinism.test.ts` currently validates card-flow determinism but is not operation-profile heavy.
- There is currently no explicit "no hardcoded FITL in shared kernel/compiler" audit test.

## File list it expects to touch
- `test/integration/fitl-card-flow-determinism.test.ts`
- `test/unit/no-hardcoded-fitl-audit.test.ts` (new)
- `specs/18-fitl-operations-and-special-activities.md` (status update when complete)

## Out of scope
- New gameplay capabilities beyond Spec 18 contract.
- Spec 19 coup-round or victory-rule implementation.
- Spec 20 event-card framework changes.
- Broad refactors unrelated to operation/special-activity execution.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `npm run test:unit -- --coverage=false`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`
- `node --test dist/test/integration/determinism-full.test.js`
- `node --test dist/test/integration/fitl-coin-operations.test.js`
- `node --test dist/test/integration/fitl-insurgent-operations.test.js`
- `node --test dist/test/integration/fitl-us-arvn-special-activities.test.js`
- `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`
- `npm test`

## Invariants that must remain true
- Same seed + same choices yields byte-identical trace output.
- All operations/special activities execute only via `GameSpecDoc -> GameDef -> simulation`.
- Shared compiler/kernel modules contain no FITL-specific branching by id/name.
- Non-FITL fixtures continue compiling and running unchanged.

## Outcome
- **Completion date**: 2026-02-11
- **What changed**:
  - Ticket assumptions and file targets were corrected to match current repository reality (existing split integration coverage for all 16 operation/special-activity families).
  - `test/integration/fitl-card-flow-determinism.test.ts` was extended with operation-profile-heavy deterministic replay checks across all FITL operation/special-activity fixture families.
  - `test/unit/no-hardcoded-fitl-audit.test.ts` was added to fail if FITL-specific identifiers appear in shared `src/kernel` or `src/cnl` modules.
- **Deviations from original plan**:
  - No consolidated `fitl-operations-special-activities-e2e` test file was added because coverage already existed in focused integration suites.
  - No new `fitl-operations-special-activities.golden.json` fixture was required; determinism coverage was added directly in integration assertions.
- **Verification**:
  - Passed: `npm run build`
  - Passed: `npm run test:unit -- --coverage=false`
  - Passed: targeted deterministic/integration commands listed in this ticket
  - Passed: `npm test`
