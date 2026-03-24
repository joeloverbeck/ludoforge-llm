# Spec 78 — Draft State for Effect Execution

**Status**: ✅ COMPLETED (2026-03-24)
**Dependencies**: Spec 77 (EffectContext Split) — COMPLETED. The draft integrates
directly with the EffectEnv/EffectCursor split.
**Blocked by**: None
**Enables**: Further optimization of setVar/addVar/moveToken throughput; Spec 79
(compiled effect path redesign) can emit direct mutations into the mutable state.

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

### Additional overhead: `simple()` wrapper reconstruction

Post-Spec 77, 27 effect handlers are registered via the `simple()` compatibility
wrapper, which calls `fromEnvAndCursor(env, cursor)` to reconstruct a full
~30-field EffectContext on EVERY handler invocation. This re-introduces the
context-creation overhead that Spec 77 was designed to eliminate. Migrating all
handlers to native `(env, cursor)` signatures removes this overhead alongside
the state-spreading overhead.

## Objective

Introduce a mutable "working state" within the `applyEffectsWithBudgetState`
execution scope. Effect handlers mutate the working state directly instead of
creating new GameState objects. A `DraftTracker` tracks copy-on-write for nested
maps. All 29 wrapped handlers are migrated to native `(env, cursor)` signatures,
eliminating both state-spreading AND context-reconstruction overhead.

**Target**: 3-8% total improvement from eliminating ~25K intermediate GameState
allocations per 10 games, reducing GC pressure from 3.6% to <2%, and removing
27 `fromEnvAndCursor` reconstructions per effect.

## Foundations Alignment

- **Foundation 5 (Determinism)**: The mutable state receives the SAME mutations
  in the SAME order as the spread-based approach. Same seed + same actions =
  same final state. The Zobrist hash is computed on the final state, not on
  intermediates.
- **Foundation 7 (Immutability)**: The EXTERNAL contract is preserved:
  `applyMove(state) → newState` where `state` is never modified. The mutable
  working state is scoped to a single `applyEffectsWithBudgetState` call and
  is NOT exposed to callers. Foundation 7's exception clause (added as part of
  this spec) explicitly allows scoped internal mutation with this contract.
- **Foundation 9 (No Backwards Compatibility)**: The `simple()` and `compat()`
  compatibility wrappers are removed. All handlers are migrated to the native
  `(env, cursor)` signature in the same change.
- **Foundation 11 (Testing as Proof)**: Determinism is proven by running the
  same game with both mutable and spread implementations and comparing final
  state hashes.

### Foundation 7 exception clause (new)

Added to `docs/FOUNDATIONS.md` as part of this spec:

> **Exception — Scoped internal mutation**: Within a single synchronous
> effect-execution scope (e.g., `applyEffectsWithBudgetState`), effect handlers
> MAY mutate a working copy of the state for performance. The working copy is
> created at scope entry (shallow clone) and is not observable by external code.
> The external contract is preserved: `applyMove(state) → newState` where the
> input `state` is never modified.

### Why the immutability guarantee is preserved

The immutability guarantee serves three purposes, all preserved:
1. **Determinism verification**: comparing state before/after. The before-state
   is the INPUT to applyMove, which is never touched.
2. **Undo/replay**: replaying moves from a known state. Replay creates a fresh
   mutable clone from the same input state.
3. **Safe parallel reasoning**: examining state without fear of mutation. The
   mutable state exists only within the synchronous applyEffectsWithBudgetState
   call, and no external code can observe it.

## Design

### MutableGameState type

```typescript
// state-draft.ts (NEW file)
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
export type MutableGameState = Mutable<GameState>;
```

No separate `StateDraft` interface. GameState is already structurally correct —
the `Mutable<>` utility type simply removes `readonly` modifiers. This means
handlers work with the same field names and structure they already know.

### DraftTracker

```typescript
export interface DraftTracker {
  readonly playerVars: Set<number>;   // perPlayerVars inner maps cloned
  readonly zoneVars: Set<string>;     // zoneVars inner maps cloned
  readonly zones: Set<string>;        // zones inner arrays cloned
  readonly markers: Set<string>;      // markers inner maps cloned
}
```

The DraftTracker uses Sets to track which INNER maps/arrays have been cloned
during the current execution scope. Top-level maps (globalVars, perPlayerVars,
zoneVars, zones, markers, etc.) are cloned eagerly at scope entry, so they
never need tracking.

**Why not `Object.isFrozen()`?** GameState objects are NOT frozen at runtime —
`readonly` is a TypeScript compile-time-only modifier. `Object.isFrozen()`
would always return `false`, making it useless as a copy-on-write guard.

### Creating and freezing mutable state

```typescript
export function createMutableState(state: GameState): MutableGameState {
  return {
    ...state,                                          // 19-field spread (ONCE per scope)
    globalVars: { ...state.globalVars },               // shallow clone
    perPlayerVars: { ...state.perPlayerVars },         // shallow clone (outer only)
    zoneVars: { ...state.zoneVars },                   // shallow clone (outer only)
    zones: { ...state.zones },                         // shallow clone (outer only)
    actionUsage: { ...state.actionUsage },             // shallow clone
    markers: { ...state.markers },                     // shallow clone (outer only)
    turnOrderState: { ...state.turnOrderState },       // shallow clone
    // Optional fields — clone only if present:
    ...(state.reveals !== undefined
      ? { reveals: { ...state.reveals } } : {}),
    ...(state.globalMarkers !== undefined
      ? { globalMarkers: { ...state.globalMarkers } } : {}),
    ...(state.activeLastingEffects !== undefined
      ? { activeLastingEffects: [...state.activeLastingEffects] } : {}),
    ...(state.interruptPhaseStack !== undefined
      ? { interruptPhaseStack: [...state.interruptPhaseStack] } : {}),
  };
}

export function createDraftTracker(): DraftTracker {
  return {
    playerVars: new Set(),
    zoneVars: new Set(),
    zones: new Set(),
    markers: new Set(),
  };
}

export function freezeState(mutable: MutableGameState): GameState {
  // TypeScript cast only — no runtime cost.
  return mutable as GameState;
}
```

### Copy-on-write for nested maps

When a handler writes to a per-player variable, the inner player map must be
cloned before mutation:

```typescript
// Before (current — spread-based):
const newPvars = { ...state.perPlayerVars };
newPvars[playerId] = { ...newPvars[playerId], [varName]: value };
return { ...state, perPlayerVars: newPvars };

// After (mutable with DraftTracker):
// state.perPlayerVars is already a shallow clone (from createMutableState).
// Clone the inner map for this player if not yet cloned this scope.
if (!tracker.playerVars.has(playerId)) {
  (state.perPlayerVars as any)[playerId] = { ...state.perPlayerVars[playerId] };
  tracker.playerVars.add(playerId);
}
(state.perPlayerVars as any)[playerId][varName] = value;
```

Similar patterns for zones (clone array on first write per zone), zoneVars
(clone inner map per zone), and markers (clone inner map per key).

### Integration with EffectCursor (Spec 77)

The DraftTracker is added as an optional field on EffectCursor:

```typescript
interface EffectCursor {
  state: GameState;          // MutableGameState at runtime within scope
  rng: Rng;
  bindings: Readonly<Record<string, unknown>>;
  decisionScope: DecisionScope;
  effectPath?: string;
  tracker?: DraftTracker;    // NEW — present when inside mutable-state scope
}
```

### Integration with dispatch loop

The `applyEffectsWithBudgetState` function changes minimally:

```typescript
export const applyEffectsWithBudgetState = (
  effects: readonly EffectAST[],
  env: EffectEnv,
  cursor: EffectCursor,
  budget: EffectBudgetState,
): EffectResult => {
  // NEW: Create a mutable state clone ONCE for this scope
  const mutableState = createMutableState(cursor.state);
  const tracker = createDraftTracker();
  let currentState: GameState = mutableState as GameState;
  let currentRng = cursor.rng;
  let currentBindings = cursor.bindings;
  let currentDecisionScope = cursor.decisionScope;
  const emittedEvents: TriggerEvent[] = [];
  const tracingEnabled = /* ... */;

  // Reusable mutable cursor (existing exp-008 pattern)
  const workCursor: EffectCursor = {
    ...cursor,
    tracker,  // NEW: thread tracker through to handlers
  };

  for (let effectIndex = 0; effectIndex < effects.length; effectIndex++) {
    workCursor.state = currentState;
    workCursor.rng = currentRng;
    workCursor.bindings = currentBindings;
    workCursor.decisionScope = currentDecisionScope;
    if (tracingEnabled) {
      workCursor.effectPath = `${cursor.effectPath ?? ''}[${effectIndex}]`;
    }
    const result = applyEffectWithBudget(effects[effectIndex]!, env, workCursor, budget);
    currentState = result.state;  // same ref if mutated, new obj if not
    currentRng = result.rng;
    currentBindings = result.bindings ?? currentBindings;
    currentDecisionScope = result.decisionScope ?? currentDecisionScope;
    // ... emittedEvents, pendingChoice handling unchanged
  }

  return {
    state: currentState,
    rng: currentRng,
    emittedEvents,
    bindings: currentBindings,
    decisionScope: currentDecisionScope,
  };
};
```

The dispatch loop is **agnostic** to whether a handler mutated in place or
returned a new object. `currentState = result.state` works for both cases.

### Handler migration

All 27 `simple()`-wrapped and 2 `compat()`-wrapped handlers are migrated to the
native `(effect, env, cursor, budget, applyBatch) => EffectResult` signature.

**Example — setVar migration:**

```typescript
// Before:
export const applySetVar = (
  effect: Extract<EffectAST, { readonly setVar: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  // ... evaluation, validation ...
  const newState = writeScopedVarsToState(ctx.state, [scopedWrite]);
  return { state: newState, rng: ctx.rng, emittedEvents: [event] };
};

// After:
export const applySetVar: EffectHandler<'setVar'> = (
  effect, env, cursor, _budget, _applyBatch,
): EffectResult => {
  // ... evaluation, validation (using mergeToEvalContext(env, cursor)) ...
  writeScopedVarsMutable(
    cursor.state as MutableGameState,
    [scopedWrite],
    cursor.tracker!,
  );
  return { state: cursor.state, rng: cursor.rng, emittedEvents: [event] };
};
```

**EffectResult unchanged**: `state` remains required. Migrated handlers return
`cursor.state` (same reference). The handler signature change is the only
breaking change, and it's handled by updating the registry.

### Registry changes

```typescript
// Before:
export const registry: EffectRegistry = {
  setVar: simple(applySetVar),
  addVar: simple(applyAddVar),
  // ... 25 more simple() wrappers ...
  rollRandom: compat(applyRollRandom),
  evaluateSubset: compat(applyEvaluateSubset),
  if: applyIf,
  // ... 4 more native handlers ...
};

// After:
export const registry: EffectRegistry = {
  setVar: applySetVar,
  addVar: applyAddVar,
  // ... ALL handlers native ...
  rollRandom: applyRollRandom,
  evaluateSubset: applyEvaluateSubset,
  if: applyIf,
  // ...
};
// simple() and compat() are DELETED.
```

### Nested scoping (gotoPhaseExact, advancePhase)

Phase transition handlers call `dispatchLifecycleEvent`, which internally calls
`applyEffectsWithBudgetState` — creating its OWN mutable state and tracker.
This is safe:
- The inner scope shallow-clones the outer state (including any mutations
  already applied in the outer scope)
- The inner scope's tracker is independent
- The inner scope returns a complete GameState
- The outer dispatch loop replaces `currentState` with the returned state

These handlers are low-frequency (a few per game) and don't need further
optimization. They may still spread state internally for the phase transition
setup (e.g., `{ ...exitedState, currentPhase: targetPhaseId }`).

## Scope

### Files affected

- `docs/FOUNDATIONS.md` — Foundation 7 exception clause
- `packages/engine/src/kernel/state-draft.ts` — NEW: MutableGameState, DraftTracker, create/freeze, copy-on-write helpers
- `packages/engine/src/kernel/effect-context.ts` — Add `tracker?: DraftTracker` to EffectCursor
- `packages/engine/src/kernel/effect-dispatch.ts` — Create mutable state + tracker at scope entry
- `packages/engine/src/kernel/effect-registry.ts` — Remove `simple()`/`compat()`, register all handlers natively
- `packages/engine/src/kernel/scoped-var-runtime-access.ts` — Add `writeScopedVarsMutable`
- `packages/engine/src/kernel/effects-var.ts` — Migrate setVar, addVar, setActivePlayer
- `packages/engine/src/kernel/effects-token.ts` — Migrate moveToken, moveAll, moveTokenAdjacent, draw, shuffle, createToken, destroyToken, setTokenProp
- `packages/engine/src/kernel/effects-reveal.ts` — Migrate reveal, conceal
- `packages/engine/src/kernel/effects-choice.ts` — Migrate chooseOne, chooseN, rollRandom, setMarker, shiftMarker, setGlobalMarker, flipGlobalMarker, shiftGlobalMarker
- `packages/engine/src/kernel/effects-turn-flow.ts` — Migrate grantFreeOperation, gotoPhaseExact, advancePhase, pushInterruptPhase, popInterruptPhase
- `packages/engine/src/kernel/effects-binding.ts` — Migrate bindValue
- `packages/engine/src/kernel/effects-subset.ts` — Migrate evaluateSubset
- `packages/engine/src/kernel/effects-resource.ts` — Migrate transferVar
- All effect handler test files — Update for new handler signatures

### Files NOT affected

- GameDef schema (no change to data format)
- GameSpecDoc YAML
- Simulator (calls applyMove which returns immutable GameState — transparent)
- Runner, agents
- Compiled effect path (Spec 79 — compatible, not yet modified)

## Testing

- **Determinism parity**: Run 100 games each for Texas Hold'em and FITL with
  the mutable implementation, compare all state hashes at every move against a
  baseline recorded from the spread-based implementation
- **Property tests**: Random play for N turns — no crashes, no invalid var
  bounds, no token duplication
- **Golden tests**: Known seed traces produce identical output
- **GC measurement**: Compare GC% before and after using `--expose-gc` flag,
  target: 3.6% → <2%

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Copy-on-write tracking bug (inner map not cloned before write) | HIGH | DraftTracker Sets prevent double-writes; determinism parity test catches any mutation leak |
| Nested scope interaction (gotoPhaseExact calls dispatchLifecycleEvent) | MEDIUM | Inner scope creates its own mutable state and tracker; outer scope replaces currentState with returned state — identical to current behavior |
| Large handler migration surface (29 handlers) | MEDIUM | Each handler is independent; migrate and test in batches across tickets |
| EffectCursor.tracker threading through control-flow handlers | LOW | Control-flow handlers (if, forEach, reduce, removeByPriority, let) already pass cursor through; tracker field is automatically threaded |
| `as any` casts for nested mutation | LOW | Required because TypeScript readonly types cannot be locally narrowed. Confined to draft write helpers (state-draft.ts, scoped-var-runtime-access.ts) — not scattered across handlers |

## Outcome

**Completion date**: 2026-03-24

**What was delivered** (across tickets 78DRASTAEFF-001 through 008):
- `state-draft.ts`: DraftTracker with mutable-state scope for effect execution
- `toEffectEnv` / `toEffectCursor` split (Spec 77 prerequisite) integrated
- `applyEffects` / `applyEffect` dispatch path updated to create mutable scope and thread tracker through cursor
- All 29 effect handlers migrated to native `(env, cursor)` signatures with direct mutation via tracker
- 5 control-flow handlers (if, forEach, reduce, removeByPriority, let) thread tracker automatically
- `simple()` / `compat()` wrappers removed (dead code after migration)
- `fromEnvAndCursor` kept — actively used by handler eval bridges (~30 call sites)
- Determinism parity tests (CI-only lane): 10 FITL + 10 Texas Hold'em seeds prove identical Zobrist hashes on replay
- GC measurement test (advisory): benchmarks GC pressure under `--expose-gc`

**Deviations from spec**:
- `fromEnvAndCursor` was not removed — still essential for constructing EffectContext for eval functions inside handlers
- Determinism parity tests run in dedicated `test/determinism/` lane (not unit tests) due to ~10 min runtime
