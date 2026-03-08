# AGENTARCH-001: Centralize Greedy Tie-Break Random Selection

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — agent move selection utilities and GreedyAgent selection path
**Deps**: archive/tickets/AGENTTMPL/AGENTTMPL-002-extract-shared-stochastic-fallback-helper.md

## Problem

`GreedyAgent` still uses an inline `nextInt` tie-break path for equal-score candidates while stochastic fallback and `RandomAgent` random selection now use shared helpers. This leaves random single-item selection policy split across two implementations.

## Assumption Reassessment (2026-03-08)

1. Shared random selection helper exists at `packages/engine/src/agents/agent-move-selection.ts` with `pickRandom` and `selectStochasticFallback`. — Verified.
2. `GreedyAgent` tie-break for `tiedBestMoves` still uses inline `nextInt` + out-of-range guard at `packages/engine/src/agents/greedy-agent.ts`. — Verified.
3. No active ticket in `tickets/*` currently covers centralizing this remaining tie-break path. — Verified mismatch; scope corrected to include this cleanup.

## Architecture Check

1. Reusing `pickRandom` for tie-break ensures one canonical random-single-selection policy in agent code, reducing drift risk.
2. The change is game-agnostic and operates only on `Move[]`/`Rng`; no GameSpecDoc game-specific behavior leaks into `GameDef`/runtime/simulator.
3. No backwards-compatibility aliasing or shim paths; inline logic is replaced directly.

## What to Change

### 1. Replace `GreedyAgent` tie-break inline random selection with `pickRandom`

Refactor the `tiedBestMoves` selection branch to call `pickRandom(tiedBestMoves, candidates.rng)` and return the selected move and advanced rng.

### 2. Keep behavior parity and simplify redundant guards

Preserve deterministic behavior and remove redundant manual index/out-of-range checks that are already enforced in shared helper logic.

## Files to Touch

- `packages/engine/src/agents/greedy-agent.ts` (modify)

## Out of Scope

- Changing scoring/evaluation semantics in `GreedyAgent`
- Changing `selectCandidatesDeterministically` bounded sampling behavior
- Runner or UI changes

## Acceptance Criteria

### Tests That Must Pass

1. Existing `GreedyAgent` tie-break tests continue to pass unchanged.
2. Existing stochastic fallback determinism tests for both agents continue to pass.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Tie-break selection remains deterministic for identical seeds.
2. Agent move-selection random policy is defined in one helper path for single-item random picks.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/greedy-agent-core.test.ts` — add/adjust assertion that tie-break branch behavior remains deterministic after helper delegation (if needed).

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/greedy-agent-core.test.js`
2. `pnpm -F @ludoforge/engine test && pnpm turbo lint && pnpm turbo typecheck`
