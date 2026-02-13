# ARCDECANDGEN-021: Event Deck Kernel Execution

**Phase**: 8B (Generic Event Deck Subsystem — kernel)
**Priority**: P2
**Complexity**: L
**Dependencies**: ARCDECANDGEN-020 (event deck types)

## Goal

Implement the kernel module for event card execution: draw, side selection, applicability check, branch resolution, target resolution, effect application, lasting effect registration, and discard. Also initialize `activeLastingEffects` in initial state and hash it in Zobrist.

## File List (files to touch)

### New files to create
- `src/kernel/event-execution.ts` — `executeEventCard`, `resolveEventSide`, `applyLastingEffect`, `expireLastingEffects`

### Files to modify
- `src/kernel/initial-state.ts` — initialize `activeLastingEffects: []`
- `src/kernel/zobrist.ts` — hash `activeLastingEffects`
- `src/kernel/index.ts` — export new functions

### New test files
- `test/unit/event-deck.test.ts`

## Out of Scope

- **No compiler changes** (ARCDECANDGEN-022)
- **No `cardDriven` interaction** (ARCDECANDGEN-023)
- **No changes to** `src/cnl/`, `src/agents/`, `src/sim/`
- **No changes to** `data/games/fire-in-the-lake.md`
- **No event deck reshuffling** — `shuffleOnSetup` only; mid-game reshuffle deferred

## Acceptance Criteria

### Tests that must pass
- All existing tests pass
- `npm run typecheck` — passes
- `npm run lint` — passes

### New tests (in `test/unit/event-deck.test.ts`)
1. **"event side applicability filters execution"** — side with false applicability → effects NOT applied
2. **"event branches select correct path"** — 2 branches, one matching → only matching branch effects applied
3. **"event targets resolve with filter and cardinality"** — 5 matching tokens, cardinality 'upTo' max 3 → at most 3 selected
4. **"event target cardinality 'all' selects everything matching"**
5. **"lasting effect registered in GameState.activeLastingEffects"** — after execution, effect is in array
6. **"lasting effect teardown runs on expiry"** — teardown effects applied before removal
7. **"activeLastingEffects initialized as empty array"** — `initialState` check

### Invariants that must remain true
- Kernel execution follows the 8-step pipeline deterministically (draw → side selection → applicability → branches → targets → effects → lasting effects → discard)
- `activeLastingEffects` is always an array (empty for games without events)
- Lasting effect teardown runs before removal — no silent expiry
- Zobrist hash includes `activeLastingEffects`
- Cap `activeLastingEffects` array size (per risk registry — define reasonable max, e.g., 50)
