# ENG-205: Authoritative Event Grant Viability Legality

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: No — ticket resolved via assumption/scope correction plus regression coverage
**Deps**: archive/tickets/FITLEVENTARCH/ENG-201-free-op-grant-viability-gating.md, packages/engine/src/kernel/legal-moves-turn-order.ts, packages/engine/src/kernel/apply-move.ts, packages/engine/src/kernel/legal-choices.ts

## Problem

This ticket originally assumed `requireUsableForEventPlay` was only enforced during `legalMoves` discovery filtering. Current code already enforces the same rule in authoritative `applyMove` validation via shared turn-flow window filters. The remaining risk is regression (drift between discovery and authoritative paths), not missing core enforcement.

## Assumption Reassessment (2026-03-08)

1. Event viability policy is evaluated via `isEventMovePlayableUnderGrantViabilityPolicy` inside `applyTurnFlowWindowFilters`.
2. `applyTurnFlowWindowFilters` is used by both discovery (`legalMoves`) and authoritative validation (`applyMove` -> `validateTurnFlowWindowAccess`), so direct submission already cannot bypass `requireUsableForEventPlay`.
3. `legalChoices` is not the authoritative submission gate; parity protection should be captured by tests around `legalMoves` vs direct `applyMove`.

## Architecture Check

1. Current architecture already has a single shared legality rule (`applyTurnFlowWindowFilters`) consumed by both discovery and authoritative validation.
2. Adding a second dedicated event-viability gate in `applyMove` would duplicate policy logic and increase drift risk.
3. The robust/extensible change is stronger parity regression coverage, not duplicated kernel branches.

## What to Change

### 1. Preserve single-source legality architecture

Do not add a second event-viability legality branch. Keep legality sourced from shared turn-flow window filtering.

### 2. Add regression tests for discovery/authoritative parity

Add direct `applyMove` regression coverage proving `requireUsableForEventPlay` rejection matches discovery suppression for the same event move/state.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (no change expected; read/verify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (no change expected; read/verify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Sequence-bound location context across chained grants (ENG-202).
- Mandatory completion/outcome semantics (ENG-203).

## Acceptance Criteria

### Tests That Must Pass

1. Direct `applyMove` of an event side with `requireUsableForEventPlay` fails when no usable grant exists.
2. `legalMoves` suppression and direct `applyMove` rejection stay consistent for the same event side/state.
3. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

### Invariants

1. Event viability policy remains enforced by one shared, game-agnostic legality path.
2. Discovery and direct submission cannot diverge for `requireUsableForEventPlay`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add direct `applyMove` deny case for `requireUsableForEventPlay`.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add explicit parity assertion between `legalMoves` suppression and direct `applyMove` rejection.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-08
- What actually changed:
  - Reassessed and corrected the ticket assumptions/scope: authoritative enforcement already existed through shared `applyTurnFlowWindowFilters` used by both `legalMoves` and `applyMove`.
  - Added parity regression coverage in `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` to assert direct `applyMove` rejects the same `requireUsableForEventPlay` event that `legalMoves` suppresses.
- Deviations from original plan:
  - No kernel/runtime reason contract changes were made because the proposed dedicated authoritative gate would duplicate existing architecture and increase drift risk.
  - `legal-choices.ts` and `runtime-reasons.ts` were intentionally left unchanged after reassessment.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`444` tests, `444` passed).
  - `pnpm turbo lint` passed.
