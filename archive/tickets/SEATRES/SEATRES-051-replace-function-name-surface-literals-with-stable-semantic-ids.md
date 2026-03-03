# SEATRES-051: Replace function-name surface literals with stable semantic IDs

**Status**: COMPLETED (2026-03-03)
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel runtime invariant contract IDs and active-seat call-site metadata
**Deps**: archive/tickets/SEATRES-030-strictly-type-active-seat-invariant-surfaces.md

## Problem

Active-seat invariant `surface` values are currently tied to implementation function names (for example `isActiveSeatEligibleForTurnFlow`, `applyGrantFreeOperation`). This makes diagnostics contracts unstable under internal refactors and leaks implementation naming into runtime-facing error metadata.

## Assumption Reassessment (2026-03-03)

1. `TurnFlowActiveSeatInvariantContext.surface` is now strictly typed via `TurnFlowActiveSeatInvariantSurface`, but the literals are function-name strings.
2. Multiple kernel/effect call sites directly pass those implementation-name literals into `requireCardDrivenActiveSeat(...)` / `makeActiveSeatUnresolvableInvariantContext(...)`.
3. Existing active tickets (`SEATRES-031`, `SEATRES-032`, `SEATRES-033`, `SEATRES-035`) do not define migration to stable semantic surface IDs decoupled from function names.
4. Current ticket file scope is incomplete: semantic IDs are defined in `turn-flow-invariant-contract-types.ts`, rendered in messages by `turn-flow-invariant-contracts.ts`, and asserted by additional tests not listed in this ticket (`effect-error-contracts.test.ts`, `turn-flow-runtime-invariants.test.ts`).

## Architecture Check

1. Stable semantic IDs are cleaner than function-name literals because contract identity remains deterministic when internal function names or file structure evolve.
2. This is purely runtime-contract metadata hygiene in game-agnostic kernel/effect layers and does not introduce game-specific behavior into `GameDef`/simulation.
3. No backwards-compatibility alias layer: old function-name IDs are removed in one pass and tests are updated to the canonical semantic IDs.

## What to Change

### 1. Introduce semantic active-seat surface ID registry

1. Replace function-name literal values in `TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACES` with semantic contract IDs (for example `turnFlow.activeSeat.checkEligibility`, `turnFlow.activeSeat.resolveGrant`, etc.).
2. Export a constant map/object for these IDs and derive the union type from that map to avoid repeated raw strings.
3. Keep `TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACES` as a derived list from the registry values so tests can assert canonical ordering deterministically without raw literals.

### 2. Migrate all emitters/tests to semantic IDs

1. Update all active-seat invariant call sites to use the exported constants instead of raw string literals.
2. Update runtime/effect tests that assert `context.surface` to the new semantic IDs.
3. Keep message determinism and invariant payload structure unchanged except for `surface` identifier values.
4. Ensure parity helpers and cross-contract tests continue to verify kernel/effect context equivalence with new semantic IDs.

## Files to Touch

- `packages/engine/src/kernel/runtime-error.ts` (modify)
- `packages/engine/src/kernel/turn-flow-invariant-contract-types.ts` (modify)
- `packages/engine/src/kernel/turn-flow-invariant-contracts.ts` (modify)
- `packages/engine/src/kernel/turn-flow-runtime-invariants.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify if surface assertions present)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify)
- `packages/engine/test/unit/effect-error-contracts.test.ts` (modify)
- `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts` (modify)

## Out of Scope

- Effect runtime context typing redesign (`SEATRES-031`)
- Cross-surface parity module extraction (`SEATRES-032`)
- Seat-resolution lifecycle ownership/threading (`SEATRES-033`, `SEATRES-035`)

## Acceptance Criteria

### Tests That Must Pass

1. Active-seat invariant `surface` contract values no longer use function-name strings.
2. All active-seat invariant emitters compile against a single semantic ID registry with no raw call-site literals.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Cross-contract parity between kernel and effect active-seat invariant contexts remains unchanged except semantic `surface` value.

### Invariants

1. Active-seat invariant metadata stays strongly typed and deterministic across kernel/effect surfaces.
2. Runtime contracts remain game-agnostic and alias-free.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — assert the canonical semantic surface registry values and type constraints.
2. `packages/engine/test/unit/effects-turn-flow.test.ts` — assert effect unresolved-active-seat context uses semantic surface ID.
3. `packages/engine/test/unit/kernel/legal-moves.test.ts` — assert kernel unresolved-active-seat context uses semantic surface ID where currently checked.
4. `packages/engine/test/unit/effect-error-contracts.test.ts` — assert effect runtime context helper uses semantic surface ID.
5. `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts` — assert direct helper callers pass semantic surface ID.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
3. `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
5. `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js`
6. `node --test packages/engine/dist/test/unit/kernel/turn-flow-runtime-invariants.test.js`
7. `pnpm -F @ludoforge/engine test`
8. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

Implemented as scoped, with two adjustments from the original draft:

1. Added `TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS` as the single semantic-ID registry and derived `TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACES` from it to preserve canonical deterministic ordering.
2. Updated all kernel/effect emitters to use registry constants (no raw surface literals), and expanded test updates to include `effect-error-contracts` and `turn-flow-runtime-invariants` so parity and helper call sites stay covered.
3. Follow-up architecture refinement: moved active-seat surface IDs into a dedicated contract module (`turn-flow-active-seat-invariant-surfaces.ts`) and removed `runtime-error` as a passthrough export surface for these IDs.
