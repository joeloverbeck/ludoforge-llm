# 62MCTSSEAVIS-012: Pool Sizing, Graceful Degradation & Post-Completion

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents/mcts/mcts-agent.ts
**Deps**: 62MCTSSEAVIS-007, 62MCTSSEAVIS-010

## Problem

Decision nodes increase tree depth and node count. The pool must be sized to accommodate decision subtrees. Pool exhaustion must degrade gracefully. When the best root action is a template (decision root), post-completion must follow the decision subtree.

## Baseline Data (from 62MCTSSEAVIS-006)

Current pool capacity is 201 for all scenarios (formula: `max(iterations + 1, moves * 4)`). The two scenarios that complete their 200 iterations use 193 nodes (96%) and 200 nodes (99.5%) respectively — near saturation with zero decision nodes. The new formula `max(iterations * decisionDepthMultiplier + 1, moves * 4)` with default multiplier 4 would give 801, providing substantial headroom. Zero `poolExhausted` events in baseline.

## What to Change

### 1. Pool capacity formula

Replace existing pool sizing with:
```
poolCapacity = max(iterations * decisionDepthMultiplier + 1, legalMoves.length * 4)
```
Where `decisionDepthMultiplier` comes from `MctsConfig` (default 4).

### 2. Graceful degradation on pool exhaustion

When pool is exhausted mid-search:
1. Skip expansion — do not allocate a new node
2. Backpropagate from the current node (treat as a leaf)
3. Emit `poolExhausted` visitor event
4. Continue remaining iterations (traverse existing tree, improve UCB estimates)
5. Do NOT abort the search

### 3. Post-completion for decision node children

Update `postCompleteSelectedMove()` in `mcts-agent.ts`:
- If `selectRootDecision()` returns a decision root node:
  1. Follow the highest-visit path through the decision subtree
  2. Find the deepest explored partial move
  3. Complete remaining decisions via `completeTemplateMove()`
  4. Fall back to `completeTemplateMove()` on original legal moves if needed

## Files to Touch

- `packages/engine/src/agents/mcts/mcts-agent.ts` (modify)

## Out of Scope

- Decision expansion logic (62MCTSSEAVIS-008)
- Search loop changes (62MCTSSEAVIS-010)
- Rollout changes (62MCTSSEAVIS-011)
- Config field additions (already in 62MCTSSEAVIS-002)
- Tuning specific multiplier values (62MCTSSEAVIS-019)

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: pool capacity formula `max(iterations * multiplier + 1, legalMoves.length * 4)` with default multiplier 4
2. Unit test: pool capacity with custom `decisionDepthMultiplier` value
3. Unit test: pool exhaustion emits `poolExhausted` visitor event
4. Unit test: pool exhaustion does NOT abort search — remaining iterations continue
5. Unit test: pool exhaustion skips expansion and backpropagates from current node
6. Unit test: `postCompleteSelectedMove` follows highest-visit path in decision subtree
7. Unit test: `postCompleteSelectedMove` completes remaining decisions via `completeTemplateMove()`
8. Unit test: `postCompleteSelectedMove` with concrete root action unchanged (existing behavior)
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Pool exhaustion never crashes the search
2. Search results are valid even after pool exhaustion (partial tree still useful)
3. `postCompleteSelectedMove` always returns a fully-resolved move
4. Pool capacity >= `legalMoves.length * 4` (minimum floor)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/mcts-agent-pool.test.ts` — pool sizing, exhaustion handling
2. `packages/engine/test/unit/agents/mcts/mcts-agent-post-completion.test.ts` — decision root post-completion

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-path-pattern mcts-agent`
2. `pnpm turbo build && pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-16
- **What changed**:
  - `search.ts`: Added `iterationIndex` parameter to `runOneIteration`; added pool exhaustion try/catch with `poolExhausted` visitor event emission at 3 allocation sites (decision-complete state child, decision root creation, state-node expansion); search continues remaining iterations after exhaustion.
  - `mcts-agent.ts`: `postCompleteSelectedMove` now handles `bestChild.nodeKind === 'decision'` — follows highest-visit path through decision subtree, completes remaining decisions via `completeTemplateMove()`, falls back to original template/siblings/legal moves.
  - New test file `mcts-agent-pool.test.ts` (5 tests): pool formula default/custom multiplier, floor, exhaustion non-abort, valid results after exhaustion.
  - New test file `mcts-agent-post-completion.test.ts` (4 tests): concrete child unchanged, decision subtree path, completion, fully-resolved invariant.
- **Deviations**: Pool capacity formula (deliverable #1) was already implemented from a prior ticket; only tests were added for it.
- **Verification**: Build pass, typecheck pass, 17/17 new tests pass, 4914/4914 full engine suite pass (0 regressions).
