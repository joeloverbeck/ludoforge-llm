# AGENTARCH-001: Centralize Greedy Tie-Break Random Selection

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — agent move selection utilities and GreedyAgent selection path
**Deps**: archive/tickets/AGENTTMPL/AGENTTMPL-002-extract-shared-stochastic-fallback-helper.md

## Problem

`GreedyAgent` still uses an inline `nextInt` tie-break path for equal-score candidates while stochastic fallback and `RandomAgent` random selection now use shared helpers. This leaves random single-item selection policy split across two implementations.

## Assumption Reassessment (2026-03-08)

1. Shared random selection helper exists at `packages/engine/src/agents/agent-move-selection.ts` with `pickRandom` and `selectStochasticFallback`. — Verified.
2. `GreedyAgent` tie-break for `tiedBestMoves` still uses inline `nextInt` + out-of-range guard at `packages/engine/src/agents/greedy-agent.ts`. — Verified.
3. `tickets/AGENTARCH-002-add-agent-move-selection-failure-contract-tests.md` covers helper failure contracts only, not `GreedyAgent` tie-break centralization. — Verified.
4. `packages/engine/test/unit/agents/greedy-agent-core.test.ts` currently asserts tie-break behavior through direct `nextInt` expectations and should be updated to assert helper-equivalent random-selection semantics instead of inline implementation detail. — Verified.

## Architecture Check

1. Reusing `pickRandom` for tie-break ensures one canonical random-single-selection policy in agent code, reducing drift risk.
2. The change is game-agnostic and operates only on `Move[]`/`Rng`; no GameSpecDoc game-specific behavior leaks into `GameDef`/runtime/simulator.
3. Centralizing tie-break logic improves long-term extensibility over the current split architecture because future policy changes (validation, telemetry, selection constraints) require one helper update instead of duplicated agent-specific fixes.
4. No backwards-compatibility aliasing or shim paths; inline logic is replaced directly.

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

1. `GreedyAgent` tie-break tests pass with helper-oriented assertions (no behavior regression).
2. Existing stochastic fallback determinism tests for both agents continue to pass.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Tie-break selection remains deterministic for identical seeds.
2. Agent move-selection random policy is defined in one helper path for single-item random picks.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/greedy-agent-core.test.ts` — replace tie-break assertion phrased as `nextInt` implementation detail with shared-helper-equivalent behavior checks (deterministic selection + exactly one RNG draw on ties).

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/greedy-agent-core.test.js`
2. `pnpm -F @ludoforge/engine test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-08
- What changed:
  - Replaced `GreedyAgent` inline tie-break `nextInt` selection with `pickRandom` from `agent-move-selection.ts`.
  - Removed duplicate out-of-range guard logic in `GreedyAgent` tie-break branch (now owned by shared helper contract).
  - Updated tie-break unit assertion in `greedy-agent-core.test.ts` to validate helper-equivalent deterministic selection and single RNG advancement semantics.
- Deviations from original plan:
  - No runtime behavior deviations; test wording/expectation was updated from `nextInt` implementation-detail wording to shared-helper contract wording.
- Verification results:
  - `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/greedy-agent-core.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo typecheck` passed.
