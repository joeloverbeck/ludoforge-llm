# ENGINEARCH-166: Generic stochastic decision completion and normalization

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel completion, shared stochastic completion policy, helper adoption
**Deps**: archive/tickets/ENGINEARCH/ENGINEARCH-165-canonical-rollrandom-chooseN-cardinality-contract.md, archive/tickets/ENGINEARCH-009-helper-decision-fallback-contract-hardening.md

## Problem

The engine already has a canonical stochastic discovery surface: `resolveMoveDecisionSequence()` returns `stochasticDecision` plus `nextDecisionSet` when a `rollRandom` leads to multiple legal downstream choice shapes. That probe surface is good architecture and should remain the source of truth for discovery.

The gap is that completion callers still stop at that surface. `completeTemplateMove()` returns `stochasticUnresolved`, and helper code built on `resolveMoveDecisionSequence()` treats `pendingStochastic` as terminal. As a result, agents and generic test helpers cannot carry a legal stochastic move through to a concrete completed move even when a deterministic RNG and/or deterministic overrides are available.

## Assumption Reassessment (2026-03-11)

1. `packages/engine/src/kernel/move-completion.ts` returns `stochasticUnresolved` as soon as `legalChoicesEvaluate()` reaches `pendingStochastic`, even when a deterministic RNG is available.
2. `packages/engine/test/helpers/decision-param-helpers.ts`, `packages/engine/test/helpers/move-decision-helpers.ts`, and `packages/engine/test/helpers/runtime-smoke-harness.ts` all delegate to `resolveMoveDecisionSequence()` and currently treat `pendingStochastic` as a terminal incomplete result.
3. `packages/engine/test/integration/fitl-events-international-forces.test.ts` no longer contains the bespoke `withAllStochasticRemovalChoices()` helper that originally motivated this ticket. The remaining problem is shared helper incapacity, not card-specific scaffolding.
4. The relevant helper coverage file is `packages/engine/test/unit/decision-param-helpers.test.ts`; `packages/engine/test/unit/move-decision-helpers.test.ts` exists, but it only covers the thin scripted helper wrapper.
5. Completing the downstream branch-local decision is not sufficient on its own. The selected stochastic outcome must also be persisted on the move, otherwise execution will reroll inside `applyMove()` and can diverge from the completed branch.

## Architecture Check

1. Stochastic probing and stochastic completion are different concerns. `resolveMoveDecisionSequence()` should remain the canonical probe API that exposes ambiguity; completion should be layered on top of it rather than weakening or overloading the probe contract.
2. Completion of stochastic choice trees should be implemented once in shared engine infrastructure and reused by agents and generic test helpers, not rebuilt in individual FITL tests or card helpers.
3. The completion policy must remain game-agnostic: given a move, state, overrides, and RNG, the engine should resolve the same stochastic branch shape regardless of which game authored it.
4. No compatibility shim should preserve manual branch injection as the canonical path.
5. A completed stochastic move must be replay-stable: execution must honor the chosen stochastic outcome instead of rerolling.

## What to Change

### 1. Introduce a shared stochastic completion layer on top of probing

Add a shared completion primitive that consumes the existing `resolveMoveDecisionSequence()` / `pendingStochastic` surface. A caller should be able to provide RNG plus optional overrides and receive a fully completed move even when intermediate discovery returns `pendingStochastic`. The implementation should choose one stochastic outcome deterministically, persist that sampled stochastic binding onto the move, then continue normal decision completion against the selected branch-local request ids.

Keep `resolveMoveDecisionSequence()` itself probe-oriented. Do not collapse probe and completion into a single API with ambiguous semantics.

### 2. Reuse the shared path across helpers and agents

Adopt the new completion behavior in:

1. `completeTemplateMove()`
2. `normalizeDecisionParamsForMoveInternal()` / `applyMoveWithResolvedDecisionIds()`
3. `completeMoveDecisionSequenceOrThrow()`
4. runtime smoke decision completion
5. agent move completion paths that currently fall back to partially-completed stochastic moves

This should let generic completion code handle stochastic branches without changing the canonical discovery/probe assertions that already exist in integration coverage.

### 3. Lock deterministic branch resolution contracts

Add tests proving that identical seeds plus identical override rules resolve the same stochastic branch and produce the same completed move, including branch-local exact-cardinality `chooseN` requests and cross-seat chooser-owned decisions behind the stochastic step.

## Files to Touch

- `packages/engine/src/kernel/move-completion.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` or a sibling shared completion helper (modify/add)
- `packages/engine/test/helpers/decision-param-helpers.ts` (modify)
- `packages/engine/test/helpers/move-decision-helpers.ts` (modify)
- `packages/engine/test/helpers/runtime-smoke-harness.ts` (modify)
- `packages/engine/test/unit/decision-param-helpers.test.ts` (modify)
- `packages/engine/test/unit/move-decision-helpers.test.ts` (modify)
- `packages/engine/test/integration/decision-sequence.test.ts` (modify)
- `packages/engine/test/unit/kernel/move-completion.test.ts` (modify)

## Out of Scope

- Changing runner UX for exposing stochastic alternatives
- FITL card-data rewrites
- New game-specific helper APIs

## Acceptance Criteria

### Tests That Must Pass

1. `completeTemplateMove()` can fully complete a satisfiable stochastic template move instead of returning `stochasticUnresolved`.
2. `applyMoveWithResolvedDecisionIds()` can normalize a move whose next unresolved step is `pendingStochastic`, using shared RNG/override policy rather than bespoke per-test code.
3. Scripted helper and runtime smoke paths can complete satisfiable stochastic moves through the same shared policy instead of treating them as terminally incomplete.
4. A completed stochastic move replays the same sampled outcome during execution instead of rerolling.
5. Deterministic seeds and identical overrides produce identical completed moves across repeated runs.
6. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Stochastic completion remains deterministic for identical inputs.
2. Shared completion helpers preserve chooser ownership and branch-local decision ids correctly.
3. The stochastic probe contract remains intact for callers that need ambiguity visibility instead of completion.
4. Persisted stochastic bindings remain generic engine data, not FITL-specific escape hatches.
5. Test helpers remain generic and reusable across games.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/decision-sequence.test.ts` — stochastic template completion continues past `pendingStochastic`.
2. `packages/engine/test/unit/kernel/move-completion.test.ts` — stochastic template completion stays deterministic across repeated seeds and exact-cardinality branches.
3. `packages/engine/test/unit/decision-param-helpers.test.ts` — resolved-decision normalization handles stochastic branch-local decision ids and seeded determinism.
4. `packages/engine/test/unit/move-decision-helpers.test.ts` — scripted helper diagnostics remain actionable when stochastic completion still cannot resolve.
5. `packages/engine/test/integration/fitl-events-international-forces.test.ts` — add a shared-helper execution assertion for shaded card-65 instead of claiming bespoke helper removal.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/move-completion.test.js packages/engine/dist/test/unit/decision-param-helpers.test.js packages/engine/dist/test/unit/move-decision-helpers.test.js packages/engine/dist/test/unit/kernel/decision-sequence-satisfiability.test.js packages/engine/dist/test/integration/decision-sequence.test.js packages/engine/dist/test/integration/fitl-events-international-forces.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`

## Outcome

Completed: 2026-03-11

What changed:
- Added a dedicated shared completion layer on top of `resolveMoveDecisionSequence()` instead of overloading the probe API.
- Extended stochastic discovery to carry replay-stable outcome metadata and persisted sampled `rollRandom` bindings on completed moves.
- Taught `rollRandom` discovery and execution to honor a pre-bound sampled outcome when present on the move.
- Reused the shared completion path in `completeTemplateMove()`, decision-param helpers, scripted move helpers, and the runtime smoke harness.
- Added focused regression coverage for stochastic template completion, shared helper normalization, scripted helper completion, and card-65 shaded helper execution.

Deviations from original plan:
- The original ticket assumed a card-65 bespoke helper still existed. It did not; the final scope focused on the real shared-helper gap and added card-65 coverage for shared stochastic normalization instead.
- The implementation required persisting sampled stochastic bindings on the move so `applyMove()` would not reroll and diverge from helper-completed branches. That replay-stability requirement was added during reassessment.

Verification:
- `pnpm -F @ludoforge/engine build`
- `node --test packages/engine/dist/test/unit/kernel/move-completion.test.js packages/engine/dist/test/unit/decision-param-helpers.test.js packages/engine/dist/test/unit/move-decision-helpers.test.js packages/engine/dist/test/unit/kernel/decision-sequence-satisfiability.test.js packages/engine/dist/test/integration/decision-sequence.test.js packages/engine/dist/test/integration/fitl-events-international-forces.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm -F @ludoforge/engine lint` (passes with pre-existing warnings elsewhere in the package)
- `pnpm run check:ticket-deps`
