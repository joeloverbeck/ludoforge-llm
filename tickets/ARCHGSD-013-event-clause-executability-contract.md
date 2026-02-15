# ARCHGSD-013: Event Clause Executability Contract (No Descriptive Gaps)

**Status**: TODO
**Priority**: P1
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md
**Depends on**: FITLEVECARENC-005

## Description

Close the gap where event text encodes gameplay effects that are not executable in effects/branches. Establish and enforce a contract that encoded gameplay clauses are runnable.

### What to Implement

1. Implement the currently descriptive-only gameplay clause for FITL `card-1` unshaded:
   - "moves 6 US pieces from out-of-play to any Cities" as executable effects.
2. Add validation/check(s) for event definitions to detect declared targeting intent without executable consumption when the side text specifies a gameplay effect.
3. Keep implementation generic and data-driven; no game-specific event handlers.

## Files to Touch

- `data/games/fire-in-the-lake.md`
- Event compiler/cross-validator modules if contract checks are implemented there
- `test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts`
- Possibly additional event validation tests under `test/integration/` or `test/unit/`

## Out of Scope

- Rewriting unrelated cards.
- Adding non-essential event DSL features not required by this clause.

## Acceptance Criteria

### Tests That Must Pass

1. Gulf of Tonkin integration test covers executable movement clause end-to-end (not just metadata/targets).
2. New negative test: event side with targeting intent but no executable effects fails validation/compile (if contract check implemented).
3. `npm run build` passes.
4. `npm test` passes.
5. `npm run lint` passes.

### Invariants That Must Remain True

- No partially descriptive gameplay clauses in implemented cards.
- No game-specific branching in kernel/simulator for event behavior.
- Deterministic execution from GameSpecDoc-defined data.
