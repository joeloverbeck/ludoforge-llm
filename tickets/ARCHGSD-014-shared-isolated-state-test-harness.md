# ARCHGSD-014: Shared Isolated-State Test Harness for Operation Microtests

**Status**: TODO
**Priority**: P2
**Complexity**: S
**Parent spec**: specs/00-implementation-roadmap.md
**Depends on**: ARCHGSD-011

## Description

Several integration tests now locally clear board zones to isolate operation behavior from scenario-projected initial setup. Consolidate this into shared helpers to reduce duplication and prevent drift.

### What to Implement

1. Create shared test helper(s) for isolated operation initial state (zone-cleared baseline with configurable turn-order mode).
2. Refactor duplicated local helpers in affected FITL integration tests to use the shared helper.
3. Keep helper generic (not FITL-specific in logic), with test data providing game-specific zones/tokens.

## Files to Touch

- `test/helpers/` (new helper module)
- `test/integration/fitl-attack-die-roll.test.ts`
- `test/integration/fitl-capabilities-march-attack-bombard.test.ts`
- `test/integration/fitl-coin-operations.test.ts`
- `test/integration/fitl-insurgent-operations.test.ts`
- `test/integration/fitl-nva-vc-special-activities.test.ts`

## Out of Scope

- Changing operation semantics.
- Broad test rewrites outside affected files.

## Acceptance Criteria

### Tests That Must Pass

1. Refactored test files pass unchanged behavioral assertions.
2. New helper unit test(s) validate helper behavior:
   - zones are cleared deterministically;
   - turn-order mode selection works as expected.
3. `npm run build` passes.
4. `npm test` passes.
5. `npm run lint` passes.

### Invariants That Must Remain True

- Operation microtests remain isolated from scenario default setup state.
- No duplication of per-file ad hoc isolation logic after refactor.
- No game-specific logic moved into kernel/simulator.
