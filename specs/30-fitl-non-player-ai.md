# Spec 30: FITL Non-Player AI

**Status**: Draft
**Priority**: P1
**Complexity**: L
**Dependencies**: Spec 26 (operations), Spec 27 (SAs), Spec 28 (capabilities + momentum), Spec 29 (event cards)
**Estimated effort**: 4–5 days
**Source sections**: Brainstorming Sections 4.2 (item 10), 9 (Non-Player Rules Summary)

## Overview

Implement the Section 8 bot AI from the FITL rules for solitaire and <4 player simulation. The `Section8Agent` conforms to the existing `Agent` interface (`src/kernel/types.ts:875`) and provides faction-specific priority tables for operation selection, space targeting, and piece selection. No kernel changes needed.

## Scope

### In Scope

- **`Section8Agent`** conforming to existing `Agent` interface
- **Per-faction priority tables**: US, ARVN, NVA, VC decision flowcharts
- **Event evaluation**: Play Event vs Operation decision logic
- **Operation selection**: Priority-ordered operation choice per faction
- **Space selection**: Deterministic random space targeting using seeded PRNG + priority criteria
- **Piece selection**: Priority rules for which pieces to place, move, or remove
- **Solitaire mode**: 3 bots + 1 human (human faction configurable)
- **Bot-vs-bot**: All 4 factions as bots for evaluation pipeline

### Out of Scope

- UCT/MCTS agent (post-MVP, different `Agent` implementation)
- Existing `RandomAgent` and `GreedyAgent` (already work, unchanged)
- Human player interface (out of scope for engine)
- Non-player rules for expansions or variants

## Key Types & Interfaces

### Existing Agent Interface

```typescript
// src/kernel/types.ts:875
interface Agent {
  chooseMove(input: {
    readonly def: GameDef;
    readonly state: GameState;
    readonly playerId: PlayerId;
    readonly legalMoves: readonly Move[];
    readonly rng: Rng;
  }): { readonly move: Move; readonly rng: Rng };
}
```

### Section8Agent

```typescript
// New agent implementation
interface Section8Agent extends Agent {
  // Uses the Agent interface — no extension needed.
  // Internal faction-specific decision logic selected by playerId.
}

// Priority table entry for operation selection
interface OperationPriority {
  readonly operationId: string;
  readonly condition: (state: GameState, faction: PlayerId) => boolean;
  readonly priority: number;  // lower = higher priority
}

// Space targeting criteria
interface SpaceTargetCriteria {
  readonly spaceFilter: (space: MapSpaceDef, state: GameState) => boolean;
  readonly scoreFn: (space: MapSpaceDef, state: GameState) => number;
  readonly randomTieBreak: boolean;  // use PRNG for ties
}
```

## Implementation Tasks

### Task 30.1: Section8Agent Core

Create `src/agents/section8-agent.ts`:
- Implements `Agent` interface
- Routes to faction-specific decision logic based on `playerId`
- Handles Event vs Operation decision at top level
- Returns deterministic moves given same seed (via `Rng` parameter)

### Task 30.2: US Non-Player Logic

US AI priorities (from Section 8):
1. **Event evaluation**: Play Event if it significantly advances Support or removes enemy forces
2. **Operation priority**: Train (build Support) > Sweep (activate Guerrillas) > Assault (remove threats) > Patrol (secure LoCs)
3. **Space targeting**: Prioritize high-population spaces, spaces losing Support, spaces with enemy Bases
4. **SA selection**: Air Strike for Trail degrade or high-value removal; Air Lift for rapid repositioning

### Task 30.3: ARVN Non-Player Logic

ARVN AI priorities (from Section 8):
1. **Event evaluation**: Play Event if it increases Patronage or Resources
2. **Operation priority**: Train (Pacify for Support) > Sweep (with US assets) > Patrol (protect LoCs for Econ) > Assault (support US)
3. **Space targeting**: Prioritize COIN-Controlled spaces for Govern, contested spaces for operations
4. **SA selection**: Govern (maximize Patronage + Aid); Transport for repositioning

### Task 30.4: NVA Non-Player Logic

NVA AI priorities (from Section 8):
1. **Event evaluation**: Play Event if it degrades COIN position or improves Trail
2. **Operation priority**: Rally (build forces, improve Trail) > March (concentrate for Attack) > Attack (remove COIN forces) > Terror (shift Opposition)
3. **Space targeting**: Prioritize foreign countries for safe Rally, adjacent-to-target spaces for March, weakly defended spaces for Attack
4. **SA selection**: Infiltrate (place forces without adjacency); Bombard (remove COIN forces)

### Task 30.5: VC Non-Player Logic

VC AI priorities (from Section 8):
1. **Event evaluation**: Play Event if it shifts Opposition or weakens COIN
2. **Operation priority**: Rally (build Guerrillas, place Bases) > Terror (shift Opposition, Sabotage LoCs) > March (reposition) > Attack (remove COIN where strong)
3. **Space targeting**: Prioritize high-population spaces for Terror, spaces with Underground Guerrillas, spaces without enemy forces for Rally
4. **SA selection**: Tax (gain Resources); Subvert (convert ARVN pieces); Ambush (surprise removal)

### Task 30.6: Priority Tables Data

Create `src/agents/fitl-priorities.ts` containing:
- Per-faction operation priority tables
- Per-faction space scoring functions
- Per-faction piece selection rules
- Event evaluation heuristics
- Random space table implementation (deterministic via PRNG)

### Task 30.7: Solitaire Mode

Ensure the simulation runner can be configured with a mix of human and bot factions:
- 1 human + 3 bots (solitaire)
- 2 humans + 2 bots (2-player)
- 0 humans + 4 bots (evaluation/testing)

Human factions return "await input" from `chooseMove`; bot factions return immediately.

### Task 30.8: Bot-vs-Bot Validation

Run full games with 4 `Section8Agent` bots to verify:
- Games reach terminal state (no infinite loops)
- Victory is determined correctly
- Game length is reasonable (not too short, not too long)
- All faction victory conditions are achievable by bots

## Testing Requirements

### Unit Tests
- `test/unit/agents/section8-agent.test.ts`:
  - Each faction selects operations according to priority tables
  - Space targeting follows scoring criteria
  - Event evaluation produces consistent decisions
  - Deterministic given same seed + same state

### Integration Tests
- `test/integration/fitl-bot-play.test.ts`:
  - 4-bot game reaches terminal state
  - Same seed produces identical game trace
  - No illegal moves generated
  - Victory determined correctly
  - Reasonable game length (20–130 turns depending on scenario)

### Property Tests
- Bot never selects an illegal move
- Bot always returns a valid `Move` from `legalMoves`
- Determinism: same inputs → same output

## Acceptance Criteria

1. `Section8Agent` implements `Agent` interface for all 4 factions
2. Per-faction priority tables drive operation/SA/space/piece selection
3. Bot decisions are deterministic given same seed
4. Bot-vs-bot games reach terminal state within reasonable turn counts
5. All 4 faction victory conditions achievable by bots across many games
6. Build passes (`npm run build`)
7. All existing tests pass (`npm test`)
