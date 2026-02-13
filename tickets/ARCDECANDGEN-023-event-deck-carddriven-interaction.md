# ARCDECANDGEN-023: Event Deck `cardDriven` Interaction (Lasting Effect Expiry)

**Phase**: 8D (Generic Event Deck Subsystem — cardDriven interaction)
**Priority**: P2
**Complexity**: S
**Dependencies**: ARCDECANDGEN-014 (turnOrder with cardDriven), ARCDECANDGEN-021 (event-execution.ts with `expireLastingEffects`)

## Goal

For `cardDriven` games, lasting effect `duration` values map to `TurnFlowDuration` values (e.g., `'untilCoupRound'`, `'untilNextCard'`). Wire expiry into `turn-flow-lifecycle.ts` at the appropriate lifecycle points (card-advance and coup-round boundaries).

## File List (files to touch)

### Files to modify
- `src/kernel/turn-flow-lifecycle.ts` — call `expireLastingEffects` at card-advance and coup-round boundaries; teardown effects run before removal

## Out of Scope

- **Non-`cardDriven` lasting effect expiry** — only `cardDriven` duration windows are handled; other turn order types need future work
- **No changes to** `src/cnl/`, `src/agents/`, `src/sim/`
- **No changes to** `data/games/fire-in-the-lake.md`
- **No event deck reshuffling**

## Acceptance Criteria

### Tests that must pass
- All existing tests pass
- `npm run typecheck` — passes
- `npm run lint` — passes

### New tests (add to `test/unit/event-deck.test.ts` or new file)
1. **"lasting effect with 'untilCoupRound' duration expires at coup round boundary"** — register effect → advance through coup round → effect removed, teardown applied
2. **"lasting effect with 'untilNextCard' duration expires at next card advance"** — register effect → advance card → effect removed, teardown applied
3. **"multiple lasting effects expire independently"** — two effects with different durations → each expires at its boundary
4. **"lasting effect teardown runs before removal in cardDriven lifecycle"** — verify teardown effects are applied, then effect is removed from `activeLastingEffects`

### Invariants that must remain true
- Lasting effects expire at the correct lifecycle point, not before
- Teardown effects always run before removal
- `expireLastingEffects` is called only for `cardDriven` turn order type
- Non-`cardDriven` games never call `expireLastingEffects` (no-op or guard check)
