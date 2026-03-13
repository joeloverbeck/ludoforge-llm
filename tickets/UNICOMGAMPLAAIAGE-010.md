# UNICOMGAMPLAAIAGE-010: Backpropagation + Core Search Loop + Diagnostics

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — new files in agents/mcts/
**Deps**: UNICOMGAMPLAAIAGE-002, UNICOMGAMPLAAIAGE-004, UNICOMGAMPLAAIAGE-005, UNICOMGAMPLAAIAGE-006, UNICOMGAMPLAAIAGE-007, UNICOMGAMPLAAIAGE-008, UNICOMGAMPLAAIAGE-009

## Problem

This is the central integration ticket that wires all MCTS components into a working search loop: belief sampling → selection → expansion → simulation → backpropagation. It also includes the optional diagnostics module for tuning/testing visibility.

## Assumption Reassessment (2026-03-13)

1. All component tickets (001-009) provide the building blocks needed.
2. `legalMoves()` is available from `kernel/legal-moves.ts`.
3. `applyMove()` is available from `kernel/apply-move.ts`.
4. `terminalResult()` is available from `kernel/terminal.ts`.
5. `fork()` from `kernel/prng.ts` splits RNG streams.
6. `GameDefRuntime` from `kernel/gamedef-runtime.ts` caches compiled runtime tables.

## Architecture Check

1. Search loop is the core orchestrator — lives in `agents/mcts/search.ts`.
2. Backpropagation is a simple utility — lives in `agents/mcts/search.ts` (or split out if >50 lines).
3. Diagnostics is optional and behind a config flag — `agents/mcts/diagnostics.ts`.
4. No kernel changes — search uses existing kernel APIs only.

## What to Change

### 1. Create `packages/engine/src/agents/mcts/search.ts`

Define:
- `backpropagate(node: MctsNode, rewards: readonly number[]): void` — walk parent chain incrementing `visits` and accumulating `totalReward` per player.
- `runOneIteration(root: MctsNode, sampledState: GameState, rng: Rng, def: GameDef, config: MctsConfig, rootLegalMoves: readonly Move[], runtime: GameDefRuntime, pool: NodePool): { readonly rng: Rng }`

One iteration logic (from spec §One Iteration):
1. **Selection**: traverse tree from root using ISUCT selection over available children in sampled state. At each node, enumerate legal moves, determine which existing children are available, update `availability` counts, select via ISUCT.
2. **Expansion**: if `shouldExpand(node)` and unexpanded legal candidates exist, materialize concrete candidates, filter already-expanded, pick via expansion priority, allocate child from pool.
3. **Simulation**: rollout from expanded state (or selected leaf) to terminal or depth cutoff.
4. **Evaluation**: if terminal, use `terminalToRewards()`; if cutoff, use `evaluateForAllPlayers()`.
5. **Backpropagation**: propagate reward vector up to root.

- `runSearch(root: MctsNode, def: GameDef, state: GameState, observation: PlayerObservation, observer: PlayerId, config: MctsConfig, searchRng: Rng, rootLegalMoves: readonly Move[], runtime: GameDefRuntime, pool: NodePool): { readonly rng: Rng; readonly iterations: number }`
  Main search loop: iterate `config.iterations` times (with optional time-budget early exit), calling `sampleBeliefState` + `runOneIteration` per iteration.

- `selectRootDecision(root: MctsNode, exploringPlayer: PlayerId): MctsNode`
  Select best child at root by highest visit count (robust child selection). Tiebreak by mean reward.

### 2. Create `packages/engine/src/agents/mcts/diagnostics.ts`

Define:
- `MctsSearchDiagnostics` interface: `{ iterations: number; nodesAllocated: number; maxTreeDepth: number; rootChildVisits: Record<string, number>; totalTimeMs?: number }`
- `collectDiagnostics(root: MctsNode, iterations: number, startTime?: number): MctsSearchDiagnostics`

### 3. Update `packages/engine/src/agents/mcts/index.ts`

Add re-exports for `search.ts` and `diagnostics.ts`.

## Files to Touch

- `packages/engine/src/agents/mcts/search.ts` (new)
- `packages/engine/src/agents/mcts/diagnostics.ts` (new)
- `packages/engine/src/agents/mcts/index.ts` (modify)
- `packages/engine/test/unit/agents/mcts/search.test.ts` (new)
- `packages/engine/test/unit/agents/mcts/diagnostics.test.ts` (new)

## Out of Scope

- MctsAgent class and factory integration — ticket 011.
- Solver proven-result propagation during backprop — ticket 014.
- Tree reuse across moves — spec Phase 3.
- Parallel search — spec Phase 3.
- Wall-clock timing implementation details beyond the basic `Date.now()` check.

## Acceptance Criteria

### Tests That Must Pass

1. `backpropagate` increments visits and accumulates rewards up the full parent chain.
2. `backpropagate` on root-only path: root visits = 1, root rewards = input rewards.
3. `runOneIteration` on a simple 2-player perfect-info fixture: allocates at least one child, performs one backprop.
4. `runSearch` with `iterations: 10` on a trivial fixture: returns after exactly 10 iterations.
5. `runSearch` with `iterations: 1` on single legal move: still runs one iteration.
6. `selectRootDecision` picks highest-visited child.
7. `selectRootDecision` tiebreaks by mean reward.
8. Availability counts: child visited in 5/10 iterations has `availability` close to 5 (exact depends on sampled legality).
9. Diagnostics: `collectDiagnostics` returns correct iteration count and node count.
10. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Total root visits after N iterations = N.
2. Sum of child visits <= root visits (children share iterations).
3. Search never mutates input `GameState`.
4. Search RNG is fully isolated from the returned agent RNG (handled in ticket 011's `chooseMove`).
5. Node allocation never exceeds pool capacity.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/search.test.ts` — backprop chain, single iteration, multi-iteration, root decision selection, availability accounting.
2. `packages/engine/test/unit/agents/mcts/diagnostics.test.ts` — correct diagnostic collection.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/agents/mcts/`
2. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
