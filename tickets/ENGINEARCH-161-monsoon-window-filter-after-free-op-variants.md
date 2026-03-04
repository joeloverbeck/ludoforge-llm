# ENGINEARCH-161: Apply Monsoon Window Filtering After Free-Operation Variant Expansion

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — turn-flow legal-move pipeline ordering (`legal-moves.ts`, `legal-moves-turn-order.ts`)
**Deps**: specs/29-fitl-event-card-encoding.md

## Problem

Monsoon gating is currently applied before free-operation variants are expanded. This allows generated free-operation moves to bypass monsoon restrictions unintentionally, even when a grant is not marked as monsoon-allowed.

## Assumption Reassessment (2026-03-04)

1. Verified in current kernel flow that `applyTurnFlowWindowFilters` runs before `applyPendingFreeOperationVariants`.
2. Verified new grant metadata (`allowDuringMonsoon`) exists but can be defeated by pipeline order.
3. Mismatch: intended policy is per-move monsoon gating on final legal moves; corrected scope is to enforce monsoon filtering on post-variant move set.

## Architecture Check

1. Reordering/filtering in shared turn-flow pipeline is cleaner than card/event-specific workarounds.
2. Keeps game-specific behavior in GameSpecDoc and policy enforcement in agnostic engine turn-flow logic.
3. No backward-compatibility shims or alias paths; this is a direct contract correction.

## What to Change

### 1. Legal-move pipeline ordering

Ensure monsoon window filtering evaluates the final move list (including generated free-operation variants).

### 2. Monsoon bypass contract enforcement

Guarantee only grants with explicit `allowDuringMonsoon: true` can pass monsoon restriction for restricted actionIds.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Changing FITL card data semantics beyond monsoon gating behavior.
- Introducing per-game special logic in kernel.

## Acceptance Criteria

### Tests That Must Pass

1. A monsoon-restricted action with a free-operation grant but without `allowDuringMonsoon` is excluded from legal moves.
2. A monsoon-restricted action with a free-operation grant and `allowDuringMonsoon: true` is included.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Turn-flow window policies are applied to final legal move set, not only pre-variant templates.
2. Monsoon bypass behavior remains generic and metadata-driven.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — assert both blocked and allowed monsoon free-op paths on generated variants.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `pnpm -F @ludoforge/engine test`
