# UNICOMGAMPLAAIAGE-014: Restricted Solver Support

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — new file in agents/mcts/, modify search.ts
**Deps**: UNICOMGAMPLAAIAGE-010

## Problem

For deterministic, perfect-information, 2-player, win/loss/draw games, MCTS-Solver can prove nodes as won/lost/drawn, enabling exact minimax play in endgames. This must be deliberately restricted to avoid unsound application to hidden-info or stochastic games.

## Assumption Reassessment (2026-03-13)

1. `ProvenResult` type already defined in ticket 002's node structure — `win | loss | draw`.
2. `solverMode` config field exists: `'off' | 'perfectInfoDeterministic2P'` — from ticket 001.
3. `GameDef` has zone visibility, player count, and terminal semantics available to check preconditions.
4. Solver must verify at activation time that the game qualifies.

## Architecture Check

1. Solver logic isolated in `agents/mcts/solver.ts`.
2. Integration point: search loop in `search.ts` calls solver update after backpropagation when mode is enabled.
3. Solver does NOT activate for hidden-info, stochastic, >2 player, or score-ranking games — checked at search start.

## What to Change

### 1. Create `packages/engine/src/agents/mcts/solver.ts`

Define:
- `canActivateSolver(def: GameDef, state: GameState, config: MctsConfig): boolean`
  Returns `true` only when ALL conditions hold:
  - `config.solverMode === 'perfectInfoDeterministic2P'`
  - All zones have `visibility: 'public'`
  - No `RevealGrant`s in state (no hidden-info mechanics active)
  - `state.playerCount === 2`
  - Terminal semantics are `win`/`draw`/`lossAll` only (no `score` ranking)
  - Game is deterministic from searched state (no stochastic effects — heuristic: no `rollRandom` in action effects)

- `updateSolverResult(node: MctsNode, def: GameDef, state: GameState): void`
  After backpropagation, check if node can be proven:
  - If node's state is terminal: set `provenResult` from terminal result.
  - If all children are proven: propagate minimax (if all children are losses for acting player → node is win for opponent; if any child is win for acting player → node is win).
  - Mark draw if all children are proven and none is a win.

- `selectSolverAwareChild(node: MctsNode, exploringPlayer: PlayerId): MctsNode | null`
  If a child is proven won for exploring player, return it immediately. If all children proven lost, return null (signal loss). Otherwise return null (no solver shortcut).

### 2. Modify `packages/engine/src/agents/mcts/search.ts`

- At search start, check `canActivateSolver(def, state, config)` and store flag.
- After each backpropagation, if solver active, call `updateSolverResult`.
- During selection, if solver active, check `selectSolverAwareChild` before ISUCT.
- If root is proven, break search early.

### 3. Update `packages/engine/src/agents/mcts/index.ts`

Add re-export for `solver.ts`.

## Files to Touch

- `packages/engine/src/agents/mcts/solver.ts` (new)
- `packages/engine/src/agents/mcts/search.ts` (modify — add solver integration points)
- `packages/engine/src/agents/mcts/index.ts` (modify)
- `packages/engine/test/unit/agents/mcts/solver.test.ts` (new)

## Out of Scope

- Solver for hidden-info games — explicitly unsound, spec forbids.
- Solver for stochastic games — explicitly unsound.
- Solver for multiplayer (>2) games — too complex for V1.
- Solver for score-ranking terminal semantics.
- General transposition tables.
- RAVE/GRAVE integration with solver.

## Acceptance Criteria

### Tests That Must Pass

1. `canActivateSolver` returns `false` for hidden-info game (zone with `visibility: 'owner'`).
2. `canActivateSolver` returns `false` for >2 player game.
3. `canActivateSolver` returns `false` when `solverMode: 'off'`.
4. `canActivateSolver` returns `true` for 2-player, all-public, win/loss/draw game with solver enabled.
5. Terminal node correctly marked as proven.
6. Node with all-loss children proven as win for opponent.
7. Node with one win child proven as win for acting player.
8. Root proven early terminates search (fewer iterations than budget).
9. Solver does not activate mid-search if game doesn't qualify at start.
10. Non-solver games: `provenResult` remains `null` on all nodes.
11. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Solver never activates for hidden-info or stochastic games — this is a hard safety invariant.
2. Solver proven results are consistent with minimax: no false proofs.
3. When solver is `off`, search behavior is identical to pre-solver code.
4. Solver does not affect observation-equivalence or fairness properties (those games are hidden-info, where solver is off).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/solver.test.ts` — activation checks, proven result propagation, early termination, safety for non-qualifying games.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/agents/mcts/solver.test.ts`
2. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-13
- **What changed**:
  - Created `packages/engine/src/agents/mcts/solver.ts` with `canActivateSolver`, `updateSolverResult`, `selectSolverAwareChild`, plus `rollRandom` detection helpers for stochastic game rejection.
  - Modified `packages/engine/src/agents/mcts/search.ts`: solver activation check at search start, solver-aware child selection shortcut before ISUCT, proven-result propagation after backpropagation, early termination when root is proven.
  - Updated `packages/engine/src/agents/mcts/index.ts` with solver re-exports.
  - Created `packages/engine/test/unit/agents/mcts/solver.test.ts` with 18 tests covering all 11 acceptance criteria.
- **Deviations**: None. All deliverables implemented as specified.
- **Verification**: 18/18 solver tests pass, 4423/4423 engine tests pass, lint 0 errors, typecheck clean.
