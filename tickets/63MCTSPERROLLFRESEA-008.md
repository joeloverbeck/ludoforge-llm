# 63MCTSPERROLLFRESEA-008: Conditional — implicit heuristic backups

**Status**: DONE
**Priority**: LOW
**Effort**: Medium
**Engine Changes**: Yes — `agents/mcts/node.ts`, `agents/mcts/search.ts`, `agents/mcts/isuct.ts`, `agents/mcts/config.ts`
**Deps**: `archive/tickets/63MCTSPERROLLFRESEA-007.md`

## Problem

If `hybrid` mode achieves the desired speedup but still shows meaningful quality regression vs `legacy` (>5% weaker on the campaign bench), a stronger hybridization is needed. The idea is to store heuristic leaf evaluations separately from Monte Carlo reward statistics and blend them during selection, giving the tree both simulation-backed and heuristic-backed signals.

**This ticket is conditional.** It should only be implemented if:
- `hybrid` hits the speed target (all CI lanes under 15 min), AND
- quality still regresses enough that `legacy` would otherwise remain the default.

## Assumption Reassessment (2026-03-14)

1. `MctsNode` has `totalReward: number[]` (per-player array) and `visits: number` — confirmed.
2. `selectChild()` in `isuct.ts` uses UCB1-style formula with `totalReward[p] / visits` as exploitation term — confirmed.
3. `evaluateForAllPlayers()` returns a `number[]` reward vector — confirmed.
4. The current `backpropagate()` function updates `totalReward` and `visits` — confirmed.

## Architecture Check

1. Storing heuristic values separately from MC rewards preserves clean data semantics — the MC average converges to the true value, while the heuristic provides an initial estimate.
2. A config-gated `alpha` parameter allows smooth transition: `alpha = 0` means pure MC (no behavior change), `alpha > 0` blends in heuristic.
3. No game-specific logic — the heuristic comes from the existing generic `evaluateForAllPlayers()`.

## What to Change

### 1. Extend `MctsNode` in `node.ts`

Add optional fields:
```ts
heuristicReward?: readonly number[];  // per-player heuristic evaluation at expansion time
heuristicVisits?: number;             // typically 1 (the heuristic is evaluated once)
```

Populate these during expansion when the node is first created (store the heuristic evaluation of the expanded state).

### 2. Add config field in `config.ts`

- `heuristicBackupAlpha?: number` (default: `0` — disabled)

When `alpha = 0`, selection uses pure MC rewards (identical to phase-1 behavior). When `alpha > 0`, selection blends:
```ts
blendedMean = (1 - alpha) * mcMean + alpha * heuristicMean
```

Add validation: `heuristicBackupAlpha` must be in `[0, 1]`.

### 3. Modify selection in `isuct.ts`

When `config.heuristicBackupAlpha > 0` and the child has `heuristicReward`, use the blended mean in the exploitation term of the UCB formula.

### 4. Wire heuristic evaluation during expansion in `search.ts`

When a new node is expanded, store the heuristic evaluation of the expanded state in `heuristicReward`.

## Files to Touch

- `packages/engine/src/agents/mcts/node.ts` (modify)
- `packages/engine/src/agents/mcts/search.ts` (modify)
- `packages/engine/src/agents/mcts/isuct.ts` (modify)
- `packages/engine/src/agents/mcts/config.ts` (modify)
- `packages/engine/test/unit/agents/mcts/isuct.test.ts` (modify)
- `packages/engine/test/unit/agents/mcts/config.test.ts` (modify)

## Out of Scope

- Any changes to the evaluation function itself (`evaluateForAllPlayers()`).
- Neural network evaluation.
- Any changes to rollout modes or policies.
- State-info cache changes.
- Forced-sequence compression changes.
- Root stopping changes.
- Enabling `heuristicBackupAlpha > 0` in any named preset without prior benchmark evidence.

## Acceptance Criteria

### Tests That Must Pass

1. **isuct.test.ts** (modified): When `heuristicBackupAlpha = 0`, selection produces identical results to the phase-1 formula (no behavior change).
2. **isuct.test.ts** (modified): When `heuristicBackupAlpha > 0`, selection uses the blended mean correctly.
3. **isuct.test.ts** (modified): When `heuristicReward` is undefined on a child, the blended formula falls back to pure MC mean.
4. **config.test.ts**: `heuristicBackupAlpha` defaults to `0`.
5. **config.test.ts**: Validation rejects `heuristicBackupAlpha` outside `[0, 1]`.
6. Quality bench (manual): `alpha > 0` shows improvement before any named preset enables it.
7. Existing suite: `pnpm -F @ludoforge/engine test` — all existing tests pass.

### Invariants

1. `alpha = 0` preserves phase-1 behavior exactly — no regression from adding the code path.
2. No named preset enables `heuristicBackupAlpha > 0` unless benchmark evidence supports it.
3. Determinism: heuristic backup does not alter RNG streams.
4. `MctsNode` mutation rules are respected (heuristicReward set once at expansion, never mutated after).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/isuct.test.ts` — modified: tests for blended selection with `alpha = 0` and `alpha > 0`.
2. `packages/engine/test/unit/agents/mcts/config.test.ts` — modified: validation tests for `heuristicBackupAlpha`.

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/unit/agents/mcts/isuct.test.js`
2. `pnpm turbo build && pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck && pnpm turbo lint`
