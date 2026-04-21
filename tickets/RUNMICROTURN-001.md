# RUNMICROTURN-001: Align runner AI-step active-player projection with the Spec 140 microturn protocol

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only unless investigation proves the engine trace contract is wrong
**Deps**: `docs/FOUNDATIONS.md`, `archive/specs/140-microturn-native-decision-protocol.md`

## Problem

After the latest Spec 140 engine fixes, runner CI fails in `test/store/game-store.test.ts`:

- test: `runAiStep advances one published decision and reports completed moves`
- observed failure: `renderModel.activePlayerID` is `0`
- expected by test: `1`

The engine-side Texas replay and tournament regressions are now green, so this remaining failure is most likely a runner projection mismatch: the runner still expects a pre-Spec-140 notion of whose turn is active after an AI step, while the engine now exposes microturn-native post-decision state.

This is a shared-protocol issue:

- Foundation `#5`: simulator, runner, and agents must use the same action / legality / event protocol.
- Foundation `#9`: the event/state record must be sufficient to drive the runner.

The fix should update the runner to project the authoritative kernel state rather than infer compound-turn behavior from stale assumptions.

## Assumption Reassessment (2026-04-21)

1. The failing assertion is runner-only; engine Texas lanes that previously failed are now green.
2. The exact expected `activePlayerID` after `runAiStep` may legitimately differ under Spec 140 microturn-native sequencing.
3. If the engine trace/store contract is correct, the runner test should be updated to assert the actual authoritative projection, not a pre-migration turn-level heuristic.
4. If investigation shows the engine is emitting an incorrect post-decision active player for all clients, this ticket must stop and split that kernel bug back into an engine ticket rather than patch around it in the runner.

## Architecture Check

1. The runner must derive active-player state from authoritative engine state / trace outputs, not from local compound-turn inference.
2. No runner-side shadow rules logic may be introduced to recover an older turn model.
3. No compatibility shim for “legacy active player semantics”; the runner should adopt the live Spec 140 contract directly.

## What to Change

### 1. Reproduce the failing store flow and inspect the engine contract

Trace the exact `runAiStep` transition in the failing test:

- pre-step game state,
- chosen published decision,
- post-step engine state,
- runner render-model projection.

Confirm whether the engine’s post-step active player / active seat is correct under the microturn protocol.

### 2. Fix runner projection if the engine contract is correct

Update the relevant runner state/projection path so `renderModel.activePlayerID` reflects the authoritative kernel state after an AI step.

Likely surfaces include:

- `packages/runner/src/store/game-store.ts`
- render-model derivation
- AI step orchestration

### 3. Update tests to assert the authoritative contract

Adjust or extend runner tests so they prove:

- `runAiStep` advances exactly one published decision,
- completed-move reporting still works,
- projected active player follows the actual engine state after the step.

## Files to Touch

- `packages/runner/src/store/game-store.ts` (modify)
- `packages/runner/src/model/*` and/or related projection helpers (modify if needed)
- `packages/runner/test/store/game-store.test.ts` (modify)
- any focused runner projection tests needed to lock the contract in (new/modify)

## Out of Scope

- Reintroducing compound-turn assumptions into the runner.
- Changing engine active-player semantics unless a kernel bug is proven.
- Broad UI redesign or unrelated runner cleanup.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/runner test` passes locally.
2. The failing `runAiStep` test passes and explicitly matches the authoritative post-step engine contract.
3. Relevant engine/runner integration tests remain green under the same AI-step flow.

### Invariants

1. The runner reflects authoritative kernel state; it does not maintain a separate turn-ownership rule path (Foundation `#5`).
2. The projected active player after an AI step is derived from the same state/trace record used by replay and UI (Foundation `#9`).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/store/game-store.test.ts` — fix the failing AI-step active-player assertion
2. Focused projection regression — prove render model follows post-decision engine state

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo test`
3. `pnpm turbo lint && pnpm turbo typecheck`
