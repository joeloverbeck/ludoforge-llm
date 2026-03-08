# AGENTARCH-002: Add Agent Move Selection Failure-Contract Tests

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — agent helper test coverage only
**Deps**: archive/tickets/AGENTTMPL/AGENTTMPL-002-extract-shared-stochastic-fallback-helper.md

## Problem

`pickRandom` explicitly throws for empty input, but test coverage currently validates only success paths. As shared infrastructure, helper failure contracts should be tested to prevent accidental weakening or silent contract drift.

## Assumption Reassessment (2026-03-08)

1. `pickRandom` throws `Error('pickRandom requires at least one item')` for empty arrays in `packages/engine/src/agents/agent-move-selection.ts`. — Verified.
2. `packages/engine/test/unit/agents/agent-move-selection.test.ts` currently lacks empty-input failure assertions. — Verified.
3. No active ticket in `tickets/*` currently covers failure-contract tests for this helper. — Verified.

## Scope Reassessment (2026-03-08)

1. Scope remains test-only in `packages/engine/test/unit/agents/agent-move-selection.test.ts`.
2. No runtime changes are required because the helper already enforces empty-input failure contracts.
3. The ticket should validate exact error semantics for `pickRandom` and propagated rejection semantics for `selectStochasticFallback`.

## Architecture Check

1. Explicit failure-contract tests harden the existing architecture by locking helper preconditions in a shared, reusable contract.
2. Tests are purely game-agnostic helper contracts and do not introduce any game-specific logic into `GameDef`/sim/runtime layers.
3. This is more beneficial than the current test posture because it prevents accidental weakening of foundational agent selection behavior without changing runtime architecture.
4. No backwards-compatibility or alias paths; this is strict contract hardening.

## What to Change

### 1. Add empty-input contract tests for helper APIs

Add tests asserting `pickRandom([], rng)` throws with stable error semantics.

### 2. Add defensive contract test for `selectStochasticFallback([])`

Add a test asserting fallback selection also throws for empty move lists (either directly by propagated error or an explicit fallback-specific message).

## Files to Touch

- `packages/engine/test/unit/agents/agent-move-selection.test.ts` (modify)

## Out of Scope

- Changing helper runtime behavior or error wording unless stability concerns demand it
- Any non-agent kernel/runtime changes

## Acceptance Criteria

### Tests That Must Pass

1. Helper success-path tests continue to pass.
2. New empty-input contract tests pass and fail if helper stops rejecting empty inputs.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Shared random-selection helpers reject invalid empty candidate sets.
2. Deterministic behavior for valid inputs remains unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/agent-move-selection.test.ts` — add throw assertions for empty input contracts.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/agent-move-selection.test.js`
2. `pnpm -F @ludoforge/engine test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-08
- **What changed**:
  - Added `pickRandom` empty-input failure-contract test asserting the stable message contract.
  - Added `selectStochasticFallback` empty-input failure-contract test asserting propagated rejection.
  - Corrected ticket assumption/scope wording before implementation to match actual repository state.
- **Deviations from original plan**:
  - Added an extra workspace-level verification run with `pnpm turbo test` in addition to the planned commands.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/agent-move-selection.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo typecheck` passed.
