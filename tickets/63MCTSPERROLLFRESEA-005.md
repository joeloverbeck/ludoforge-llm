# 63MCTSPERROLLFRESEA-005: Forced-sequence compression + concrete-move fast path

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `agents/mcts/search.ts`, `agents/mcts/rollout.ts`, `agents/mcts/materialization.ts`, `kernel/gamedef-runtime.ts`
**Deps**: 63MCTSPERROLLFRESEA-002 (rollout modes must exist for simulation-phase compression), 63MCTSPERROLLFRESEA-001 (diagnostics accumulator for `forcedMovePlies` counter)

## Problem

MCTS wastes tree budget on states with no real choice (exactly one legal concrete candidate). These forced moves allocate new nodes and consume iteration budget without contributing new information. Additionally, `materializeConcreteCandidates()` is called even when all legal moves are already concrete (no template parameters), which adds unnecessary overhead.

## Assumption Reassessment (2026-03-14)

1. `materializeConcreteCandidates()` is in `materialization.ts` — confirmed. It handles template completion and deduplication.
2. `GameDefRuntime` currently has `adjacencyGraph`, `runtimeTableIndex`, `zobristTable`, `ruleCardCache` — confirmed. Does not yet have action-level concreteness metadata.
3. `GameDef.actions` defines action templates — need to check whether actions have template choice parameters. The `legalChoicesEvaluate()` function in the kernel handles template expansion.
4. `ConcreteMoveCandidate` is defined in `expansion.ts` — confirmed.
5. `moveKeyFor()` / `canonicalMoveKey()` is in `move-key.ts` — confirmed.

## Architecture Check

1. Forced-sequence compression is a pure engineering optimization that doesn't change search semantics — if there's only one choice, the tree would expand in that direction anyway.
2. Concrete-move fast path detects concreteness at the **action definition** level (cheap metadata check cached in `GameDefRuntime`), not per-move at runtime (which IS the materialization cost).
3. Both optimizations are gated by config flags (`compressForcedSequences`) for safe rollback.

## What to Change

### 1. Add config field in `config.ts`

- `compressForcedSequences?: boolean` (default: `true`)

### 2. Implement forced-sequence compression during selection in `search.ts`

During the selection/expansion phase of `runOneIteration()`, when `config.compressForcedSequences` is true and the current state has exactly one concrete candidate:
- Push the move key to `traversedMoveKeys`.
- Apply the move and advance the state.
- Check for terminal after the forced move.
- Respect solver logic.
- Increment `accum.forcedMovePlies`.
- Do NOT allocate a new node for the forced state.
- Continue the selection loop.

### 3. Implement forced-sequence compression during simulation in `rollout.ts`

During `simulateToCutoff()` (hybrid mode), when a simulation ply has exactly one candidate:
- Advance without decrementing `cutoffRemaining`.
- Push the move key to `traversedMoveKeys`.
- Increment `accum.forcedMovePlies`.
- This gets more useful simulation depth for the same cutoff budget.

### 4. Add `actionIsFullyConcrete` metadata to `GameDefRuntime`

In `gamedef-runtime.ts`:
- During `createGameDefRuntime()`, compute a `Set<string>` of action IDs whose action definitions have no template choice parameters.
- Store as `readonly concreteActionIds: ReadonlySet<string>`.

### 5. Add `materializeOrFastPath()` in `materialization.ts`

New function that checks whether all moves at a node come from fully-concrete actions:
```ts
function materializeOrFastPath(def, runtime, moves, rng, config, ...):
  if (allActionsFullyConcrete(runtime, moves)) {
    return { candidates: moves.map(asConcreteCandidate), rng };
  }
  return materializeConcreteCandidates(...);
```

Wire this into `search.ts` and `rollout.ts` where `materializeConcreteCandidates()` is currently called.

### 6. Increment `accum.materializeCalls` appropriately

Only increment when the full `materializeConcreteCandidates()` path is taken, not on fast-path.

## Files to Touch

- `packages/engine/src/agents/mcts/config.ts` (modify)
- `packages/engine/src/agents/mcts/search.ts` (modify)
- `packages/engine/src/agents/mcts/rollout.ts` (modify)
- `packages/engine/src/agents/mcts/materialization.ts` (modify)
- `packages/engine/src/kernel/gamedef-runtime.ts` (modify)
- `packages/engine/test/unit/agents/mcts/forced-sequence-compression.test.ts` (new)
- `packages/engine/test/unit/agents/mcts/materialization-fastpath.test.ts` (new)
- `packages/engine/test/unit/agents/mcts/config.test.ts` (modify)

## Out of Scope

- MAST policy — that is 63MCTSPERROLLFRESEA-003.
- State-info cache — that is 63MCTSPERROLLFRESEA-004.
- Rollout mode definitions — that is 63MCTSPERROLLFRESEA-002.
- Confidence-based root stopping — that is 63MCTSPERROLLFRESEA-006.
- Changing solver logic.
- Modifying progressive widening parameters.
- Modifying any kernel modules other than `gamedef-runtime.ts`.

## Acceptance Criteria

### Tests That Must Pass

1. **forced-sequence-compression.test.ts**: When a state has exactly one concrete candidate and `compressForcedSequences: true`, no new node is allocated for that state during selection.
2. **forced-sequence-compression.test.ts**: Forced moves are applied correctly (state advances, move key is recorded).
3. **forced-sequence-compression.test.ts**: Terminal detection works correctly after forced moves.
4. **forced-sequence-compression.test.ts**: `forcedMovePlies` counter in diagnostics is incremented correctly.
5. **forced-sequence-compression.test.ts**: During `simulateToCutoff()`, forced moves do NOT decrement `cutoffRemaining`.
6. **forced-sequence-compression.test.ts**: When `compressForcedSequences: false`, no compression occurs (nodes allocated normally).
7. **materialization-fastpath.test.ts**: When all moves come from fully-concrete actions, `materializeConcreteCandidates()` is NOT called (fast path used).
8. **materialization-fastpath.test.ts**: When any move comes from a template action, full materialization is used.
9. **materialization-fastpath.test.ts**: `concreteActionIds` in `GameDefRuntime` correctly identifies actions with no template parameters.
10. Existing suite: `pnpm -F @ludoforge/engine test` — all existing tests pass.

### Invariants

1. Determinism: forced-sequence compression changes tree shape only where there is exactly one choice — the search result is identical with or without compression for the same seed.
2. `GameDefRuntime` remains a pure, immutable, pre-computed structure.
3. The concrete-move fast path produces the same candidates as full materialization (just skips the expensive path).
4. No game-specific logic introduced — the `concreteActionIds` check is purely structural.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/forced-sequence-compression.test.ts` — new: tests selection-phase and simulation-phase compression behavior.
2. `packages/engine/test/unit/agents/mcts/materialization-fastpath.test.ts` — new: tests fast-path detection and equivalence with full materialization.
3. `packages/engine/test/unit/agents/mcts/config.test.ts` — modified: validation test for `compressForcedSequences`.

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/unit/agents/mcts/forced-sequence-compression.test.js`
2. `pnpm turbo build && node --test packages/engine/dist/test/unit/agents/mcts/materialization-fastpath.test.js`
3. `pnpm turbo build && pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck && pnpm turbo lint`
