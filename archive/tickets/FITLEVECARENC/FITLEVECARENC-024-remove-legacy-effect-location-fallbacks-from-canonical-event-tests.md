# FITLEVECARENC-024: Remove Legacy Effect-Location Fallbacks from Canonical Event Tests

**Status**: COMPLETED (2026-03-08)
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test contract hardening
**Deps**: archive/tickets/FITLEVENTARCH-006-event-target-canonical-payload-ownership.md, specs/29-fitl-event-card-encoding.md

## Problem

Several integration assertions accept both legacy and canonical effect ownership (for example `side.effects ?? side.targets?.[0]?.effects` and branch equivalents). This weakens canonical enforcement and silently tolerates payload placement drift after strict target-local migration.

## Assumption Reassessment (2026-03-08)

1. `fitl-events-text-only-behavior-backfill.test.ts` introduces `sideEffectsWithTargetFallback()` that permits either legacy or canonical effect locations. Verified.
2. Additional fallback assertions exist in FITL integration tests:
   - `fitl-events-tutorial-simple.test.ts`
   - `fitl-events-tutorial-medium.test.ts`
   - `fitl-events-tutorial-cap-momentum.test.ts`
   Verified.
3. `fitl-events-green-berets.test.ts` does not use legacy effect-location fallback helpers/patterns for event-side assertions, so it is out of scope for this ticket. Verified.
4. Current active tickets do not explicitly scope strict removal of these fallback assertions across the above files, leaving an enforcement gap. Verified.

## Architecture Check

1. Tests are executable architecture contracts; allowing dual shapes undermines canonical payload ownership.
2. Strict per-location assertions are more robust than fallback assertions because they fail immediately when ownership drifts.
3. This change improves long-term extensibility by keeping ownership rules explicit and non-ambiguous without compatibility shims.

## What to Change

### 1. Remove fallback helpers and dual-shape assertions

Replace `side.effects ?? side.targets?.[0]?.effects` style checks (including branch-level equivalents) with explicit canonical-location assertions.

### 2. Strengthen assertion intent per card

For each canonicalized card/side, assert the authoritative effect surface (`targets[i].effects` or top-level `effects`) and key effect nodes. Where helpful, assert the non-canonical location is absent.

### 3. Keep test coverage readable and deterministic

Use explicit per-card assertions (or narrowly scoped helpers that encode one canonical location only). Do not reintroduce generic fallback utilities.

## Files to Touch

- `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-tutorial-simple.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-tutorial-medium.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-tutorial-cap-momentum.test.ts` (modify)

## Out of Scope

- Re-encoding card data itself (except where test fixes expose a real schema mismatch)
- Engine runtime changes
- Runner/UI changes
- `fitl-events-green-berets.test.ts`

## Acceptance Criteria

### Tests That Must Pass

1. Canonical event tests assert one authoritative payload location per card-side (no legacy fallback logic).
2. Regression suite fails if payload ownership drifts back to mixed/legacy shapes.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Test suite enforces canonical payload ownership architecture.
2. No alias/shim acceptance in validation assertions.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` — remove fallback helper; assert canonical location directly for each covered card.
2. `packages/engine/test/integration/fitl-events-tutorial-simple.test.ts` — replace dual-shape checks with explicit canonical-location assertions.
3. `packages/engine/test/integration/fitl-events-tutorial-medium.test.ts` — replace dual-shape checks with explicit canonical-location assertions.
4. `packages/engine/test/integration/fitl-events-tutorial-cap-momentum.test.ts` — replace dual-shape checks with explicit canonical-location assertions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`

## Outcome

- Updated scope after reassessment: removed `fitl-events-green-berets.test.ts` because it had no legacy effect-location fallback assertions.
- Removed canonical-location fallback logic from four integration tests and replaced it with explicit target-owned or side-owned effect assertions.
- Strengthened coverage by adding invariants that reject mixed ownership for affected card sides (for example, explicit `effects` absence checks on target-owned payloads).
- Validation executed successfully: `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine test`, `pnpm -F @ludoforge/engine lint`, and `pnpm -F @ludoforge/engine typecheck`.
