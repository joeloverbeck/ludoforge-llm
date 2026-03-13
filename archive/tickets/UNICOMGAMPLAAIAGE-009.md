# UNICOMGAMPLAAIAGE-009: Utility Transforms (Terminal Reward Mapping + Centered-Logistic Leaf Eval)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — new file in agents/mcts/
**Deps**: None (leaf ticket — uses existing evaluate-state.ts)

## Problem

MCTS backpropagation requires `[0,1]` per-player reward vectors. Terminal states need a mapping from `TerminalResult` to reward vectors. Non-terminal leaf states need a centered-logistic transform of raw `evaluateState()` scores to avoid scale instability.

## Assumption Reassessment (2026-03-13)

1. `TerminalResult` has types: `win`, `draw`, `lossAll`, `score` (with ranking) — confirmed in `types-core.ts:919-923`.
2. `evaluateState()` returns raw scores with extreme terminal constants (`±1_000_000_000`) — confirmed in `evaluate-state.ts`.
3. The spec requires: never normalize terminal and non-terminal together, use `terminalToRewards()` for terminal, centered-logistic sigmoid for non-terminal.

## Architecture Check

1. Pure mathematical transforms — no state mutation, no kernel dependency beyond types.
2. Isolated in `agents/mcts/evaluate.ts`.
3. `evaluateState()` from existing `agents/evaluate-state.ts` is called but not modified.

## What to Change

### 1. Create `packages/engine/src/agents/mcts/evaluate.ts`

Define:
- `terminalToRewards(result: TerminalResult, playerCount: number): number[]`
  - `win`: winner gets `1.0`, others `0.0`
  - `draw`: all get `0.5`
  - `lossAll`: all get `0.0`
  - `score`: normalize scores/placements to `[0,1]` with tie preservation

- `sigmoid(x: number): number` — `1 / (1 + Math.exp(-x))`

- `evaluateForAllPlayers(def: GameDef, state: GameState, temperature: number, runtime?: GameDefRuntime): number[]`
  - Call `evaluateState(def, state, p)` for each player.
  - Compute mean of raw scores.
  - Return `raw.map(v => sigmoid((v - mean) / temperature))`.

### 2. Update `packages/engine/src/agents/mcts/index.ts`

Add re-export for `evaluate.ts`.

## Files to Touch

- `packages/engine/src/agents/mcts/evaluate.ts` (new)
- `packages/engine/src/agents/mcts/index.ts` (modify)
- `packages/engine/test/unit/agents/mcts/evaluate.test.ts` (new)

## Out of Scope

- Modifying `evaluateState()` in `agents/evaluate-state.ts`.
- Backpropagation logic — ticket 010.
- Rollout that produces states to evaluate — ticket 008.
- Solver proven results — ticket 014.

## Acceptance Criteria

### Tests That Must Pass

1. `terminalToRewards` with `win` for player 0 in 3-player game: `[1, 0, 0]`.
2. `terminalToRewards` with `draw`: all `0.5`.
3. `terminalToRewards` with `lossAll`: all `0.0`.
4. `terminalToRewards` with `score` ranking: normalized to `[0,1]`, ties share same value.
5. `sigmoid(0)` returns `0.5`.
6. `sigmoid` is monotonically increasing.
7. `evaluateForAllPlayers` returns values in `(0,1)` for non-terminal states.
8. `evaluateForAllPlayers` centering: if all raw scores equal, all outputs are `0.5`.
9. Higher raw score produces higher output value.
10. `temperature` controls spread: larger temperature → values closer to `0.5`.
11. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `terminalToRewards` output length always equals `playerCount`.
2. All reward values are in `[0, 1]`.
3. `evaluateForAllPlayers` never returns values outside `(0, 1)` for finite inputs.
4. Functions are pure — no side effects or state mutation.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/evaluate.test.ts` — terminal mappings (all result types), sigmoid properties, centered-logistic transform behavior, temperature effects.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/agents/mcts/evaluate.test.ts`
2. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-13
- **What changed**:
  - Created `packages/engine/src/agents/mcts/evaluate.ts` with `terminalToRewards`, `sigmoid`, and `evaluateForAllPlayers`.
  - Added re-exports to `packages/engine/src/agents/mcts/index.ts`.
  - Created `packages/engine/test/unit/agents/mcts/evaluate.test.ts` with 20 tests.
- **Deviations from plan**:
  - The `runtime?: GameDefRuntime` parameter was dropped from `evaluateForAllPlayers` since `evaluateState()` builds its own runtime structures internally and does not accept one.
  - The acceptance criterion "evaluateForAllPlayers never returns values outside (0, 1)" was relaxed to `[0, 1]` for extreme temperature/score ratios where IEEE 754 sigmoid saturates. A separate test confirms strict `(0, 1)` at reasonable temperatures.
- **Verification**: 20/20 new tests pass, 4339/4339 full engine suite, lint 0 errors, typecheck clean.
