# SEATRES-030: Strictly type active-seat invariant surfaces

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — runtime error contract typing for active-seat invariant metadata
**Deps**: archive/tickets/SEATRES-017-unify-seat-contract-runtime-errors-across-kernel-and-effects.md

## Problem

The active-seat invariant metadata currently types `surface` as a plain `string`, which allows typoed/unknown surface identifiers to compile and weakens deterministic diagnostics for runtime tooling.

## Assumption Reassessment (2026-03-02)

1. `TurnFlowActiveSeatInvariantContext` is currently defined in `runtime-error.ts` with `surface: string`.
2. Current callers pass known literals (`isActiveSeatEligibleForTurnFlow`, `applyGrantFreeOperation`), but there is no compile-time guard against drift/typos.
3. Existing active tickets `SEATRES-018` through `SEATRES-029` do not enforce strict literal typing for invariant surface identifiers.

## Architecture Check

1. A closed union for active-seat invariant surface IDs is cleaner and more robust than open strings because it enforces contract correctness at compile time.
2. This is fully game-agnostic metadata hygiene in kernel/effect error contracts; no game-specific behavior enters GameDef/runtime.
3. No backwards-compat alias layer is introduced; invalid/unknown surface identifiers become type errors.

## What to Change

### 1. Introduce canonical surface ID type for active-seat invariant

1. Define/export a literal union type (or canonical readonly list) of valid active-seat invariant surfaces.
2. Replace `surface: string` in `TurnFlowActiveSeatInvariantContext` with the canonical surface type.

### 2. Align helper/callers/tests to strict surface typing

1. Update `makeActiveSeatUnresolvableInvariantContext(...)` and all call sites to use typed surface IDs.
2. Add contract tests that fail if an unsupported surface identifier is introduced.

## Files to Touch

- `packages/engine/src/kernel/runtime-error.ts` (modify)
- `packages/engine/src/kernel/turn-flow-runtime-invariants.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify/add)

## Out of Scope

- Seat-resolution lifecycle optimization (`SEATRES-018`, `SEATRES-019`)
- Validator seat-canonicality work (`SEATRES-029`)
- Turn-flow performance optimization

## Acceptance Criteria

### Tests That Must Pass

1. Active-seat invariant `surface` values are compile-time constrained to canonical literals.
2. Existing active-seat invariant emitters continue producing deterministic metadata and messages.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Active-seat invariant metadata contract remains deterministic and strongly typed.
2. Kernel/effect runtime remains game-agnostic and alias-free.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — assert canonical surface typing contract and runtime metadata shape parity.
2. `packages/engine/test/unit/effects-turn-flow.test.ts` — assert effect emitter still exposes valid canonical surface metadata.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
3. `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
