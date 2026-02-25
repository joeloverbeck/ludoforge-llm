# AGENTCFGVAL-001: Validate GreedyAgent completion sampling config

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `agents` validation + tests
**Deps**: EVEINTCHOPRO-005

## Problem

`GreedyAgent` validates `maxMovesToEvaluate` but does not validate `completionsPerTemplate`. Invalid values (`0`, negative, non-integer, unsafe integer) can suppress pending-template expansion and shift failures to runtime (`no playable moves after template completion`) instead of surfacing a clear constructor error.

## Assumption Reassessment (2026-02-25)

1. `GreedyAgent` constructor currently enforces positive-safe-integer rules for `maxMovesToEvaluate` but not for `completionsPerTemplate` (`packages/engine/src/agents/greedy-agent.ts`).
2. `GreedyAgent.chooseMove()` uses `attempts = this.completionsPerTemplate` whenever `legalChoicesEvaluate(...).kind === 'pending'`; invalid attempts can skip completion loops and incorrectly drop playable template/event moves.
3. The event-template protocol from `specs/50-event-interactive-choice-protocol.md` is already active in engine code/tests (`legal-moves` emits base event moves, agents complete template/event decisions, FITL integration tests assert this).
4. Existing unit tests in `packages/engine/test/unit/agents/greedy-agent-core.test.ts` validate `maxMovesToEvaluate` rejection, but do not yet assert constructor rejection/acceptance boundaries for `completionsPerTemplate`.
5. Previous ticket file references were stale: `packages/engine/test/unit/agents/greedy-agent.test.ts` does not exist; the active test file is `packages/engine/test/unit/agents/greedy-agent-core.test.ts`.

## Architecture Check

1. Constructor-time fail-fast validation is cleaner and more robust than allowing latent misconfiguration to surface as gameplay/runtime errors.
2. The change remains game-agnostic and aligned with the engine architecture (no game-specific branches, no schema or protocol forks).
3. No backwards-compatibility aliasing/shims: invalid configs become explicit errors and must be fixed at call sites.
4. Scope remains intentionally narrow: validate config contract where the value is introduced (constructor) rather than adding defensive checks downstream.

## What to Change

### 1. Enforce constructor contract for `completionsPerTemplate`

In `GreedyAgent` constructor:
- `completionsPerTemplate` must be a positive safe integer when provided.
- Throw `RangeError` with a precise message when invalid.

### 2. Add targeted unit coverage for invalid and valid boundary values

In `greedy-agent-core` unit tests, assert:
- rejection of `0`, negative, non-integer, and unsafe integer values.
- acceptance of `1` and other valid positive-safe integers.

## Files to Touch

- `packages/engine/src/agents/greedy-agent.ts` (modify)
- `packages/engine/test/unit/agents/greedy-agent-core.test.ts` (modify)

## Out of Scope

- Event protocol mechanics (`legalMoves`, event satisfiability gating, decision-sequence architecture).
- Strategy/scoring changes in `GreedyAgent`.
- `RandomAgent` behavior changes.
- Browser runner choice UX wiring.

## Acceptance Criteria

### Tests That Must Pass

1. `GreedyAgent` throws on invalid `completionsPerTemplate` values (`0`, negative, non-integer, unsafe integer).
2. `GreedyAgent` accepts valid `completionsPerTemplate` values and existing behavior remains unchanged for valid configs.
3. Existing suite: `pnpm -F @ludoforge/engine test`.
4. Engine lint: `pnpm -F @ludoforge/engine lint`.

### Invariants

1. Agents remain deterministic for same seed + same valid config.
2. No game-specific branching is introduced in agent logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/greedy-agent-core.test.ts` — add constructor contract tests for `completionsPerTemplate` validation and valid boundary acceptance.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/agents/greedy-agent-core.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-25
- **What changed**:
  - Added constructor validation in `GreedyAgent` for `completionsPerTemplate` (positive safe integer contract, `RangeError` on invalid input).
  - Added unit coverage in `greedy-agent-core` for invalid values (`0`, negative, non-integer, unsafe integer) and valid boundaries (`1`, `Number.MAX_SAFE_INTEGER`).
  - Updated ticket assumptions/scope to reflect current event-template architecture and corrected stale test file path reference.
- **Deviation from original plan**:
  - No engine event-protocol changes were required; that architecture was already implemented and covered by existing integration tests.
  - Test file target was corrected from the non-existent `greedy-agent.test.ts` to `greedy-agent-core.test.ts`.
- **Verification**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/agents/greedy-agent-core.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (270/270).
  - `pnpm -F @ludoforge/engine lint` passed.
