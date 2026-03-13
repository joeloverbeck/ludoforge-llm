# UNICOMGAMPLAAIAGE-001: MCTS Config Types, Defaults, and Validation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — new file in agents/mcts/
**Deps**: None (leaf ticket)

## Problem

The MCTS agent requires a well-defined configuration type (`MctsConfig`) with sensible defaults and runtime validation. All subsequent MCTS tickets depend on this config being available.

## Assumption Reassessment (2026-03-13)

1. `MctsConfig` interface does not yet exist — confirmed, no `mcts/` directory under `agents/`.
2. Existing agents (`RandomAgent`, `GreedyAgent`) use inline config or constructor params — confirmed from `greedy-agent.ts`.
3. The spec defines exact fields and defaults (Spec 61 §MCTS Configuration) — verified.

## Architecture Check

1. Isolated in its own file (`config.ts`) with no coupling to search logic — clean separation.
2. No game-specific logic; config is purely agent-internal tuning parameters.
3. No backwards-compatibility concerns — entirely new code.

## What to Change

### 1. Create `packages/engine/src/agents/mcts/config.ts`

Define:
- `MctsConfig` interface with all fields from Spec 61 §MCTS Configuration:
  - `iterations` (number, hard iteration cap)
  - `minIterations` (number, minimum before wall-clock early stop)
  - `timeLimitMs` (number | undefined, optional wall-clock budget)
  - `explorationConstant` (number)
  - `maxSimulationDepth` (number)
  - `progressiveWideningK` (number)
  - `progressiveWideningAlpha` (number)
  - `templateCompletionsPerVisit` (number)
  - `rolloutPolicy` ('random' | 'epsilonGreedy')
  - `rolloutEpsilon` (number)
  - `rolloutCandidateSample` (number)
  - `heuristicTemperature` (number)
  - `solverMode` ('off' | 'perfectInfoDeterministic2P')
  - `diagnostics` (boolean | undefined)
- `DEFAULT_MCTS_CONFIG` constant matching spec defaults.
- `validateMctsConfig(partial: Partial<MctsConfig>): MctsConfig` — merges with defaults, validates ranges (iterations >= 1, explorationConstant > 0, etc.), throws descriptive errors on invalid input.

### 2. Create `packages/engine/src/agents/mcts/index.ts`

Barrel export for the mcts module. Initially re-exports only `config.ts`.

## Files to Touch

- `packages/engine/src/agents/mcts/config.ts` (new)
- `packages/engine/src/agents/mcts/index.ts` (new)
- `packages/engine/test/unit/agents/mcts/config.test.ts` (new)

## Out of Scope

- Node structure, search loop, selection, expansion, rollout — all later tickets.
- Agent factory update — ticket 011.
- Any kernel changes.

## Acceptance Criteria

### Tests That Must Pass

1. `DEFAULT_MCTS_CONFIG` has all required fields with spec-defined values.
2. `validateMctsConfig({})` returns `DEFAULT_MCTS_CONFIG` unchanged.
3. `validateMctsConfig({ iterations: 500 })` overrides only `iterations`.
4. `validateMctsConfig({ iterations: 0 })` throws a descriptive RangeError.
5. `validateMctsConfig({ iterations: -1 })` throws.
6. `validateMctsConfig({ explorationConstant: 0 })` throws.
7. `validateMctsConfig({ rolloutPolicy: 'invalid' as any })` throws.
8. `validateMctsConfig({ solverMode: 'invalid' as any })` throws.
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `MctsConfig` is a plain readonly interface — no classes, no side effects.
2. `DEFAULT_MCTS_CONFIG` is frozen (or effectively immutable via readonly).
3. No imports from kernel internals beyond type-only imports from `types.js` if needed.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/config.test.ts` — validates defaults, partial override merging, range validation, invalid field rejection.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/agents/mcts/config.test.ts`
2. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-13
- **What changed**:
  - Created `packages/engine/src/agents/mcts/config.ts` — `MctsConfig` interface (14 fields), `DEFAULT_MCTS_CONFIG` (frozen), `validateMctsConfig()` with range/type validation
  - Created `packages/engine/src/agents/mcts/index.ts` — barrel export
  - Created `packages/engine/test/unit/agents/mcts/config.test.ts` — 17 tests covering all acceptance criteria
- **Deviations**: None. Implementation matches ticket and Spec 61 §MCTS Configuration exactly.
- **Verification**: 17/17 new tests pass, 4208/4208 full engine suite pass, 0 lint errors, typecheck clean across all 3 packages.
