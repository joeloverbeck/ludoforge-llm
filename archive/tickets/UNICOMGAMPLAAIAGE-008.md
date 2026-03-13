# UNICOMGAMPLAAIAGE-008: Rollout Policy (Epsilon-Greedy + Random)

**Status**: DONE
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new file in agents/mcts/
**Deps**: UNICOMGAMPLAAIAGE-007, UNICOMGAMPLAAIAGE-009

## Problem

After expansion, the search must simulate play to estimate the value of a position. Pure random playouts are too weak for many games. The default rollout is a short epsilon-greedy policy that samples candidate moves, evaluates one-step successors, and picks the best with probability `1 - epsilon`.

## Assumption Reassessment (2026-03-13)

1. `legalMoves()` exists in kernel for enumerating moves at any state.
2. `applyMove()` returns next state — used for one-step evaluation.
3. `evaluateState()` in `agents/evaluate-state.ts` provides per-player heuristic scores.
4. `completeTemplateMove` handles template completion during rollout.
5. `terminalResult()` in `kernel/terminal.ts` checks for game end.

## Architecture Check

1. Rollout is MCTS-internal — lives in `agents/mcts/rollout.ts`.
2. Reuses kernel `legalMoves`, `applyMove`, `terminalResult` and agent `evaluateState`.
3. Supports two modes: `epsilonGreedy` (default) and `random` (for benchmarking).
4. Stops at terminal or `maxSimulationDepth`.

## What to Change

### 1. Create `packages/engine/src/agents/mcts/rollout.ts`

Define:
- `RolloutResult`: `{ readonly state: GameState; readonly terminal: TerminalResult | null; readonly rng: Rng; readonly depth: number }`
- `rollout(def: GameDef, state: GameState, rng: Rng, config: Pick<MctsConfig, 'rolloutPolicy' | 'rolloutEpsilon' | 'rolloutCandidateSample' | 'maxSimulationDepth' | 'templateCompletionsPerVisit'>, runtime?: GameDefRuntime): RolloutResult`

Epsilon-greedy rollout logic (from spec §Simulation/Rollout Policy):
1. Stop immediately on terminal state.
2. Enumerate current legal moves.
3. Sample up to `rolloutCandidateSample` candidate moves (using PRNG).
4. Lazily materialize concrete completions for sampled templates (up to `templateCompletionsPerVisit`).
5. For each candidate, apply move and evaluate successor state for acting player.
6. With probability `1 - epsilon`, choose best-scoring candidate; else choose random.
7. Stop at `maxSimulationDepth` plies.

Random rollout: skip steps 5-6, just pick a random candidate.

### 2. Update `packages/engine/src/agents/mcts/index.ts`

Add re-export for `rollout.ts`.

## Files to Touch

- `packages/engine/src/agents/mcts/rollout.ts` (new)
- `packages/engine/src/agents/mcts/index.ts` (modify)
- `packages/engine/test/unit/agents/mcts/rollout.test.ts` (new)

## Out of Scope

- Utility transform of rollout result into [0,1] rewards — ticket 009.
- Backpropagation of rollout value — ticket 010.
- MAST-style rollout bias / history tables — spec Phase 2, ticket 015.
- Changes to kernel `legalMoves` or `applyMove`.

## Acceptance Criteria

### Tests That Must Pass

1. Terminal state input: returns immediately with depth 0 and the terminal result.
2. `maxSimulationDepth = 0`: returns immediately with leaf evaluation context.
3. Random rollout: moves are chosen uniformly (statistical test over many runs, or verify random selection call).
4. Epsilon-greedy with `epsilon = 0`: always picks best-scoring candidate (greedy).
5. Epsilon-greedy with `epsilon = 1`: always picks random candidate.
6. Rollout respects `maxSimulationDepth` — does not exceed configured depth.
7. Template moves during rollout are materialized correctly.
8. Deterministic: same state + same RNG produce same rollout trajectory.
9. Input state is not mutated.
10. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Rollout never exceeds `maxSimulationDepth` plies.
2. Rollout never calls `legalMoves` more than `maxSimulationDepth` times.
3. State transitions use only `applyMove` — no direct mutation.
4. RNG consumption is deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/rollout.test.ts` — terminal early exit, depth limit, greedy mode, random mode, template handling, determinism, immutability.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/agents/mcts/rollout.test.ts`
2. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
