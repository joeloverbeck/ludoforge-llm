# 63MCTSPERROLLFRESEA-002: Rollout modes (legacy / hybrid / direct) + SimulationResult type

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `agents/mcts/config.ts`, `agents/mcts/search.ts`, `agents/mcts/rollout.ts`
**Deps**: 63MCTSPERROLLFRESEA-001 (diagnostics accumulator must exist for counter wiring)

## Problem

The current MCTS always runs a full rollout (up to `maxSimulationDepth` plies). This is the primary bottleneck: `default` preset runs up to 48-ply epsilon-greedy rollouts with repeated candidate scoring at every ply. The spec requires three rollout modes so that the expensive full rollout can be replaced with a cheap shallow cutoff simulation (`hybrid`), while preserving the original behavior (`legacy`) for regression testing.

## Assumption Reassessment (2026-03-14)

1. `RolloutResult` in `rollout.ts` currently has `{ state, terminal, rng, depth }` — needs extension with `traversedMoveKeys` and rename to `SimulationResult`.
2. `rollout()` function is called from `runOneIteration()` in `search.ts` — confirmed.
3. `MctsConfig` does not yet have `rolloutMode`, `hybridCutoffDepth`, or related fields — confirmed.
4. Named presets in `MCTS_PRESETS` currently only override a subset of config fields — confirmed.
5. `rolloutPolicy` type is `'random' | 'epsilonGreedy'` — needs extension with `'mast'` but that is ticket 003.

## Architecture Check

1. Three-mode dispatch in `runOneIteration()` is cleaner than conditional flags scattered throughout rollout logic. A single `switch` on `rolloutMode` keeps the code paths isolated.
2. `SimulationResult` unifies the output type across all three modes, enabling uniform downstream handling (evaluation, backpropagation, MAST update).
3. No game-specific logic — purely structural refactor of search iteration.

## What to Change

### 1. Add `MctsRolloutMode` type and new config fields in `config.ts`

```ts
export type MctsRolloutMode = 'legacy' | 'hybrid' | 'direct';
```

New optional fields on `MctsConfig`:
- `rolloutMode?: MctsRolloutMode` (default: `'hybrid'`)
- `hybridCutoffDepth?: number` (default: dependent on preset)

Update `DEFAULT_MCTS_CONFIG` to include `rolloutMode: 'hybrid'` and `hybridCutoffDepth: 6`.

Update `MCTS_PRESETS`:
- `fast`: `rolloutMode: 'hybrid'`, `hybridCutoffDepth: 4`
- `default`: `rolloutMode: 'hybrid'`, `hybridCutoffDepth: 6`
- `strong`: `rolloutMode: 'hybrid'`, `hybridCutoffDepth: 8`

Add validation for the new fields in `validateMctsConfig()`.

### 2. Rename `RolloutResult` to `SimulationResult` in `rollout.ts`

Extend with `traversedMoveKeys: readonly string[]`. Keep `depth` as optional diagnostic. Update all references.

### 3. Add `simulateToCutoff()` function in `rollout.ts`

Implements the hybrid cutoff simulation:
- Runs up to `hybridCutoffDepth` plies.
- Uses the configured `rolloutPolicy` for move selection (initially `random` or `epsilonGreedy`; `mast` wiring comes in ticket 003).
- Stops at terminal states or no-move states.
- Collects `traversedMoveKeys`.
- Threads RNG correctly (no fork-based compensation).

### 4. Refactor `runOneIteration()` in `search.ts`

Add a `switch (config.rolloutMode)` dispatch:
- `'legacy'`: calls existing `rollout()` (wrapped to produce `SimulationResult`).
- `'hybrid'`: calls `simulateToCutoff()`.
- `'direct'`: produces `SimulationResult` with no simulation (leaf state is the expansion state; `terminal` from raw `terminalResult()`).

Wire simulation timing and counter increments via the diagnostics accumulator from ticket 001.

### 5. Update preset tests in `config.test.ts`

Verify that `resolvePreset()` populates `rolloutMode` and `hybridCutoffDepth` correctly for all named presets.

## Files to Touch

- `packages/engine/src/agents/mcts/config.ts` (modify)
- `packages/engine/src/agents/mcts/search.ts` (modify)
- `packages/engine/src/agents/mcts/rollout.ts` (modify)
- `packages/engine/src/agents/mcts/index.ts` (modify — re-export new types)
- `packages/engine/test/unit/agents/mcts/search.test.ts` (modify)
- `packages/engine/test/unit/agents/mcts/config.test.ts` (modify)
- `packages/engine/test/unit/agents/mcts/rollout.test.ts` (modify)
- `packages/engine/test/unit/agents/mcts/hybrid-search.test.ts` (new)

## Out of Scope

- MAST rollout policy implementation — that is 63MCTSPERROLLFRESEA-003.
- State-info cache — that is 63MCTSPERROLLFRESEA-004.
- Forced-sequence compression — that is 63MCTSPERROLLFRESEA-005.
- Confidence-based root stopping — that is 63MCTSPERROLLFRESEA-006.
- Changing the `direct` mode to use cached `terminalResult()` (uses raw call; cached version comes with ticket 004).
- Re-tuning `explorationConstant`, `progressiveWideningK`, `progressiveWideningAlpha`, or `heuristicTemperature`.
- Removing or deprecating `rollout.ts`.
- Modifying E2E tests — that is 63MCTSPERROLLFRESEA-007.

## Acceptance Criteria

### Tests That Must Pass

1. **hybrid-search.test.ts**: `hybrid` mode caps simulation at `hybridCutoffDepth` plies (verify `SimulationResult.traversedMoveKeys.length <= hybridCutoffDepth`).
2. **hybrid-search.test.ts**: `hybrid` mode stops simulation at terminal states before cutoff depth.
3. **hybrid-search.test.ts**: `legacy` mode produces identical search results to the pre-refactor code for the same seed and config.
4. **hybrid-search.test.ts**: `direct` mode runs zero simulation plies (`traversedMoveKeys` is empty).
5. **hybrid-search.test.ts**: Determinism: same seed + same `rolloutMode` + same config = same move selection.
6. **config.test.ts**: `resolvePreset('fast')` returns `rolloutMode: 'hybrid'`, `hybridCutoffDepth: 4`.
7. **config.test.ts**: `resolvePreset('default')` returns `rolloutMode: 'hybrid'`, `hybridCutoffDepth: 6`.
8. **config.test.ts**: `resolvePreset('strong')` returns `rolloutMode: 'hybrid'`, `hybridCutoffDepth: 8`.
9. **config.test.ts**: `validateMctsConfig()` rejects invalid `rolloutMode` values.
10. **rollout.test.ts**: `SimulationResult` type has `traversedMoveKeys` field.
11. Existing suite: `pnpm -F @ludoforge/engine test` — all existing tests pass.

### Invariants

1. Determinism within each mode: same seed + same mode + same config = same result.
2. `legacy` mode must produce bit-identical results to the pre-refactor code path.
3. `RolloutResult` is fully replaced by `SimulationResult` — no parallel type exists.
4. No named preset uses `direct` mode.
5. `runOneIteration()` signature changes are backward-compatible (new parameters have defaults or are optional).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/hybrid-search.test.ts` — new: tests all three modes end-to-end with small iteration counts.
2. `packages/engine/test/unit/agents/mcts/config.test.ts` — modified: preset resolution tests for new fields.
3. `packages/engine/test/unit/agents/mcts/rollout.test.ts` — modified: `SimulationResult` type tests, `simulateToCutoff` unit tests.
4. `packages/engine/test/unit/agents/mcts/search.test.ts` — modified: existing tests still pass after `runOneIteration()` refactor.

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/unit/agents/mcts/hybrid-search.test.js`
2. `pnpm turbo build && pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-14
- **What changed**:
  - `config.ts`: Added `MctsRolloutMode` type (`'legacy' | 'hybrid' | 'direct'`), `rolloutMode` and `hybridCutoffDepth` fields to `MctsConfig`, updated `DEFAULT_MCTS_CONFIG` (hybrid/6), updated all 3 presets (fast: 4, default: 6, strong: 8), added validation.
  - `rollout.ts`: Renamed `RolloutResult` → `SimulationResult` with `traversedMoveKeys` field. Extracted shared `pickMove()` helper (DRY). Added `simulateToCutoff()` for hybrid cutoff simulation.
  - `search.ts`: Added `switch (config.rolloutMode)` dispatch in `runOneIteration()` for legacy/hybrid/direct modes. Wired `rolloutMode` into diagnostics output.
  - `index.ts`: Updated re-exports (`SimulationResult` replaces `RolloutResult`, added `MctsRolloutMode`, `simulateToCutoff`).
  - `config.test.ts`: Added preset assertions for new fields, validation tests for invalid `rolloutMode`/`hybridCutoffDepth`.
  - `rollout.test.ts`: Added `traversedMoveKeys` assertions, `simulateToCutoff` test suite (3 tests).
  - `hybrid-search.test.ts` (new): 11 tests covering all 3 modes end-to-end, determinism, diagnostics wiring, invariant that no preset uses `direct`.
- **Deviations**: Extracted `pickMove()` helper in `rollout.ts` to avoid duplicating the move selection logic between `rollout()` and `simulateToCutoff()` (DRY improvement not in original ticket).
- **Verification**: Typecheck clean, lint clean, 4337 engine unit tests pass (0 failures).
