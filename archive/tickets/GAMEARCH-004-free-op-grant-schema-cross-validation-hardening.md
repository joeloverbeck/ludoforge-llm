# GAMEARCH-004: Free-Op Grant Schema and Cross-Validation Hardening

**Status**: ✅ COMPLETED
**Priority**: P2
**Complexity**: S
**Parent spec**: specs/29-fitl-event-card-encoding.md (engine/runtime alignment follow-up)
**Depends on**: none

## Description

`freeOperationGrants` shape is already enforced by `src/kernel/schemas-extensions.ts` and lowered via `src/cnl/compile-event-cards.ts`, but semantic references are not cross-validated in `src/cnl/cross-validate.ts` (faction IDs, action IDs, side/branch path precision).

### What Must Change

1. Add cross-validation for each grant entry:
   - `faction` must exist in `turnFlow.eligibility.factions` when turn order is `cardDriven`.
   - `actionIds` entries must reference declared actions.
2. Add path-precise diagnostics for both side-level and branch-level grant errors.
3. Ensure validators reject malformed/unknown refs at compile-time, not runtime.

## Reassessed Assumptions and Scope

- Structural validation for `freeOperationGrants` already exists in shared kernel schemas; this ticket is specifically about semantic cross-reference validation.
- The correct implementation point is `crossValidateSpec` (compiled-section cross-refs), not `validate-extensions.ts`.
- Existing unit coverage in `test/unit/cross-validate.test.ts` does not currently exercise grant faction/action reference failures.
- No runtime execution changes are required; this remains a compile-time diagnostics hardening task.

## Files to Touch

- `src/cnl/cross-validate.ts`
- `test/unit/cross-validate.test.ts`

## Out of Scope

- Runtime execution changes.
- Data-model/schema redesign for event grants.

## Acceptance Criteria

### Tests That Must Pass

1. Unit tests fail on unknown grant faction IDs.
2. Unit tests fail on unknown grant action IDs.
3. Unit tests fail with branch-level paths for unknown grant references.
4. Unit tests confirm valid grant references compile cleanly.
4. `npm run build` passes.
5. `npm test` passes.
6. `npm run lint` passes.

### Invariants That Must Remain True

- Invalid grant references are caught before runtime.
- Diagnostics are deterministic and path-precise.

## Outcome

- Completion date: 2026-02-14
- What was changed:
  - Added semantic cross-validation for `eventDeck` `freeOperationGrants` in `src/cnl/cross-validate.ts`.
  - Added path-precise diagnostics for side-level and branch-level grant refs:
    - `CNL_XREF_EVENT_DECK_GRANT_FACTION_MISSING`
    - `CNL_XREF_EVENT_DECK_GRANT_ACTION_MISSING`
  - Added unit coverage in `test/unit/cross-validate.test.ts` for unknown faction refs, unknown action refs, and valid refs.
- Deviations from original plan:
  - Did not modify `src/cnl/validate-extensions.ts` or `test/unit/validate-spec.test.ts` because reassessment showed grant semantic xref belongs in `crossValidateSpec`; structural validation already existed in shared schemas.
- Verification results:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
