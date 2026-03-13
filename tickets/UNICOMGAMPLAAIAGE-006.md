# UNICOMGAMPLAAIAGE-006: Progressive Widening and Expansion Priority

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — new file in agents/mcts/
**Deps**: UNICOMGAMPLAAIAGE-002

## Problem

Large move spaces are first-class in the engine (template moves, multi-param actions). Progressive widening limits how many children a node admits over time, preventing the tree from becoming too wide too early. Expansion priority provides a cheap, game-agnostic competence boost by preferring terminal wins and heuristically strong moves.

## Assumption Reassessment (2026-03-13)

1. `MctsNode` from ticket 002 has `children` array and `visits` counter — confirmed.
2. Defaults: `K = 2.0`, `alpha = 0.5` — from spec §Expansion Policy.
3. Expansion priority: terminal win > best heuristic > PRNG tiebreak — spec §Expansion Priority.
4. `evaluateState` exists in `agents/evaluate-state.ts` for one-step heuristic scoring.

## Architecture Check

1. Progressive widening is a pure predicate: "should expand?" based on `node.children.length` vs `maxChildren(node)`.
2. Expansion priority is a sorting/selection function over candidate moves.
3. Both isolated in `expansion.ts` — no kernel changes.

## What to Change

### 1. Create `packages/engine/src/agents/mcts/expansion.ts`

Define:
- `maxChildren(visits: number, K: number, alpha: number): number` — `max(1, floor(K * visits^alpha))`
- `shouldExpand(node: MctsNode, K: number, alpha: number): boolean` — `node.children.length < maxChildren(node.visits, K, alpha)`
- `selectExpansionCandidate(candidates: readonly ConcreteMoveCandidate[], def: GameDef, state: GameState, actingPlayer: PlayerId, rng: Rng, runtime?: GameDefRuntime): { readonly candidate: ConcreteMoveCandidate; readonly rng: Rng }`

Expansion priority logic:
1. Check for immediate terminal win: apply each candidate, check `terminalResult()`, if win for acting player, select it.
2. Among non-terminal candidates, evaluate one-step heuristic (`evaluateState`) for acting player, select highest.
3. Ties broken by PRNG.

### 2. Update `packages/engine/src/agents/mcts/index.ts`

Add re-export for `expansion.ts`.

## Files to Touch

- `packages/engine/src/agents/mcts/expansion.ts` (new)
- `packages/engine/src/agents/mcts/index.ts` (modify)
- `packages/engine/test/unit/agents/mcts/expansion.test.ts` (new)

## Out of Scope

- Template move materialization (how candidates are generated) — ticket 007.
- Selection formula (ISUCT) — ticket 005.
- The actual search loop that calls these functions — ticket 010.
- Changing `evaluateState` or `terminalResult` — reuse as-is.

## Acceptance Criteria

### Tests That Must Pass

1. `maxChildren(0, 2, 0.5)` returns 1 (minimum).
2. `maxChildren(1, 2, 0.5)` returns 2.
3. `maxChildren(4, 2, 0.5)` returns 4 (`2 * sqrt(4) = 4`).
4. `shouldExpand` returns `true` when `children.length < maxChildren`.
5. `shouldExpand` returns `false` when `children.length >= maxChildren`.
6. Expansion priority: immediate-win candidate is selected over higher-heuristic non-win.
7. Expansion priority: highest heuristic selected among non-terminal candidates.
8. Expansion priority: PRNG tiebreak for equal heuristics is deterministic.
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `maxChildren` always returns >= 1.
2. `shouldExpand` is a pure predicate — no mutation.
3. Expansion priority never calls `applyMove` more than `candidates.length` times.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/expansion.test.ts` — maxChildren math, shouldExpand predicate, expansion priority with terminal wins, heuristic ranking, PRNG tiebreak.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/agents/mcts/expansion.test.ts`
2. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
