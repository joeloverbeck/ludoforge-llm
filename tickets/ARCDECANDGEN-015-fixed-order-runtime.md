# ARCDECANDGEN-015: `fixedOrder` Turn Order Runtime Implementation

**Phase**: 5B (Generalized Turn Order Strategy)
**Priority**: P2
**Complexity**: S
**Dependencies**: ARCDECANDGEN-014 (`TurnOrderStrategy` union must exist)

## Goal

Implement full runtime support for `fixedOrder` turn order strategy: initial state, player advancement, and compiler validation.

## File List (files to touch)

### Files to modify
- `src/kernel/initial-state.ts` — handle `fixedOrder`: set `turnOrderState = { type: 'fixedOrder', currentIndex: 0 }`, set `activePlayer` from `order[0]`
- `src/kernel/phase-advance.ts` — handle `fixedOrder` in `advanceToDecisionPoint`: advance `currentIndex` modulo `order.length`, return `order[currentIndex]`
- `src/cnl/compile-turn-flow.ts` — validate `fixedOrder.order` non-empty → `CNL_COMPILER_FIXED_ORDER_EMPTY` (error); warn on duplicates → `CNL_COMPILER_FIXED_ORDER_DUPLICATE` (warning); validate all entries reference valid player IDs

### New/modified test files
- `test/unit/turn-order-strategy.test.ts` (new or extend)

## Out of Scope

- **No changes to** `cardDriven` logic (done in 014)
- **No changes to** `simultaneous` (done in 016)
- **No changes to** `data/games/fire-in-the-lake.md` (FITL uses `cardDriven`, not `fixedOrder`)
- **No changes to** `src/agents/`, `src/sim/`

## Acceptance Criteria

### Tests that must pass
- All existing tests pass
- `npm run typecheck` — passes
- `npm run lint` — passes

### New tests (in `test/unit/turn-order-strategy.test.ts`)
1. **"fixedOrder follows declared order"** — `order: ['2', '0', '1']` → activePlayer follows 2 → 0 → 1 → 2
2. **"fixedOrder initialState sets activePlayer to first in order"** — `order: ['player-b', 'player-a']` → `activePlayer === 'player-b'`, `currentIndex === 0`
3. **"fixedOrder cycles through all players and wraps"** — `order: ['a', 'b', 'c']`, after 4 moves: a → b → c → a
4. **"fixedOrder with empty order emits CNL_COMPILER_FIXED_ORDER_EMPTY"** — error diagnostic
5. **"fixedOrder with duplicate entries emits CNL_COMPILER_FIXED_ORDER_DUPLICATE"** — warning diagnostic, compilation still succeeds
6. **"fixedOrder with single player works"** — `order: ['solo']` → always `activePlayer === 'solo'` (boundary case from risk registry)

### Invariants that must remain true
- `currentIndex` wraps modulo `order.length`, never goes out of bounds
- Empty `order` array is a compile error, not a runtime crash
- `fixedOrder` does not interact with `cardDriven` machinery at all
