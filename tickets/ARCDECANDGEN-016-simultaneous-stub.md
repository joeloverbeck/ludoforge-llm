# ARCDECANDGEN-016: `simultaneous` Turn Order Type Stub

**Phase**: 5C (Generalized Turn Order Strategy)
**Priority**: P3
**Complexity**: S
**Dependencies**: ARCDECANDGEN-014 (`TurnOrderStrategy` union must exist)

## Goal

Define the `simultaneous` turn order strategy at the type level. No runtime implementation — just the type, initial state, and a compiler warning.

## File List (files to touch)

### Files to modify
- `src/cnl/compile-turn-flow.ts` — emit `CNL_COMPILER_SIMULTANEOUS_NOT_IMPLEMENTED` (severity: warning) when `turnOrder.type === 'simultaneous'`
- `src/kernel/initial-state.ts` — handle `simultaneous`: set `turnOrderState = { type: 'simultaneous', submitted: {} }`

**Note**: Types are already defined in ARCDECANDGEN-014. `legalMoves` and `applyMove` do NOT handle `simultaneous` — they fall through to the `never` exhaustiveness check, throwing at runtime if a simultaneous game is actually played.

### New/modified test files
- `test/unit/turn-order-strategy.test.ts` — add simultaneous-specific tests

## Out of Scope

- **No runtime `legalMoves`/`applyMove` handling** for `simultaneous` — this is explicitly deferred
- **No changes to** `data/games/fire-in-the-lake.md`
- **No changes to** `src/agents/`, `src/sim/`
- **No changes to** `cardDriven` or `fixedOrder` logic

## Acceptance Criteria

### Tests that must pass
- All existing tests pass
- `npm run typecheck` — passes
- `npm run lint` — passes

### New tests
1. **"simultaneous compilation emits CNL_COMPILER_SIMULTANEOUS_NOT_IMPLEMENTED warning"** — assert warning diagnostic, compilation still succeeds (warning, not error)
2. **"simultaneous initialState succeeds"** — `turnOrderState = { type: 'simultaneous', submitted: {} }`
3. **"simultaneous marks all players as needing submission"** — 4 players → `submitted = { '0': false, '1': false, '2': false, '3': false }`

### Invariants that must remain true
- Compiler warning is emitted but does not block compilation
- `initialState` succeeds for `simultaneous`
- Attempting to play a simultaneous game at runtime throws (exhaustiveness check)
