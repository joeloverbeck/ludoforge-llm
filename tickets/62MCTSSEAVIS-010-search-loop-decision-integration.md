# 62MCTSSEAVIS-010: Search Loop Decision Node Integration

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — agents/mcts/search.ts, isuct.ts
**Deps**: 62MCTSSEAVIS-007, 62MCTSSEAVIS-008, 62MCTSSEAVIS-009

## Problem

The search loop selection must detect `nodeKind` and handle decision nodes differently from state nodes: use standard UCT (not ISUCT), traverse without `applyMove`, and complete decisions when `legalChoicesDiscover()` returns `complete`.

## What to Change

### 1. Selection loop: detect nodeKind

In the selection loop (`runOneIteration` or equivalent):
- `nodeKind === 'state'` → existing ISUCT selection with `child.availability` denominator
- `nodeKind === 'decision'` → standard UCT with `parent.visits` denominator, no availability

### 2. No-applyMove traversal through decision subtrees

Decision nodes share the game state from their nearest ancestor state node. Selection through a decision subtree = pure tree walk. No kernel calls.

### 3. applyMove on decision completion

When `expandDecisionNode` returns a completed move:
1. Call `applyMove(state, completedMove)` exactly once
2. Create a state node child with the resulting game state
3. Continue normal search from the new state node

### 4. Emit visitor events

- `decisionNodeCreated` when allocating a new decision node
- `decisionCompleted` when a decision sequence resolves
- `decisionIllegal` when a path is pruned

### 5. Exploring player

Read from `ChoicePendingRequest.decisionPlayer`, not from game state's current player.

### 6. Forced-sequence compression integration

Single-option decision steps skip node allocation — advance partial move directly. This mirrors how forced-sequence compression works for single-candidate game moves.

## Files to Touch

- `packages/engine/src/agents/mcts/search.ts` (modify — major changes to selection loop)
- `packages/engine/src/agents/mcts/isuct.ts` (modify — add standard UCT variant for decision nodes)

## Out of Scope

- Rollout integration (62MCTSSEAVIS-011)
- Pool sizing (62MCTSSEAVIS-012)
- Post-completion for decision roots (62MCTSSEAVIS-012)
- `rootCandidates` event (62MCTSSEAVIS-013)
- Decision expansion logic itself (62MCTSSEAVIS-008)

## Acceptance Criteria

### Tests That Must Pass

1. Integration test: search with a game that has template moves creates decision subtrees
2. Unit test: decision node selection uses `parent.visits` denominator (standard UCT)
3. Unit test: state node selection uses `child.availability` denominator (ISUCT)
4. Unit test: `applyMove` is called exactly once when decision completes (not for intermediate decision nodes)
5. Unit test: decision subtree traversal makes zero kernel calls
6. Unit test: forced-sequence compression skips node allocation for single-option decisions
7. Unit test: visitor receives `decisionNodeCreated`, `decisionCompleted`, `decisionIllegal` events
8. Unit test: exploring player reads from `ChoicePendingRequest.decisionPlayer`
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `applyMove` called exactly once per decision completion — never for intermediate steps
2. Decision nodes never store computed game state
3. State nodes use ISUCT; decision nodes use standard UCT — no cross-contamination
4. Search behavior for games with only concrete moves is unchanged (no decision nodes created)
5. Confidence-based stopping operates on root children visit counts (includes decision root nodes)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/search-decision.test.ts` — selection with decision nodes, UCT variant dispatch
2. `packages/engine/test/integration/mcts-decision-integration.test.ts` — end-to-end with template moves

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-path-pattern search`
2. `pnpm -F @ludoforge/engine test -- --test-path-pattern mcts-decision`
3. `pnpm turbo build && pnpm turbo typecheck`
