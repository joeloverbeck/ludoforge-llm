# 64MCTSPEROPT-010: Direct-Mode Evaluation Signal Tuning

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — MCTS config defaults, diagnostics
**Deps**: 64MCTSPEROPT-001, 64MCTSPEROPT-009

## Problem

Once heuristic (direct) evaluation becomes the default for expensive games, `heuristicTemperature`, `heuristicBackupAlpha`, `minIterations`, and root-stop thresholds become critical. The spec (section 3.12) notes the previous draft ignored this. If rewards are crushed toward 0.5, search quality degrades even with correct expansion. These settings must be profile-specific.

## Assumption Reassessment (2026-03-17)

1. `heuristicTemperature: 10_000` in `DEFAULT_MCTS_CONFIG` — **confirmed**, this was tuned for rollout mode.
2. `heuristicBackupAlpha` defaults to undefined (0 = pure MC) — **confirmed**.
3. `rootStopConfidenceDelta: 1e-3` and `rootStopMinVisits: 16` — **confirmed**.
4. `evaluate.ts` contains `evaluateForAllPlayers()` which uses sigmoid transform with temperature.

## Architecture Check

1. Tuning is profile-specific, not global — different budgets need different settings.
2. Diagnostics for raw-score spread inform tuning decisions.
3. No game-specific logic — temperature and alpha are universal parameters.

## What to Change

### 1. Add raw-score spread diagnostics

In `diagnostics.ts`, add fields to track:
- `rawHeuristicScoreMin`, `rawHeuristicScoreMax`, `rawHeuristicScoreSpread`
- `postSigmoidRewardMin`, `postSigmoidRewardMax`, `postSigmoidRewardSpread`

### 2. Instrument `evaluateForAllPlayers()`

Capture raw evaluation scores before sigmoid and post-sigmoid rewards for diagnostics.

### 3. Retune temperature for direct mode

Lower `heuristicTemperature` for profiles that use heuristic leaf evaluation. The current 10,000 was tuned for hybrid/rollout mode where it modulated backup blending. For pure direct mode, a lower temperature (e.g., 1,000-5,000) may spread rewards more effectively.

### 4. Set profile-specific root-stop thresholds

- `interactive`: lower `minIterations` (e.g., 8), lower `rootStopMinVisits` (e.g., 4)
- `turn`: moderate `minIterations` (e.g., 64)
- `background`: higher `minIterations` (e.g., 128)
- `analysis`: highest settings

### 5. Set profile-specific `heuristicBackupAlpha`

For profiles with small iteration budgets, a non-zero `heuristicBackupAlpha` (e.g., 0.3-0.5) helps by blending heuristic signal with sparse MC estimates.

## Files to Touch

- `packages/engine/src/agents/mcts/diagnostics.ts` (modify — raw score spread fields)
- `packages/engine/src/agents/mcts/evaluate.ts` (modify — instrument score capture)
- `packages/engine/src/agents/mcts/config.ts` (modify — update profile defaults)

## Out of Scope

- Family widening (tickets 007/008)
- Lazy expansion (ticket 004)
- Classification changes (tickets 002/003)
- Parallel search (Phase 6)

## Acceptance Criteria

### Tests That Must Pass

1. Diagnostics include `rawHeuristicScoreSpread` when `diagnostics: true`.
2. `interactive` profile has lower `minIterations` and `rootStopMinVisits` than `turn`.
3. `background` profile has `heuristicBackupAlpha` set.
4. Post-sigmoid rewards are not all crushed to ~0.5 for a game with meaningful score differences.
5. `pnpm -F @ludoforge/engine test` — full suite passes.
6. `pnpm turbo typecheck` passes.

### Invariants

1. Temperature changes are profile-specific, not global defaults.
2. `evaluateForAllPlayers()` return values unchanged — diagnostics are side-channel only.
3. No game-specific tuning — parameters remain generic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/evaluation-diagnostics.test.ts` (new) — raw score spread capture.
2. `packages/engine/test/unit/agents/mcts/budget-profiles.test.ts` — verify profile-specific tuning values.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-18
- **What changed**:
  - `diagnostics.ts`: Added `rawHeuristicScoreMin/Max`, `postSigmoidRewardMin/Max`, `heuristicEvalSamples` to accumulator; spread fields to `MctsSearchDiagnostics`; `recordHeuristicEvalSpread()` helper; spread derivation in `collectDiagnostics()`.
  - `evaluate.ts`: Added `EvalDiagnosticsOut` interface and optional `diagnosticsOut` parameter to `evaluateForAllPlayers()` (return type unchanged).
  - `state-cache.ts`: `getOrComputeRewards()` captures raw scores and records to accumulator.
  - `search.ts`: All 3 `evaluateForAllPlayers` call sites instrumented with diagnostics capture.
  - `config.ts`: `interactive` — `minIterations` 16→8, `heuristicTemperature: 2_000`, `heuristicBackupAlpha: 0.3`; `turn` — `heuristicTemperature: 3_000`; `background` — `heuristicTemperature: 5_000`.
  - `index.ts`: Exported new `EvalDiagnosticsOut` type and `recordHeuristicEvalSpread`.
  - New test: `evaluation-diagnostics.test.ts` (9 tests).
  - Updated test: `budget-profiles.test.ts` (new assertions for tuned values, profile comparison, allowed-keys invariant).
- **Deviations**: `analysis` profile kept default temperature (10_000) since it uses `leafEvaluator: auto` (may use rollout). `interactive.rootStopMinVisits` was already 4 from prior work.
- **Verification**: `pnpm turbo build` ✅, `pnpm turbo typecheck` ✅, `pnpm -F @ludoforge/engine test` ✅ (5122 tests, 0 failures).
