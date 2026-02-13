# ARCDECANDGEN-017: Turn Order Strategy Comprehensive Tests

**Phase**: 5 — verification (Generalized Turn Order Strategy)
**Priority**: P1
**Complexity**: S
**Dependencies**: ARCDECANDGEN-014, ARCDECANDGEN-015, ARCDECANDGEN-016

## Goal

Create the comprehensive test file for the `TurnOrderStrategy` discriminated union, verifying `roundRobin`, `fixedOrder`, `cardDriven`, and `simultaneous` behavior as defined in the spec. Some of these tests are created in 014-016, but this ticket ensures the full set is complete and covers cross-cutting concerns (Zobrist hashing, coupPlan placement).

## File List (files to touch)

### New test file to create
- `test/unit/turn-order-strategy.test.ts` (extend if partially created by 014-016)

### Files to read (no modification)
- `src/kernel/types-turn-flow.ts` — for understanding the type shapes
- `src/kernel/initial-state.ts` — for understanding initialization
- `src/kernel/zobrist.ts` — for hash testing

## Out of Scope

- **No source code changes** — this is a test-only ticket
- **No changes to** `src/`, `data/`, `schemas/`

## Acceptance Criteria

### Tests that must pass
- All existing tests pass
- `npm run typecheck` — passes
- `npm run lint` — passes

### Required tests (in `test/unit/turn-order-strategy.test.ts`)
1. **"roundRobin advances player in cyclic order"** — 3 players, after each move cycles 0 → 1 → 2 → 0
2. **"fixedOrder follows declared order"** — `order: ['2', '0', '1']` → 2 → 0 → 1 → 2
3. **"cardDriven eligibility matches FITL turnFlow behavior"** — reuse FITL scenario, assert identical behavior
4. **"simultaneous marks all players as needing submission"** — 4 players → correct `submitted` map
5. **"turnOrderState is always present in initialState"** — no `turnOrder` declared → defaults to `roundRobin` → `state.turnOrderState === { type: 'roundRobin' }`
6. **"Zobrist hash is deterministic for cardDriven state"** — two identical states → identical hashes; different eligibility → different hashes
7. **"coupPlan inside cardDriven config compiles successfully"** — `turnOrder.type = 'cardDriven'` with `config.coupPlan` → compiles, populated
8. **"coupPlan at GameSpecDoc root is rejected"** — old format → error diagnostic
9. **"fixedOrder initialState sets activePlayer to first in order"** — `['player-b', 'player-a']` → `activePlayer === 'player-b'`
10. **"fixedOrder cycles through all players and wraps"** — 3 players, 4 moves
11. **"fixedOrder with empty order emits CNL_COMPILER_FIXED_ORDER_EMPTY"**
12. **"simultaneous compilation emits CNL_COMPILER_SIMULTANEOUS_NOT_IMPLEMENTED warning"** — warning, not error
13. **"simultaneous initialState succeeds"**

### Invariants that must remain true
- All 13 tests pass
- Tests are deterministic (fixed seeds where applicable)
- No test depends on execution order
