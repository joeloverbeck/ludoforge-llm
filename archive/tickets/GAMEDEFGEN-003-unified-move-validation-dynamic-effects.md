# GAMEDEFGEN-003: Unified Move Validation for Static and Dynamic Effect Decisions

**Status**: ✅ COMPLETED  
**Priority**: P0  
**Complexity**: M  
**Depends on**: `legalChoices`, `resolveMoveDecisionSequence`, `applyMove` validation path

## 1) Reassessed assumptions and scope

### Already true in code (ticket assumptions corrected)

- `applyMove` already validates decision-bearing moves through `resolveMoveDecisionSequence` (which delegates to `legalChoices`) before effect runtime.
- `legalChoices` already includes dynamic event effects via `resolveEventEffectList(...)`, so event-side and event-branch effects participate in pre-execution decision discovery/validation.
- Declared action param legality and decision param completeness are already handled as separate concerns in `validateMove`.

### Discrepancies in previous ticket draft

- The draft incorrectly scoped a large refactor as pending; the core architecture is already implemented.
- Proposed new test files did not match current test organization and are unnecessary duplicates:
  - `test/unit/kernel/move-validation-unified.test.ts` (not present)
  - `test/integration/event-decision-validation.test.ts` (not present)
- Existing tests cover decision sequencing broadly, but explicit assertion coverage for canonical apply-time failure codes (`OPERATION_INCOMPLETE_PARAMS`, `OPERATION_INVALID_PARAMS`) on dynamic event-side decisions is weak.

### Updated implementation scope

- Do not refactor kernel architecture in this ticket.
- Add/strengthen tests in existing suites to lock in invariants:
  - `applyMove` must return deterministic illegal-move reasons/metadata for incomplete vs invalid decision params.
  - Dynamic event-side decisions must fail pre-execution with the same canonical path/error semantics as static action decisions.
- Run full validation gates (`build`, `lint`, `test`) after test updates.

## 2) Architectural assessment

Current architecture is preferable to the original proposed rewrite:

- Single decision-validation path is already centered on `legalChoices` + `resolveMoveDecisionSequence`.
- Runtime and choice-walk semantics stay aligned because both evaluate the same effect trees (including dynamic event effects).
- Remaining work is assurance-oriented (tests), not structural change.

Potential future cleanup (out of scope here): reduce duplicated branching in `validateMove` between profiled and non-profiled actions by extracting shared error-mapping logic.

## 3) Invariants to enforce with tests

- No effect runtime failure caused by missing decision params when move passes validation.
- Validation outcome is consistent across `legalMoves`, `legalChoices`, and `applyMove`.
- Dynamic event-driven decisions are validated pre-execution exactly like static action decisions.
- Failure metadata codes for incomplete/invalid params stay deterministic (`OPERATION_INCOMPLETE_PARAMS`, `OPERATION_INVALID_PARAMS`).

## 4) Test plan

### Modified tests

- `test/unit/apply-move.test.ts`
  - add explicit coverage for:
    - incomplete dynamic event decision params -> `OPERATION_INCOMPLETE_PARAMS`
    - invalid dynamic event decision params -> `OPERATION_INVALID_PARAMS`
    - declared param mismatches remain distinct from decision-param failures

### Existing verification gates

- `npm run build`
- `npm run lint`
- `npm test`

## Outcome

- Completion date: 2026-02-15
- What was actually changed:
  - Corrected ticket assumptions/scope to reflect that major unification work already existed.
  - Fixed a real validation gap in `applyMove`: non-pipeline choice detection now includes dynamic event effects (`resolveEventEffectList`) when determining whether decision-sequence validation must run.
  - Added focused unit coverage in `test/unit/apply-move.test.ts` for:
    - incomplete dynamic event decision params -> `OPERATION_INCOMPLETE_PARAMS`
    - invalid dynamic event decision params -> `OPERATION_INVALID_PARAMS`
    - declared action param mismatch precedence over decision-param validation
- Deviations from original plan:
  - No broad refactor was performed because the core architecture was already in place; work was narrowed to targeted correctness + test hardening.
- Verification results:
  - `npm run build` passed
  - `npm run lint` passed
  - `npm test` passed
