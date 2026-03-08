# ENG-205: Authoritative Event Grant Viability Legality

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — legality/apply-move event validation surfaces
**Deps**: archive/tickets/FITLEVENTARCH/ENG-201-free-op-grant-viability-gating.md, packages/engine/src/kernel/legal-moves-turn-order.ts, packages/engine/src/kernel/apply-move.ts, packages/engine/src/kernel/legal-choices.ts

## Problem

`requireUsableForEventPlay` is currently enforced during legal-move discovery filtering, but not guaranteed by the authoritative move legality path. This can allow direct move submission to bypass intended policy semantics.

## Assumption Reassessment (2026-03-08)

1. Event viability policy is currently evaluated via `isEventMovePlayableUnderGrantViabilityPolicy` from turn-flow filtering.
2. Current enforcement path is discovery-centric; direct legality/apply validation does not have a dedicated hard gate for event-play viability policy.
3. Mismatch: policy visibility and policy legality can diverge. Correction: enforce the same viability contract in authoritative legality/apply paths.

## Architecture Check

1. A single authoritative legality rule is cleaner than relying on discovery filtering behavior.
2. Enforcement remains game-agnostic and data-driven from `GameSpecDoc` grant metadata; no card/game-id branching.
3. No backwards-compatibility shims: define one canonical rejection rule and apply it consistently.

## What to Change

### 1. Add authoritative event viability legality gate

Apply `requireUsableForEventPlay` legality checks in authoritative legality/apply flow (not only `legalMoves`). If violated, reject move deterministically with explicit reason metadata.

### 2. Align discovery and authoritative outcomes

Ensure `legalMoves`, `legalChoices`, and direct `applyMove` decisions are consistent for the same event move and state.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/runtime-reasons.ts` and related legality reason contracts (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify only if needed for reason alignment)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Sequence-bound location context across chained grants (ENG-202).
- Mandatory completion/outcome semantics (ENG-203).

## Acceptance Criteria

### Tests That Must Pass

1. Direct `applyMove` of an event side with `requireUsableForEventPlay` fails when no usable grant exists.
2. `legalMoves` and direct legality/apply produce consistent allow/deny outcomes for same event side and state.
3. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

### Invariants

1. Event viability policy legality is enforced by a single authoritative path.
2. Rejection metadata is deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add direct `applyMove` deny case for `requireUsableForEventPlay`.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add parity assertions between `legalMoves` visibility and authoritative legality.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `pnpm -F @ludoforge/engine test`
