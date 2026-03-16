# 63MCTSRUNMOVCLA-004: Integrate `classifyMovesForSearch` into `search.ts`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — MCTS `search.ts`, `materialization.ts` (remove old functions)
**Deps**: 63MCTSRUNMOVCLA-002

## Problem

`search.ts` partitions root legal moves using `concreteActionIds` (compile-time) and then materializes "concrete" moves via `materializeOrFastPath`. This causes crashes for actions without template params but with inline decisions. The new `classifyMovesForSearch` (from ticket 002) must replace this partition + materialize block.

## Assumption Reassessment (2026-03-16)

1. The partition block is at `search.ts` lines ~319-331 — **confirmed**. Splits into `concreteMoves[]` and `templateMoves[]`.
2. Materialization block at lines ~333-347 calls `materializeOrFastPath` on concrete moves only — **confirmed**.
3. Decision root creation at lines ~349-389 iterates `templateMoves` — **confirmed**.
4. Forced-sequence compression at lines ~401-441 checks `candidates.length === 1 && templateMoves.length === 0` — **confirmed**.

## Architecture Check

1. Unified code path: all moves go through `classifyMovesForSearch` regardless of action definition structure. Eliminates the concrete/template bifurcation.
2. Decision roots now created for ALL pending moves (not just "template" ones), correctly routing actions like `rally`, `march` that have inline decisions.
3. No backwards-compatibility shims.

## What to Change

### 1. Replace partition + materialize block in `runOneIteration`

Remove:
- The `concreteActionIds`-based partition loop (lines ~319-331)
- The `materializeOrFastPath` call block (lines ~333-347)

Replace with:
```typescript
const classification = classifyMovesForSearch(def, currentState, movesAtNode, runtime, config.visitor);
const candidates = classification.ready;
```

### 2. Update decision root creation

Change the decision root loop to iterate `classification.pending` instead of `templateMoves`:
```typescript
for (const pendingMove of classification.pending) {
  const rootKey = templateDecisionRootKey(pendingMove.actionId);
  // ... same decision root wiring as current template handling
}
```

### 3. Update forced-sequence compression

Change from:
```typescript
if (candidates.length === 1 && templateMoves.length === 0)
```
to:
```typescript
if (candidates.length === 1 && classification.pending.length === 0)
```

### 4. Remove `materializeOrFastPath` from `materialization.ts`

Since ticket 005 will handle the rollout side, and this ticket replaces the search side, `materializeOrFastPath` can be removed. If ticket 005 hasn't landed yet, keep the function but remove the search.ts call site.

### 5. Update `mcts/index.ts` exports

Remove `materializeConcreteCandidates` export if no longer used (check rollout.ts call sites — if ticket 005 hasn't landed, keep it temporarily).

## Files to Touch

- `packages/engine/src/agents/mcts/search.ts` (modify — replace partition/materialize/decision-root blocks)
- `packages/engine/src/agents/mcts/materialization.ts` (modify — remove `materializeOrFastPath` if safe)
- `packages/engine/src/agents/mcts/index.ts` (modify — update exports)
- `packages/engine/test/unit/agents/mcts/search.test.ts` (modify — update tests that assert partition behavior)
- `packages/engine/test/unit/agents/mcts/search-decision.test.ts` (modify — decision roots now created for pending moves)
- `packages/engine/test/unit/agents/mcts/search-visitor.test.ts` (modify — visitor event emission changes)
- `packages/engine/test/unit/agents/mcts/materialization-fastpath.test.ts` (delete — fast path removed)

## Out of Scope

- Rollout changes (ticket 005)
- Visitor event type renames (ticket 006)
- FITL MCTS fast validation (ticket 007)
- Kernel changes
- Runner changes
- Performance optimization of `legalChoicesEvaluate`

## Acceptance Criteria

### Tests That Must Pass

1. Existing `search.test.ts` tests pass (move selection, expansion, backpropagation behavior unchanged for already-working games).
2. `search-decision.test.ts` tests pass — decision root nodes are created for pending moves.
3. Moves from parameterless actions with inline decisions now get decision root nodes (not fast-pathed to `applyMove`).
4. Forced-sequence compression still works: single ready move + 0 pending = compressed (no node allocation).
5. `pnpm -F @ludoforge/engine build` — compiles cleanly.
6. `pnpm -F @ludoforge/engine test` — full suite passes.

### Invariants

1. All moves classified at runtime via `legalChoicesEvaluate` — no compile-time partition.
2. Decision root nodes created for every unique pending `actionId`.
3. Ready candidates (`classification.ready`) passed to `selectExpansionCandidate` — these are guaranteed complete.
4. No game-specific identifiers introduced.
5. Determinism preserved: same seed + same moves = same tree structure.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/search.test.ts` — update partition-related assertions
2. `packages/engine/test/unit/agents/mcts/search-decision.test.ts` — verify pending moves get decision roots
3. Remove `packages/engine/test/unit/agents/mcts/materialization-fastpath.test.ts` (if not already removed in ticket 001)

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
