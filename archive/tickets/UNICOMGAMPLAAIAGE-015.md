# UNICOMGAMPLAAIAGE-015: Search Presets (fast / default / strong)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — new file in agents/mcts/, modify factory
**Deps**: UNICOMGAMPLAAIAGE-001, UNICOMGAMPLAAIAGE-011

## Problem

Users and the evolution pipeline need simple named presets to control agent strength without manually tuning `MctsConfig` fields. The spec calls for `fast`, `default`, and `strong` presets with different iteration budgets and parameters.

## Assumption Reassessment (2026-03-13)

1. `MctsConfig` and `DEFAULT_MCTS_CONFIG` from ticket 001 define all tunable parameters.
2. `validateMctsConfig` merges partials with defaults — presets are just named partials.
3. Agent spec parsing from ticket 011 supports `mcts:N` — presets add `mcts:fast`, `mcts:strong`.

## Architecture Check

1. Presets are named config partials — pure data, no logic.
2. Factory/spec parsing extended to recognize preset names.
3. No kernel changes.

## What to Change

### 1. Add presets to `packages/engine/src/agents/mcts/config.ts`

Define:
- `MctsPreset = 'fast' | 'default' | 'strong'`
- `MCTS_PRESETS: Record<MctsPreset, Partial<MctsConfig>>`

Suggested values:
- `fast`: `{ iterations: 200, maxSimulationDepth: 16, rolloutPolicy: 'random' }`
- `default`: `{}` (uses `DEFAULT_MCTS_CONFIG`)
- `strong`: `{ iterations: 5000, maxSimulationDepth: 64, templateCompletionsPerVisit: 4 }`

- `resolvePreset(preset: MctsPreset): MctsConfig` — `validateMctsConfig(MCTS_PRESETS[preset])`

### 2. Modify `packages/engine/src/agents/factory.ts`

Extend `parseAgentSpec` to support:
- `mcts:fast` → `MctsAgent` with fast preset
- `mcts:default` → `MctsAgent` with default preset
- `mcts:strong` → `MctsAgent` with strong preset
- `mcts:1500` → numeric iteration override (existing from ticket 011)
- `mcts` → default preset

Parsing logic: if the part after `:` is a recognized preset name, use preset; if numeric, use as iterations; otherwise throw.

### 3. Update `packages/engine/src/agents/mcts/index.ts`

Ensure preset types and functions are re-exported.

## Files to Touch

- `packages/engine/src/agents/mcts/config.ts` (modify — add presets)
- `packages/engine/src/agents/factory.ts` (modify — add preset parsing)
- `packages/engine/test/unit/agents/mcts/config.test.ts` (modify — add preset tests)
- `packages/engine/test/unit/agents/factory.test.ts` (modify — add preset spec parsing tests)

## Out of Scope

- MAST-style rollout bias / history tables — spec Phase 2 optional, not part of presets.
- Per-game tuning — presets are game-agnostic.
- Dynamic preset selection based on game complexity.
- Any kernel changes.

## Acceptance Criteria

### Tests That Must Pass

1. `resolvePreset('fast')` returns config with `iterations: 200`.
2. `resolvePreset('default')` returns `DEFAULT_MCTS_CONFIG`.
3. `resolvePreset('strong')` returns config with `iterations: 5000`.
4. All preset configs pass `validateMctsConfig` (no invalid values).
5. `parseAgentSpec('mcts:fast,random', 2)` returns `[MctsAgent(fast), RandomAgent]`.
6. `parseAgentSpec('mcts:strong,mcts:fast', 2)` returns two MctsAgents with different configs.
7. `parseAgentSpec('mcts:default,greedy', 2)` returns `[MctsAgent(default), GreedyAgent]`.
8. `parseAgentSpec('mcts:invalid', 1)` throws descriptive error.
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Presets are frozen/immutable — modifying `MCTS_PRESETS.fast` does not affect resolved configs.
2. All preset values satisfy `MctsConfig` validation constraints.
3. Preset resolution is deterministic and side-effect free.
4. Backwards compatible: `mcts` and `mcts:N` continue to work.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/config.test.ts` — preset resolution, all three presets valid, immutability.
2. `packages/engine/test/unit/agents/factory.test.ts` — preset spec parsing, error on invalid preset name.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/agents/mcts/config.test.ts`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/agents/factory.test.ts`
3. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-13
- What actually changed: Added generic named MCTS presets in `packages/engine/src/agents/mcts/config.ts`, re-exported preset helpers from `packages/engine/src/agents/mcts/index.ts`, and extended `parseAgentSpec` in `packages/engine/src/agents/factory.ts` to support `mcts:fast`, `mcts:default`, `mcts:strong`, while preserving bare `mcts` and numeric `mcts:N`.
- Deviations from original plan: The shipped presets also include explicit `timeLimitMs` values for each profile, and `default` resolves through a small preset partial instead of an empty object.
- Verification results: Unit coverage exists in `packages/engine/test/unit/agents/mcts/config.test.ts` and `packages/engine/test/unit/agents/factory.test.ts` for preset resolution, immutability, validation, and parsing behavior. A later 2026-03-14 follow-up also added Texas Hold'em MCTS e2e coverage and performance fixes without changing the ticket scope.
