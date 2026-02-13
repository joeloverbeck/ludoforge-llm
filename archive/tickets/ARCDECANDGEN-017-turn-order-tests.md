# ARCDECANDGEN-017: Turn Order Strategy Comprehensive Tests

**Status**: ✅ COMPLETED
**Phase**: 5 — verification (Generalized Turn Order Strategy)
**Priority**: P1
**Complexity**: S
**Dependencies**: ARCDECANDGEN-014, ARCDECANDGEN-015, ARCDECANDGEN-016

## Goal

Reassess turn-order test assumptions against current code, then close remaining test gaps with focused hardening in existing suites.

## Assumption Reassessment (February 13, 2026)

1. The ticket assumed a new monolithic file `test/unit/turn-order-strategy.test.ts`.
   Current reality: turn-order coverage is intentionally distributed across strategy-specific suites (`initial-state`, `phase-advance`, `compile-top-level`, integration tests). A monolithic file would duplicate fixtures and reduce maintainability.
2. The ticket assumed root-level `coupPlan` should be rejected as a current input contract.
   Current reality: the supported contract is `turnOrder.type = 'cardDriven'` with `turnOrder.config.coupPlan`; parser/compiler validation is already aligned to this.
3. The ticket assumed fixed-order player IDs are arbitrary labels (example `player-b`).
   Current reality: runtime resolves fixed-order entries as numeric player indices encoded as strings (e.g. `'2'`, `'0'`, `'1'`).
4. Several required checks were already implemented by ARCDECANDGEN-014/015/016 and existing tests, but a few invariants remained under-specified (multi-player cyclic order and fixed-order empty diagnostic coverage).

## Architecture Assessment

The current architecture (`turnOrder` + discriminated `turnOrderState`) is more beneficial than the legacy split model and aligns with `specs/32-architecture-decomposition-and-generalization.md`:
- one explicit sequencing abstraction,
- data-driven strategy variants (`roundRobin`, `fixedOrder`, `cardDriven`, `simultaneous`),
- no backward-compat aliases.

Additional architecture note discovered during reassessment:
- `fixedOrder` currently uses stringified numeric player IDs and runtime parsing; this is workable but weaker than a canonical player-identifier model. A future follow-up should replace ad-hoc numeric string parsing with a typed player identity contract.

## Updated Scope (Executed)

- Keep test coverage distributed in existing suites (no new monolithic turn-order test file).
- Add missing invariant tests only where coverage was thin.
- No production code changes.

## Files Modified

- `test/unit/initial-state.test.ts`
- `test/unit/phase-advance.test.ts`
- `test/unit/compile-top-level.test.ts`

## Added/Strengthened Tests

1. `test/unit/initial-state.test.ts`
   - `always initializes turnOrderState, defaulting to roundRobin when turnOrder is omitted`
   - `sets activePlayer to the first fixedOrder entry when it is a valid numeric player id`
2. `test/unit/phase-advance.test.ts`
   - `cycles roundRobin order across players and wraps to player 0`
   - `follows fixedOrder sequence and wraps after the final entry`
3. `test/unit/compile-top-level.test.ts`
   - `returns a blocking diagnostic when fixedOrder is declared with an empty order array`

## Acceptance / Verification

- `npm run build` passed.
- Targeted hard checks passed:
  - `node --test dist/test/unit/compile-top-level.test.js dist/test/unit/initial-state.test.js dist/test/unit/phase-advance.test.js`
- Full required regression gate passed:
  - `npm run test` (1116/1116 passing)

## Outcome

- Completion date: 2026-02-13
- What was actually changed:
  - Corrected stale ticket assumptions to match implemented architecture and test organization.
  - Added focused test coverage for missing turn-order invariants.
- Deviations from original plan:
  - Did not create `test/unit/turn-order-strategy.test.ts`; retained distributed architecture-aligned test layout.
  - Kept scope test-only, with no kernel/compiler runtime edits.
- Verification results:
  - Build and targeted/new tests pass.
  - Full `npm run test` regression suite passes.
