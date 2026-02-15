# ARCHGSD-014: Shared Isolated-State Test Harness for Operation Microtests

**Status**: ✅ COMPLETED
**Priority**: P2
**Complexity**: S
**Parent spec**: specs/00-implementation-roadmap.md
**Depends on**: ARCHGSD-011

## Description

Several integration tests now locally clear board zones to isolate operation behavior from scenario-projected initial setup. Consolidate this into shared helpers to reduce duplication and prevent drift.

## Assumption Reassessment (2026-02-15)

### Verified Against Current Code

- The listed operation-focused FITL integration suites still each define local `operationInitialState` helpers that clear all zones.
- No shared helper currently exists in `test/helpers/` for this concern.
- Duplicated zone-clearing logic also exists in non-operation suites:
  - `test/integration/fitl-rvn-leader.test.ts`
  - `test/integration/fitl-modifiers-smoke.test.ts`
  - `test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts`

### Scope Correction

- This ticket is explicitly limited to operation microtests (the five FITL operation suites listed below).
- Broad cross-suite consolidation (including leader/modifier/event suites) is out of scope for this ticket and should be handled by a follow-up ticket to keep changes reviewable.

### Architecture Direction

- Prefer a single generic isolated-state helper in `test/helpers/` with configurable turn-order mode.
- Keep helper behavior game-agnostic and driven by provided `GameDef`/`GameState`, with no FITL-specific branches.
- Remove per-file ad hoc isolated-state construction in this ticket's target suites.

### What to Implement

1. Create shared test helper(s) for isolated operation initial state (zone-cleared baseline with configurable turn-order mode).
2. Refactor duplicated local helpers in affected FITL integration tests to use the shared helper.
3. Keep helper generic (not FITL-specific in logic), with test data providing game-specific zones/tokens.

## Files to Touch

- `test/helpers/` (new helper module)
- `test/unit/helpers/` (new helper tests)
- `test/integration/fitl-attack-die-roll.test.ts`
- `test/integration/fitl-capabilities-march-attack-bombard.test.ts`
- `test/integration/fitl-coin-operations.test.ts`
- `test/integration/fitl-insurgent-operations.test.ts`
- `test/integration/fitl-nva-vc-special-activities.test.ts`

## Out of Scope

- Changing operation semantics.
- Broad test rewrites outside affected files.
- Refactoring non-operation suites that currently duplicate zone-clearing helpers.

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
- No duplication of per-file ad hoc isolation logic in the targeted operation microtest files after refactor.
- No game-specific logic moved into kernel/simulator.

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Added shared generic test helper module: `test/helpers/isolated-state-helpers.ts`
    - `clearAllZones(state)`
    - `makeIsolatedInitialState(def, seed, playerCount, { turnOrderMode })`
  - Refactored targeted operation microtest suites to use shared helper-driven isolated state:
    - `test/integration/fitl-attack-die-roll.test.ts`
    - `test/integration/fitl-capabilities-march-attack-bombard.test.ts`
    - `test/integration/fitl-coin-operations.test.ts`
    - `test/integration/fitl-insurgent-operations.test.ts`
    - `test/integration/fitl-nva-vc-special-activities.test.ts`
  - Added helper-focused unit coverage: `test/unit/isolated-state-helpers.test.ts`
- **Deviation from original plan**:
  - Scope was explicitly constrained to operation microtests after reassessment, while noting additional non-operation duplicates for follow-up.
- **Verification results**:
  - `npm run build` passed.
  - Targeted tests passed:
    - `dist/test/unit/isolated-state-helpers.test.js`
    - `dist/test/integration/fitl-attack-die-roll.test.js`
    - `dist/test/integration/fitl-capabilities-march-attack-bombard.test.js`
    - `dist/test/integration/fitl-coin-operations.test.js`
    - `dist/test/integration/fitl-insurgent-operations.test.js`
    - `dist/test/integration/fitl-nva-vc-special-activities.test.js`
  - `npm test` passed.
  - `npm run lint` passed.
