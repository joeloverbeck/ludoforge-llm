# ENGINEARCH-166: Generic stochastic decision completion and normalization

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — move completion, test helpers, stochastic completion policy
**Deps**: archive/tickets/ENGINEARCH/ENGINEARCH-165-canonical-rollrandom-chooseN-cardinality-contract.md, archive/tickets/ENGINEARCH-009-helper-decision-fallback-contract-hardening.md

## Problem

Even when a stochastic move is legal, the engine’s completion/normalization helpers currently stop at `pendingStochastic`. As a result, tests and agent-style tooling cannot complete natural stochastic moves through a generic path and must inject branch-specific decision ids manually.

Card-65 exposed this directly: `packages/engine/test/integration/fitl-events-international-forces.test.ts` had to bypass `applyMoveWithResolvedDecisionIds()` and synthesize every alternative decision binding in a bespoke helper.

## Assumption Reassessment (2026-03-11)

1. `packages/engine/src/kernel/move-completion.ts` returns `stochasticUnresolved` as soon as `legalChoicesEvaluate()` reaches `pendingStochastic`, even when a deterministic RNG is available.
2. `packages/engine/test/helpers/decision-param-helpers.ts` throws on unresolved `pendingStochastic` because `normalizeDecisionParamsForMoveInternal()` only knows how to fill a single `ChoicePendingRequest`.
3. The current card-65 shaded integration test had to add `withAllStochasticRemovalChoices()` solely to work around this missing generic completion path.

## Architecture Check

1. Completion of stochastic choice trees should be handled once in shared engine/test infrastructure, not repeatedly in individual FITL tests or event-card helpers.
2. The completion policy must remain game-agnostic: given a move, state, overrides, and RNG, the engine should resolve the same stochastic branch shape regardless of which game authored it.
3. No compatibility shim should preserve the old "manual alternative injection" pattern as the canonical path.

## What to Change

### 1. Introduce a shared stochastic completion path

Extend move completion/normalization so a caller can provide RNG plus optional overrides and receive a fully completed move even when intermediate discovery returns `pendingStochastic`. The implementation should resolve the stochastic branch, then continue normal decision completion against the chosen branch-local request ids.

### 2. Reuse the shared path across helpers and agents

Adopt the new completion behavior in:

1. `completeTemplateMove()`
2. `normalizeDecisionParamsForMoveInternal()` / `applyMoveWithResolvedDecisionIds()`
3. any helper paths that currently terminate at `pendingStochastic`

This should remove the need for bespoke branch-expansion helpers in integration tests.

### 3. Lock deterministic branch resolution contracts

Add tests proving that identical seeds plus identical override rules resolve the same stochastic branch and produce the same completed move, including cross-seat chooser-owned decisions behind the stochastic step.

## Files to Touch

- `packages/engine/src/kernel/move-completion.ts` (modify)
- `packages/engine/test/helpers/decision-param-helpers.ts` (modify)
- `packages/engine/test/helpers/move-decision-helpers.ts` (modify)
- `packages/engine/test/helpers/runtime-smoke-harness.ts` (modify)
- `packages/engine/test/unit/move-decision-helpers.test.ts` (modify)
- `packages/engine/test/integration/decision-sequence.test.ts` (modify)

## Out of Scope

- Changing runner UX for exposing stochastic alternatives
- FITL card-data rewrites
- New game-specific helper APIs

## Acceptance Criteria

### Tests That Must Pass

1. `completeTemplateMove()` can fully complete a satisfiable stochastic template move instead of returning `stochasticUnresolved`.
2. `applyMoveWithResolvedDecisionIds()` can normalize a move whose next unresolved step is `pendingStochastic`, using shared RNG/override policy rather than bespoke per-test code.
3. Deterministic seeds and identical overrides produce identical completed moves across repeated runs.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Stochastic completion remains deterministic for identical inputs.
2. Shared completion helpers preserve chooser ownership and branch-local decision ids correctly.
3. Test helpers remain generic and reusable across games.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/decision-sequence.test.ts` — stochastic template completion continues past `pendingStochastic`.
2. `packages/engine/test/unit/move-decision-helpers.test.ts` — resolved-decision helper handles stochastic branch-local decision ids.
3. `packages/engine/test/integration/fitl-events-international-forces.test.ts` — remove bespoke stochastic helper after the engine support lands.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/move-decision-helpers.test.js packages/engine/dist/test/integration/decision-sequence.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`
