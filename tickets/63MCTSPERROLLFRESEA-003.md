# 63MCTSPERROLLFRESEA-003: MAST rollout policy

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents/mcts/mast.ts` (new), `agents/mcts/config.ts`, `agents/mcts/rollout.ts`, `agents/mcts/search.ts`
**Deps**: 63MCTSPERROLLFRESEA-002 (rollout modes must exist; `simulateToCutoff()` must accept a playout policy)

## Problem

The `default` and `strong` presets are slow primarily because the epsilon-greedy rollout policy repeatedly calls `applyMove()` + `evaluateState()` for every candidate at every rollout ply to score successors. This is the per-ply multiplier that dominates wall-clock time.

MAST (Move-Average Sampling Technique) replaces this with cheap map lookups of per-move reward averages collected during the search. This removes the worst cost multiplier while retaining a forward-simulation signal.

## Assumption Reassessment (2026-03-14)

1. `rolloutPolicy` type is `'random' | 'epsilonGreedy'` — needs extension with `'mast'`.
2. `move-key.ts` provides `canonicalMoveKey()` for keying — confirmed.
3. `rollout()` currently calls `sampleCandidates()` which does the expensive epsilon-greedy scoring — confirmed.
4. `backpropagate()` in `search.ts` updates node statistics — MAST updates would happen alongside or after backpropagation.
5. The spec says MAST stats are local to a single `runSearch()` call — no cross-search persistence.

## Architecture Check

1. A dedicated `mast.ts` module keeps the MAST data structure and logic isolated from rollout mechanics.
2. MAST keying by canonical move key only (not per-player) with per-player reward arrays is the standard academic approach and avoids key partitioning.
3. The warm-up threshold prevents noisy early exploitation without adding complexity.

## What to Change

### 1. Create `mast.ts` module

Define:
```ts
interface MastEntry {
  readonly visits: number;
  readonly rewardSums: readonly number[]; // indexed by player ordinal
}

interface MastStats {
  readonly entries: Map<string, MastEntry>;
  totalUpdates: number;
}
```

Functions:
- `createMastStats(playerCount: number): MastStats` — creates empty stats.
- `updateMastStats(stats: MastStats, moveKeys: readonly string[], rewards: readonly number[]): void` — updates entries for each traversed move key with the reward vector. Increments `totalUpdates`.
- `mastSelectMove(stats: MastStats, candidates: readonly ConcreteMoveCandidate[], currentPlayerOrdinal: number, epsilon: number, warmUpThreshold: number, rng: Rng): { candidate: ConcreteMoveCandidate; rng: Rng }` — selects a candidate using MAST policy (best mean reward for current player with prob `1 - epsilon`, random otherwise). Falls back to random if `totalUpdates < warmUpThreshold`.

### 2. Extend `MctsRolloutPolicy` in `config.ts`

Add `'mast'` to the policy union:
```ts
export type MctsRolloutPolicy = 'random' | 'epsilonGreedy' | 'mast';
```

Add `mastWarmUpThreshold?: number` (default: `32`) to `MctsConfig`.

Update named presets to use `rolloutPolicy: 'mast'` for all three presets.

### 3. Wire MAST into `simulateToCutoff()` in `rollout.ts`

When `rolloutPolicy === 'mast'`, use `mastSelectMove()` instead of `sampleCandidates()` for move selection during cutoff simulation. The key performance property: MAST selection does map lookups only — it does **not** call `applyMove()` or `evaluateState()` per candidate.

### 4. Wire MAST lifecycle in `search.ts`

- Create `MastStats` at the start of `runSearch()`.
- After backpropagation in `runOneIteration()`, call `updateMastStats()` with the concatenation of selection-phase move keys and simulation-phase move keys, plus the reward vector.
- Pass `mastStats` to the simulation function.

### 5. Update `index.ts` re-exports

Export `MastStats`, `MastEntry`, `createMastStats`, `updateMastStats` from the module index.

## Files to Touch

- `packages/engine/src/agents/mcts/mast.ts` (new)
- `packages/engine/src/agents/mcts/config.ts` (modify)
- `packages/engine/src/agents/mcts/rollout.ts` (modify)
- `packages/engine/src/agents/mcts/search.ts` (modify)
- `packages/engine/src/agents/mcts/index.ts` (modify)
- `packages/engine/test/unit/agents/mcts/mast.test.ts` (new)
- `packages/engine/test/unit/agents/mcts/config.test.ts` (modify)

## Out of Scope

- State-info cache — that is 63MCTSPERROLLFRESEA-004.
- Forced-sequence compression — that is 63MCTSPERROLLFRESEA-005.
- Confidence-based root stopping — that is 63MCTSPERROLLFRESEA-006.
- Cross-search MAST persistence (stats are local to one `runSearch()` call).
- Per-player keying (spec explicitly uses per-move keying with per-player reward arrays).
- MAST usage in `legacy` mode (legacy preserves current behavior).
- Re-tuning `rolloutEpsilon` or other numeric parameters.

## Acceptance Criteria

### Tests That Must Pass

1. **mast.test.ts**: `createMastStats()` initializes empty entries and `totalUpdates = 0`.
2. **mast.test.ts**: `updateMastStats()` correctly accumulates per-player rewards across multiple move keys.
3. **mast.test.ts**: `mastSelectMove()` falls back to random selection when `totalUpdates < warmUpThreshold`.
4. **mast.test.ts**: `mastSelectMove()` selects the highest-mean-reward candidate for the current player with probability `1 - epsilon` after warm-up.
5. **mast.test.ts**: `mastSelectMove()` falls back to random for unseen move keys.
6. **mast.test.ts**: MAST selection does not call `applyMove()` or `evaluateState()` (verified by the test not providing those functions / no kernel dependency in the MAST module).
7. **mast.test.ts**: MAST updates are deterministic (same sequence of updates = same entries).
8. **config.test.ts**: `'mast'` is a valid `rolloutPolicy` value.
9. **config.test.ts**: Named presets use `rolloutPolicy: 'mast'`.
10. **config.test.ts**: `mastWarmUpThreshold` defaults to `32`.
11. Existing suite: `pnpm -F @ludoforge/engine test` — all existing tests pass.

### Invariants

1. Determinism: MAST stats are local to `runSearch()`, updated in deterministic iteration order, and produce deterministic playout decisions.
2. MAST selection is a pure function of `MastStats` + RNG — no kernel calls during candidate evaluation.
3. `legacy` mode behavior is completely unchanged by this ticket.
4. The `mast.ts` module has no dependencies on kernel modules (`applyMove`, `evaluateState`, etc.).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/mast.test.ts` — new: unit tests for all MAST functions.
2. `packages/engine/test/unit/agents/mcts/config.test.ts` — modified: validation and preset tests for `'mast'` policy and `mastWarmUpThreshold`.

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/unit/agents/mcts/mast.test.js`
2. `pnpm turbo build && pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck && pnpm turbo lint`
