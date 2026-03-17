# 64MCTSPEROPT-001: LeafEvaluator Strategy Type and Config Migration

**Status**: DONE
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — MCTS config types, validation, preset migration
**Deps**: None (Phase 2 foundational)

## Problem

The current MCTS config uses a top-level `rolloutMode: 'legacy' | 'hybrid' | 'direct'` switch with scattered rollout-specific fields (`rolloutPolicy`, `rolloutEpsilon`, `rolloutCandidateSample`, `hybridCutoffDepth`, `mastWarmUpThreshold`, `templateCompletionsPerVisit`). This makes the config surface large and confusing — rollout-only knobs are visible even in direct mode. The spec (section 3.1) requires replacing this with a `LeafEvaluator` discriminated union.

## Assumption Reassessment (2026-03-17)

1. `MctsConfig` interface in `config.ts` has `rolloutMode`, `rolloutPolicy`, `rolloutEpsilon`, `rolloutCandidateSample`, `hybridCutoffDepth`, `mastWarmUpThreshold`, `templateCompletionsPerVisit` as top-level fields — **confirmed**.
2. `MctsRolloutMode` is exported and used by `diagnostics.ts` (`rolloutMode` in `MctsSearchDiagnostics`) — **must preserve or migrate**.
3. All four presets (`fast`, `default`, `strong`, `background`) set `rolloutMode: 'direct'` — **confirmed**.
4. `DEFAULT_MCTS_CONFIG` uses `rolloutMode: 'hybrid'` — **confirmed**, this is the inconsistency the spec notes.
5. `rollout.ts` and `mast.ts` exist and consume rollout-specific config — must keep working.

## Architecture Check

1. Moving rollout-specific fields under `leafEvaluator: { type: 'rollout', ... }` reduces config surface and makes it self-documenting. Direct/heuristic mode callers never see rollout knobs.
2. This is game-agnostic — no game-specific logic. Cheap games can still use rollout evaluation.
3. No backwards-compatibility shims: old `rolloutMode` field is removed; callers use `leafEvaluator` directly.

## What to Change

### 1. Add `LeafEvaluator` discriminated union type to `config.ts`

```typescript
type LeafEvaluator =
  | { type: 'heuristic' }
  | {
      type: 'rollout'
      maxSimulationDepth: number
      policy: 'random' | 'epsilonGreedy' | 'mast'
      epsilon?: number
      candidateSample?: number
      mastWarmUpThreshold?: number
      templateCompletionsPerVisit?: number
    }
  | { type: 'auto' }
```

### 2. Add `leafEvaluator` to `MctsConfig`, remove old rollout fields

Remove: `rolloutMode`, `rolloutPolicy`, `rolloutEpsilon`, `rolloutCandidateSample`, `hybridCutoffDepth`, `mastWarmUpThreshold`, `templateCompletionsPerVisit`.
Add: `leafEvaluator?: LeafEvaluator` (defaults to `{ type: 'heuristic' }` in `DEFAULT_MCTS_CONFIG`).
Keep: `maxSimulationDepth` remains top-level as a general depth cap (spec section 5 note).

### 3. Update `validateMctsConfig` to validate `LeafEvaluator`

Validate rollout-specific fields only when `leafEvaluator.type === 'rollout'`.

### 4. Update `DEFAULT_MCTS_CONFIG`

Default `leafEvaluator` to `{ type: 'heuristic' }` (matching what all presets already do via `rolloutMode: 'direct'`).

### 5. Update presets (`MCTS_PRESETS`)

All presets already use direct mode; change them to use `leafEvaluator: { type: 'heuristic' }`.

### 6. Update `rollout.ts` to read from `LeafEvaluator` config

The rollout module should accept a `LeafEvaluator & { type: 'rollout' }` config object instead of individual top-level fields.

### 7. Update `search.ts` to dispatch on `leafEvaluator.type`

Replace `if (config.rolloutMode === 'direct')` branches with `leafEvaluator.type` dispatch.

### 8. Update `diagnostics.ts`

`MctsSearchDiagnostics.rolloutMode` → `leafEvaluatorType?: 'heuristic' | 'rollout' | 'auto'`.

## Files to Touch

- `packages/engine/src/agents/mcts/config.ts` (modify — types, defaults, validation, presets)
- `packages/engine/src/agents/mcts/search.ts` (modify — dispatch on leafEvaluator)
- `packages/engine/src/agents/mcts/rollout.ts` (modify — read rollout config from LeafEvaluator)
- `packages/engine/src/agents/mcts/diagnostics.ts` (modify — rename rolloutMode field)
- `packages/engine/src/agents/mcts/mcts-agent.ts` (modify — if it references rolloutMode)
- `packages/engine/src/agents/mcts/mast.ts` (modify — if it reads config fields directly)

## Out of Scope

- Budget profile names (ticket 64MCTSPEROPT-009)
- Adding `classificationPolicy`, `wideningMode`, `fallbackPolicy` fields (later tickets)
- Any changes to `state-cache.ts` or `materialization.ts`
- Incremental per-move classification (ticket 64MCTSPEROPT-002)
- Deleting rollout or MAST functionality

## Acceptance Criteria

### Tests That Must Pass

1. All existing MCTS unit tests pass with updated config.
2. All existing MCTS e2e tests (Texas Hold'em, FITL) pass — `pnpm -F @ludoforge/engine test:e2e`.
3. `validateMctsConfig({ leafEvaluator: { type: 'rollout', maxSimulationDepth: 48, policy: 'mast' } })` produces a valid config.
4. `validateMctsConfig({})` defaults to `leafEvaluator: { type: 'heuristic' }`.
5. Rollout-specific validation only fires when `type === 'rollout'`.
6. `pnpm turbo typecheck` passes with no errors.

### Invariants

1. `rollout.ts` and `mast.ts` remain functional — not deleted.
2. `maxSimulationDepth` stays top-level.
3. `progressiveWideningK`, `progressiveWideningAlpha`, `solverMode`, `compressForcedSequences` are untouched.
4. No game-specific logic introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/mcts-agent.test.ts` — update config construction to use `leafEvaluator`.
2. New unit test for `validateMctsConfig` with `LeafEvaluator` variants (heuristic, rollout, auto, invalid).

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
