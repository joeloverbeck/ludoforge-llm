# UNICOMGAMPLAAIAGE-005: Availability-Aware ISUCT Selection Formula

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — new file in agents/mcts/
**Deps**: UNICOMGAMPLAAIAGE-002

## Problem

Standard UCT uses parent visit counts in the exploration term, which is incorrect for hidden-information search where not every action is available in every sampled world. The MCTS agent needs an availability-aware selection formula (ISUCT) that uses per-child availability counts instead.

## Assumption Reassessment (2026-03-13)

1. `MctsNode` from ticket 002 has `visits`, `availability`, `totalReward`, `children` fields — confirmed by spec design.
2. The formula uses `child.availability` not `parent.visits` in the exploration term — key difference from standard UCT.
3. Unvisited available children are preferred for expansion before applying the formula — spec §Selection Policy.

## Architecture Check

1. Pure mathematical function — no state mutation, no kernel dependency.
2. Isolated in `isuct.ts` — single-responsibility.
3. Acting player is read from sampled state at call site, not cached on node.

## What to Change

### 1. Create `packages/engine/src/agents/mcts/isuct.ts`

Define:
- `selectChild(node: MctsNode, exploringPlayer: PlayerId, explorationConstant: number, availableChildren: readonly MctsNode[]): MctsNode`

Selection logic:
1. If any available children have `visits === 0`, return the first unvisited one (expansion preference).
2. Otherwise, compute ISUCT score for each available child:
   ```
   score = meanReward(child, exploringPlayer) + C * sqrt(ln(max(1, child.availability)) / child.visits)
   ```
   where `meanReward = child.totalReward[exploringPlayer] / child.visits`.
3. Return child with highest score. Ties broken by first-found (deterministic given input order).

### 2. Update `packages/engine/src/agents/mcts/index.ts`

Add re-export for `isuct.ts`.

## Files to Touch

- `packages/engine/src/agents/mcts/isuct.ts` (new)
- `packages/engine/src/agents/mcts/index.ts` (modify)
- `packages/engine/test/unit/agents/mcts/isuct.test.ts` (new)

## Out of Scope

- Availability counting logic (done during tree traversal in search loop — ticket 010).
- Progressive widening (decides when to expand vs select — ticket 006).
- Solver-aware selection — ticket 014.
- Node creation or mutation.

## Acceptance Criteria

### Tests That Must Pass

1. Single available unvisited child: returns that child.
2. Multiple unvisited available children: returns the first one.
3. All children visited: returns child with highest ISUCT score.
4. High availability, low visits: exploration term dominates, prefers under-explored.
5. High visits, low reward: exploitation term low, avoids weak moves.
6. `explorationConstant = 0`: pure exploitation (highest mean reward wins).
7. Large `explorationConstant`: exploration dominates.
8. Empty `availableChildren`: throws descriptive error.
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `selectChild` is a pure function — no mutation of any node.
2. Selection only considers children in the `availableChildren` list.
3. The formula uses `child.availability` (not `parent.visits`) for the exploration term.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/isuct.test.ts` — unvisited preference, score computation, exploration constant effects, edge cases.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/agents/mcts/isuct.test.ts`
2. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
