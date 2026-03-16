# 62MCTSSEAVIS-007: Extend MctsNode with Decision Node Fields

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents/mcts/node.ts, node-pool.ts
**Deps**: 62MCTSSEAVIS-001

## Problem

MctsNode has no way to represent mid-decision states. The incremental decision expansion needs nodes that track partial moves without computing game state. This ticket adds the structural fields without changing any search behavior.

## What to Change

### 1. Add fields to MctsNode

```typescript
nodeKind: 'state' | 'decision';
decisionPlayer: PlayerId | null;
partialMove: Move | null;
decisionBinding: string | null;
```

### 2. Update createRootNode()

Set `nodeKind: 'state'`, all decision fields to `null`. Existing behavior unchanged.

### 3. Update createChildNode()

Set `nodeKind: 'state'`, all decision fields to `null`. Existing state-node creation unchanged.

### 4. Create createDecisionChildNode() factory

New factory function that sets `nodeKind: 'decision'`, populates `decisionPlayer`, `partialMove`, `decisionBinding`. Sets `heuristicPrior` to `null` (invariant: decision nodes have no heuristic).

### 5. Update node-pool.ts reset

Reset new fields on pool recycling: `nodeKind = 'state'`, decision fields to `null`.

## Files to Touch

- `packages/engine/src/agents/mcts/node.ts` (modify)
- `packages/engine/src/agents/mcts/node-pool.ts` (modify)

## Out of Scope

- Decision expansion logic (62MCTSSEAVIS-008)
- Search loop changes (62MCTSSEAVIS-010)
- Decision key generation (62MCTSSEAVIS-009)
- Rollout changes (62MCTSSEAVIS-011)
- Any behavioral changes to the search — this is structural only

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `createRootNode()` produces node with `nodeKind: 'state'`, decision fields null
2. Unit test: `createChildNode()` produces node with `nodeKind: 'state'`, decision fields null
3. Unit test: `createDecisionChildNode()` produces node with `nodeKind: 'decision'`, correct decision fields, `heuristicPrior: null`
4. Unit test: pool reset clears decision fields back to defaults
5. Unit test: existing node creation patterns still work identically
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `heuristicPrior` is always `null` for `nodeKind === 'decision'` nodes
2. All existing node creation produces `nodeKind: 'state'` — no behavioral change
3. Pool reset restores nodes to clean state-node defaults
4. `decisionPlayer`, `partialMove`, `decisionBinding` are all `null` for state nodes

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/node.test.ts` — extend with decision node factory tests
2. `packages/engine/test/unit/agents/mcts/node-pool.test.ts` — extend with decision field reset tests

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-path-pattern node`
2. `pnpm turbo build && pnpm turbo typecheck`
