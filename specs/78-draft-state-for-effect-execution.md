# Spec 78 — Draft State for Effect Execution

**Status**: PROPOSED
**Dependencies**: Spec 77 (EffectContext Split) — recommended but not
strictly required. The draft state replaces the `state` field in the dynamic
cursor, so the split makes integration cleaner.
**Blocked by**: None (can be implemented standalone, but benefits from Spec 77)
**Enables**: Further optimization of setVar/addVar/moveToken throughput

## Problem

GameState has **19 top-level fields**. Every state-modifying effect creates a
new GameState object via the spread operator:

```typescript
// writeScopedVarBranchesToState (called by every setVar/addVar):
const newState: GameState = {
  ...state,            // spread 19 fields
  globalVars: ...,     // replace 1-3 var maps
  perPlayerVars: ...,
  zoneVars: ...,
};
```

Profiling data:
- **25,730 setVar calls per 10 games** (~10 per move)
- Each setVar spreads ALL 19 GameState fields to change 1-3 var maps
- Additional state spreads from: moveToken, setActivePlayer, gotoPhaseExact,
  addVar, transferVar, createToken, destroyToken, reveal, draw, shuffle
- **66 state-spread sites** across the kernel
- **GC at 3.6% of CPU** (post exp-013, 20-game profile)

The intermediate GameState objects are short-lived — they're created by one
effect and immediately replaced by the next. For a move with 30 effects, 29
intermediate states are created and immediately become garbage.

### Why exp-001 showed <0.19% gain

The exp-001 experiment tried to optimize the effect CONTEXT spreading (the
~24-field EffectContext), which V8 handles efficiently. This spec targets
**GameState** spreading, which is a different object with different
characteristics:
- GameState contains NESTED objects (globalVars, perPlayerVars, zones are
  Records with their own properties)
- State modification requires spreading at MULTIPLE nesting levels
- The sheer VOLUME of intermediate states (25K+ per 10 games) creates GC
  pressure that isn't visible in per-call benchmarks

## Objective

Introduce a mutable "draft state" within the `applyMove` execution pipeline.
Effect handlers mutate the draft directly instead of creating new GameState
objects. The draft is frozen into an immutable GameState at the end of
`applyMove`.

**Target**: 3-8% total improvement from eliminating ~25K intermediate
GameState allocations per 10 games and reducing GC pressure from 3.6% to <1%.

## Foundations Alignment

- **Foundation 5 (Determinism)**: The draft receives the SAME mutations in
  the SAME order as the spread-based approach. Same seed + same actions =
  same final state. The Zobrist hash is computed on the final frozen state,
  not on intermediates.
- **Foundation 7 (Immutability)**: The EXTERNAL contract is preserved:
  `applyMove(state) → newState` where `state` is never modified. The draft
  is scoped to a single `applyMove` call and is NOT exposed to callers. The
  program.md constraint 5 explicitly allows: *"Internal transient mutation
  with final freeze is acceptable if it improves performance — the external
  contract must remain immutable."*
- **Foundation 11 (Testing as Proof)**: Determinism is proven by running the
  same game with both draft and spread implementations and comparing final
  state hashes.

### Foundation 7 deep analysis

The immutability guarantee serves three purposes:
1. **Determinism verification**: comparing state before/after. Draft preserves
   this — the before-state is the INPUT to applyMove, which is never touched.
2. **Undo/replay**: replaying moves from a known state. Draft preserves
   this — replay creates a fresh draft from the same input state.
3. **Safe parallel reasoning**: examining state without fear of mutation.
   Draft preserves this — the draft exists only within the synchronous
   applyMove call, and no external code can observe it.

## Design

### StateDraft type

```typescript
/**
 * A mutable view over a GameState, used within a single applyMove call.
 * Field assignments are direct property writes — no spreading.
 * Frozen into an immutable GameState via freezeDraft() at applyMove exit.
 */
interface StateDraft {
  globalVars: Record<string, VariableValue>;
  perPlayerVars: Record<number, Record<string, VariableValue>>;
  zoneVars: Record<string, Record<string, number>>;
  zones: Record<string, Token[]>;
  activePlayer: PlayerId;
  currentPhase: PhaseId;
  turnCount: number;
  rng: RngState;
  nextTokenOrdinal: number;
  actionUsage: Record<string, ActionUsageRecord>;
  turnOrderState: TurnOrderRuntimeState;
  markers: Record<string, Record<string, string>>;
  reveals?: Record<string, RevealGrant[]>;
  globalMarkers?: Record<string, string>;
  activeLastingEffects?: ActiveLastingEffect[];
  interruptPhaseStack?: InterruptPhaseFrame[];
  // Fields that never change during a move:
  readonly playerCount: number;
  readonly stateHash: bigint; // recomputed at freeze time
}
```

### Creating and freezing drafts

```typescript
function createDraft(state: GameState): StateDraft {
  // Shallow clone — nested objects are shared initially.
  // Mutations to nested maps use copy-on-write.
  return {
    globalVars: { ...state.globalVars },
    perPlayerVars: { ...state.perPlayerVars },
    zoneVars: { ...state.zoneVars },
    zones: { ...state.zones },
    activePlayer: state.activePlayer,
    currentPhase: state.currentPhase,
    turnCount: state.turnCount,
    rng: state.rng,
    nextTokenOrdinal: state.nextTokenOrdinal,
    actionUsage: { ...state.actionUsage },
    turnOrderState: state.turnOrderState,
    markers: { ...state.markers },
    playerCount: state.playerCount,
    stateHash: state.stateHash,
    // optional fields:
    ...(state.reveals !== undefined ? { reveals: { ...state.reveals } } : {}),
    ...(state.globalMarkers !== undefined ? { globalMarkers: { ...state.globalMarkers } } : {}),
    ...(state.activeLastingEffects !== undefined ? { activeLastingEffects: [...state.activeLastingEffects] } : {}),
    ...(state.interruptPhaseStack !== undefined ? { interruptPhaseStack: [...state.interruptPhaseStack] } : {}),
  };
}

function freezeDraft(draft: StateDraft): GameState {
  return Object.freeze({
    globalVars: Object.freeze(draft.globalVars),
    perPlayerVars: Object.freeze(draft.perPlayerVars),
    zoneVars: Object.freeze(draft.zoneVars),
    zones: Object.freeze(draft.zones),
    activePlayer: draft.activePlayer,
    currentPhase: draft.currentPhase,
    turnCount: draft.turnCount,
    rng: draft.rng,
    nextTokenOrdinal: draft.nextTokenOrdinal,
    actionUsage: Object.freeze(draft.actionUsage),
    turnOrderState: draft.turnOrderState,
    markers: Object.freeze(draft.markers),
    playerCount: draft.playerCount,
    stateHash: 0n, // recomputed by caller
    ...(draft.reveals !== undefined ? { reveals: Object.freeze(draft.reveals) } : {}),
    ...(draft.globalMarkers !== undefined ? { globalMarkers: Object.freeze(draft.globalMarkers) } : {}),
    ...(draft.activeLastingEffects !== undefined ? { activeLastingEffects: Object.freeze(draft.activeLastingEffects) } : {}),
    ...(draft.interruptPhaseStack !== undefined ? { interruptPhaseStack: Object.freeze(draft.interruptPhaseStack) } : {}),
  }) as GameState;
}
```

### Copy-on-write for nested maps

When a setVar targets a per-player variable, the draft needs to clone the
specific player's var map on first write:

```typescript
// Before (current — spread-based):
const newPvars = { ...state.perPlayerVars };
newPvars[playerId] = { ...newPvars[playerId], [varName]: value };
return { ...state, perPlayerVars: newPvars };

// After (draft — copy-on-write):
// draft.perPlayerVars is already a shallow clone of the outer map.
// Clone the inner map for this player if not yet cloned this move.
if (!draft._clonedPlayerVars?.has(playerId)) {
  draft.perPlayerVars[playerId] = { ...draft.perPlayerVars[playerId] };
  (draft._clonedPlayerVars ??= new Set()).add(playerId);
}
draft.perPlayerVars[playerId][varName] = value;
```

The `_clonedPlayerVars` set tracks which inner maps have been cloned this
move to avoid double-cloning. Similar sets for zones, zoneVars, markers.

### Effect handler changes

```typescript
// Before (setVar returns new state):
return { state: newState, rng: ctx.rng };

// After (setVar mutates draft):
draft.globalVars[varName] = value;
return { rng: ctx.rng };
// State is read from the draft, not from the return value.
```

The `EffectResult` type changes: `state` becomes optional (present only
when the handler needs to communicate a non-draft state, e.g., for
`gotoPhaseExact` which creates entirely new state).

### Integration with Spec 77 (Context Split)

If Spec 77 is implemented first, the draft replaces the `state` field in
`EffectCursor`:

```typescript
interface EffectCursor {
  draft: StateDraft;     // replaces `state: GameState`
  rng: Rng;
  bindings: Readonly<Record<string, unknown>>;
  decisionScope: DecisionScope;
}
```

If Spec 77 is NOT implemented, the draft is passed alongside the existing
EffectContext (the `state` field on EffectContext becomes the draft).

## Scope

### Files affected

- `packages/engine/src/kernel/state-draft.ts` — NEW: draft creation, freeze, copy-on-write helpers
- `packages/engine/src/kernel/apply-move.ts` — create draft at start, freeze at end
- `packages/engine/src/kernel/effects-var.ts` — mutate draft instead of spreading state
- `packages/engine/src/kernel/effects-token.ts` — mutate draft.zones
- `packages/engine/src/kernel/effects-turn-flow.ts` — mutate draft.currentPhase, etc.
- `packages/engine/src/kernel/effects-resource.ts` — mutate draft vars
- `packages/engine/src/kernel/effect-context.ts` — EffectResult type changes
- `packages/engine/src/kernel/scoped-var-runtime-access.ts` — draft-aware var writes
- `packages/engine/src/kernel/phase-lifecycle.ts` — draft threading
- `packages/engine/src/kernel/phase-advance.ts` — draft threading
- `packages/engine/src/kernel/zobrist.ts` — hash computed on frozen state
- All effect handler test files

### Files NOT affected

- GameDef schema (no change to data format)
- GameSpecDoc YAML
- Simulator (calls applyMove which returns frozen GameState — transparent)
- Runner, agents

## Testing

- **Determinism parity**: Run 100 games with draft vs. spread implementations, compare all state hashes at every move
- **Property tests**: Random play for N turns — no crashes, no invalid var bounds, no token duplication
- **Golden tests**: Known seed traces produce identical output
- **GC measurement**: Compare GC% before and after using `--expose-gc` flag

## Risks

- **Largest change surface**: 15+ files affected, fundamental change to state management pattern
- **Copy-on-write complexity**: Tracking which nested maps have been cloned adds bookkeeping. Incorrect tracking = shared mutation bugs (Foundation 7 violation)
- **gotoPhaseExact complexity**: Phase transitions create entirely new state via lifecycle effects. The draft must handle "replace entire state" operations correctly
- **Mitigations**: Phased rollout — implement for setVar first (highest frequency), then extend to other effects. Determinism parity test catches any mutation leak
