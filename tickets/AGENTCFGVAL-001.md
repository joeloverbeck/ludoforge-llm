# AGENTCFGVAL-001: Validate GreedyAgent completion sampling config

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `agents` validation + tests
**Deps**: EVEINTCHOPRO-005

## Problem

`GreedyAgent` currently validates `maxMovesToEvaluate` but does not validate `completionsPerTemplate`. Invalid values (`0`, negative, non-integer) can silently suppress pending-template expansion and produce avoidable runtime failures (`no playable moves after template completion`), reducing robustness and making failures configuration-dependent instead of explicit.

## Assumption Reassessment (2026-02-24)

1. `GreedyAgent` constructor enforces positive-safe-integer rules for `maxMovesToEvaluate` but not for `completionsPerTemplate` (`packages/engine/src/agents/greedy-agent.ts`).
2. Pending decision templates use `attempts = this.completionsPerTemplate`; invalid attempts can skip completion loops entirely and drop legal template moves.
3. Existing tests focus on move-choice behavior and event-template completion but do not assert constructor rejection for invalid `completionsPerTemplate` values.

## Architecture Check

1. Failing fast at constructor time is cleaner than allowing misconfiguration to cascade into gameplay/runtime errors.
2. This change is fully game-agnostic and does not add any game-specific logic to `GameDef`, simulation, or kernel.
3. No backwards-compatibility shims are introduced; invalid configs become explicit errors.

## What to Change

### 1. Enforce constructor contract for `completionsPerTemplate`

Add the same style of validation used for `maxMovesToEvaluate`:
- Must be a positive safe integer when provided.
- Throw `RangeError` with a precise message when invalid.

### 2. Add targeted unit coverage for invalid and valid boundary values

Add/extend `GreedyAgent` unit tests to assert:
- rejection of `0`, negative, non-integer, and unsafe integer values.
- acceptance of `1` and other valid positive-safe integers.

## Files to Touch

- `packages/engine/src/agents/greedy-agent.ts` (modify)
- `packages/engine/test/unit/agents/greedy-agent.test.ts` (modify)

## Out of Scope

- Strategy/scoring changes in `GreedyAgent`.
- RandomAgent behavior changes.
- Event choice protocol semantics (already covered by EVEINTCHOPRO tickets).

## Acceptance Criteria

### Tests That Must Pass

1. `GreedyAgent` throws on invalid `completionsPerTemplate` values (`0`, negative, non-integer, unsafe integer).
2. `GreedyAgent` accepts valid `completionsPerTemplate` values and existing behavior remains unchanged for valid configs.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Agents remain deterministic for same seed + same valid config.
2. No game-specific branching is introduced in agent logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/greedy-agent.test.ts` — add constructor contract tests for config validation.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/agents/greedy-agent.test.js`
3. `pnpm -F @ludoforge/engine test`

