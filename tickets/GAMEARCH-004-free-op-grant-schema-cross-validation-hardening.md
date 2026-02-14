# GAMEARCH-004: Free-Op Grant Schema and Cross-Validation Hardening

**Status**: TODO
**Priority**: P2
**Complexity**: S
**Parent spec**: specs/29-fitl-event-card-encoding.md (engine/runtime alignment follow-up)
**Depends on**: none

## Description

`freeOperationGrants` shape is validated, but semantic references are not fully cross-validated (faction IDs, action IDs, contextual coherence).

### What Must Change

1. Add cross-validation for each grant entry:
   - `faction` must exist in `turnFlow.eligibility.factions` when turn order is `cardDriven`.
   - `actionIds` entries must reference declared actions.
2. Add clear diagnostics paths for side-level and branch-level grant errors.
3. Ensure validators reject malformed/unknown refs at compile-time, not runtime.

## Files to Touch

- `src/cnl/cross-validate.ts`
- `src/cnl/validate-extensions.ts` (if additional structural checks needed)
- `test/unit/cross-validate.test.ts`
- `test/unit/validate-spec.test.ts`

## Out of Scope

- Runtime execution changes.

## Acceptance Criteria

### Tests That Must Pass

1. Unit tests fail on unknown grant faction IDs.
2. Unit tests fail on unknown grant action IDs.
3. Unit tests confirm valid grant references compile cleanly.
4. `npm run build` passes.
5. `npm test` passes.
6. `npm run lint` passes.

### Invariants That Must Remain True

- Invalid grant references are caught before runtime.
- Diagnostics are deterministic and path-precise.
