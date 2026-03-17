# 63MCTSRUNMOVCLA-002: Implement `classifyMovesForSearch`

**Status**: DONE
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — MCTS `materialization.ts`
**Deps**: 63MCTSRUNMOVCLA-001

## Problem

After removing `concreteActionIds`, the MCTS search needs a new entry point for classifying legal moves by runtime readiness. `classifyMovesForSearch` uses `legalChoicesEvaluate` per move to produce a `MoveClassification` with `ready` (complete) and `pending` buckets — the single source of truth for in-tree move routing.

## Assumption Reassessment (2026-03-16)

1. `legalChoicesEvaluate(def, state, move, undefined, runtime)` returns `{ kind: 'complete' | 'pending' | 'illegal' | 'pendingStochastic' }` — **confirmed** from kernel API.
2. `ConcreteMoveCandidate` is `{ move: Move; moveKey: MoveKey }` exported from `expansion.ts` — **confirmed**.
3. `canonicalMoveKey(move)` from `move-key.ts` provides deduplication keys — **confirmed**.
4. Existing `materializeConcreteCandidates` already calls `legalChoicesEvaluate` internally — the new function extracts and reshapes that logic.

## Architecture Check

1. Single classification entry point eliminates the compile-time/runtime confusion.
2. Game-agnostic: relies solely on kernel `legalChoicesEvaluate`, no game-specific branching.
3. No backwards-compatibility shims — this is a new function, old ones removed in later tickets.

## What to Change

### 1. Add `MoveClassification` interface to `materialization.ts`

```typescript
export interface MoveClassification {
  readonly ready: readonly ConcreteMoveCandidate[];
  readonly pending: readonly Move[];
}
```

### 2. Implement `classifyMovesForSearch` in `materialization.ts`

Per spec section 2.2:
- Iterate all moves, call `legalChoicesEvaluate` on each.
- `'complete'` → deduplicate by `canonicalMoveKey`, add to `ready`.
- `'pending'` → deduplicate by `actionId` (unless distinct initial params, then by `canonicalMoveKey`), add to `pending`.
- `'illegal'` → skip.
- `'pendingStochastic'` → emit `templateDropped` visitor event (or `moveDropped` if ticket 006 is done), skip.
- On exception → emit visitor event, skip.

The function is **pure** (no RNG consumption).

### 3. Export from `mcts/index.ts`

Add `classifyMovesForSearch` and `MoveClassification` to the MCTS barrel export.

### 4. Write unit tests

New file: `packages/engine/test/unit/agents/mcts/classify-moves.test.ts`

## Files to Touch

- `packages/engine/src/agents/mcts/materialization.ts` (modify — add interface + function)
- `packages/engine/src/agents/mcts/index.ts` (modify — add export)
- `packages/engine/test/unit/agents/mcts/classify-moves.test.ts` (new)

## Out of Scope

- Integrating into `search.ts` (ticket 004)
- Integrating into `rollout.ts` (ticket 005)
- Removing old materialization functions (ticket 004/005)
- Visitor event renames (ticket 006)
- Any kernel changes
- Any rollout-specific logic (random completion for pending moves)

## Acceptance Criteria

### Tests That Must Pass

1. **all-complete**: All moves return `'complete'` → all in `ready`, none in `pending`.
2. **all-pending**: All moves return `'pending'` → all in `pending`, none in `ready`.
3. **mixed**: Mix of complete, pending, illegal, stochastic → correct partitioning.
4. **ready-dedup**: Duplicate moveKeys in complete set → deduplicated.
5. **pending-dedup-by-action**: Multiple moves from same `actionId` with same params → single pending entry.
6. **pending-distinct-params**: Multiple moves from same `actionId` with different params → separate entries.
7. **classification-error**: `legalChoicesEvaluate` throws → move dropped, visitor event emitted.
8. **empty-input**: Empty move list → empty `ready` and `pending`.
9. **illegal-only**: All moves illegal → empty `ready` and `pending`.
10. **stochastic-only**: All moves `pendingStochastic` → empty `ready` and `pending`, visitor events emitted.
11. `pnpm -F @ludoforge/engine build` — compiles cleanly.
12. `pnpm -F @ludoforge/engine test` — full suite passes.

### Invariants

1. `classifyMovesForSearch` is pure — no RNG state consumed, no side effects beyond visitor events.
2. `legalChoicesEvaluate` is the sole source of truth for classification (no `concreteActionIds` fallback).
3. Deduplication: ready by `MoveKey`, pending by `actionId` (or `MoveKey` when params differ).
4. No game-specific identifiers in the implementation.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/classify-moves.test.ts` — 10 test cases per acceptance criteria above

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
