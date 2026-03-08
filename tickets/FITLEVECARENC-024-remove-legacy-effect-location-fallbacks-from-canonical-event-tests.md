# FITLEVECARENC-024: Remove Legacy Effect-Location Fallbacks from Canonical Event Tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test contract hardening
**Deps**: archive/tickets/FITLEVENTARCH-006-event-target-canonical-payload-ownership.md, specs/29-fitl-event-card-encoding.md

## Problem

Several integration assertions now accept both `side.effects` and `targets[0].effects` via fallback helpers. This weakens canonical enforcement and silently tolerates non-canonical payload ownership after strict target-local migration.

## Assumption Reassessment (2026-03-08)

1. `fitl-events-text-only-behavior-backfill.test.ts` introduces `sideEffectsWithTargetFallback()` that permits either legacy or canonical effect locations. Verified.
2. Similar fallback usage exists in other FITL integration tests using `side.effects ?? side.targets?.[0]?.effects`. Verified.
3. Current active tickets do not explicitly scope strict removal of these fallback assertions across tests, so this remains an uncovered enforcement gap. Verified.

## Architecture Check

1. Tests are executable architecture contracts; allowing dual shapes undermines the canonical target-owned payload model.
2. Tightening tests preserves clean layering by forcing GameSpecDoc to remain explicit while engine stays agnostic.
3. No backwards-compatibility paths: tests should fail on non-canonical regressions immediately.

## What to Change

### 1. Remove fallback helpers and dual-shape assertions

Replace all `side.effects ?? side.targets?.[0]?.effects` style checks with explicit canonical-location assertions per card/side.

### 2. Strengthen assertion intent per card

For canonicalized cards, assert exact effect surface (`targets[i].effects` or `side.effects`) and key effect nodes, so structural regressions are caught early.

### 3. Keep test coverage readable and deterministic

Prefer explicit per-card helper functions that encode canonical location rules instead of generic fallback utilities.

## Files to Touch

- `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-tutorial-simple.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-tutorial-medium.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-tutorial-cap-momentum.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-green-berets.test.ts` (modify)

## Out of Scope

- Re-encoding card data itself (except where test fixes expose real schema mismatch)
- Engine runtime changes
- Runner/UI changes

## Acceptance Criteria

### Tests That Must Pass

1. Canonical event tests assert one authoritative payload location per card-side (no legacy fallback logic).
2. Regression suite fails if payload ownership drifts back to mixed/legacy shapes.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Test suite enforces canonical target-owned payload architecture.
2. No alias/shim acceptance in validation assertions.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` — remove fallback helper; assert canonical location directly for each covered card.
2. `packages/engine/test/integration/fitl-events-tutorial-simple.test.ts` — replace dual-shape checks with explicit canonical-location assertions.
3. `packages/engine/test/integration/fitl-events-tutorial-medium.test.ts` — same canonical-location tightening.
4. `packages/engine/test/integration/fitl-events-tutorial-cap-momentum.test.ts` — same canonical-location tightening.
5. `packages/engine/test/integration/fitl-events-green-berets.test.ts` — same canonical-location tightening.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`
