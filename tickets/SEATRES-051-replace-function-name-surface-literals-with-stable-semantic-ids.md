# SEATRES-051: Replace function-name surface literals with stable semantic IDs

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel runtime invariant contract IDs and active-seat call-site metadata
**Deps**: archive/tickets/SEATRES-030-strictly-type-active-seat-invariant-surfaces.md

## Problem

Active-seat invariant `surface` values are currently tied to implementation function names (for example `isActiveSeatEligibleForTurnFlow`, `applyGrantFreeOperation`). This makes diagnostics contracts unstable under internal refactors and leaks implementation naming into runtime-facing error metadata.

## Assumption Reassessment (2026-03-02)

1. `TurnFlowActiveSeatInvariantContext.surface` is now strictly typed via `TurnFlowActiveSeatInvariantSurface`, but the literals are function-name strings.
2. Multiple kernel/effect call sites directly pass those implementation-name literals into `requireCardDrivenActiveSeat(...)` / `makeActiveSeatUnresolvableInvariantContext(...)`.
3. Existing active tickets (`SEATRES-031`, `SEATRES-032`, `SEATRES-033`, `SEATRES-035`) do not define migration to stable semantic surface IDs decoupled from function names.

## Architecture Check

1. Stable semantic IDs are cleaner than function-name literals because contract identity remains deterministic when internal function names or file structure evolve.
2. This is purely runtime-contract metadata hygiene in game-agnostic kernel/effect layers and does not introduce game-specific behavior into `GameDef`/simulation.
3. No backwards-compatibility alias layer: old function-name IDs are removed in one pass and tests are updated to the canonical semantic IDs.

## What to Change

### 1. Introduce semantic active-seat surface ID registry

1. Replace function-name literal values in `TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACES` with semantic contract IDs (for example `turnFlow.activeSeat.checkEligibility`, `turnFlow.activeSeat.resolveGrant`, etc.).
2. Export a constant map/object for these IDs and derive the union type from that map to avoid repeated raw strings.

### 2. Migrate all emitters/tests to semantic IDs

1. Update all active-seat invariant call sites to use the exported constants instead of raw string literals.
2. Update runtime/effect tests that assert `context.surface` to the new semantic IDs.
3. Keep message determinism and invariant payload structure unchanged except for `surface` identifier values.

## Files to Touch

- `packages/engine/src/kernel/runtime-error.ts` (modify)
- `packages/engine/src/kernel/turn-flow-runtime-invariants.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify if surface assertions present)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify)

## Out of Scope

- Effect runtime context typing redesign (`SEATRES-031`)
- Cross-surface parity module extraction (`SEATRES-032`)
- Seat-resolution lifecycle ownership/threading (`SEATRES-033`, `SEATRES-035`)

## Acceptance Criteria

### Tests That Must Pass

1. Active-seat invariant `surface` contract values no longer use function-name strings.
2. All active-seat invariant emitters compile against a single semantic ID registry with no raw call-site literals.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Active-seat invariant metadata stays strongly typed and deterministic across kernel/effect surfaces.
2. Runtime contracts remain game-agnostic and alias-free.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — assert the canonical semantic surface registry values and type constraints.
2. `packages/engine/test/unit/effects-turn-flow.test.ts` — assert effect unresolved-active-seat context uses semantic surface ID.
3. `packages/engine/test/unit/kernel/legal-moves.test.ts` — assert kernel unresolved-active-seat context uses semantic surface ID where currently checked.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
3. `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
