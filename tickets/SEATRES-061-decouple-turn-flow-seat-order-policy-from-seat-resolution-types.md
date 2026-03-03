# SEATRES-061: Decouple turn-flow seat-order policy contract from seat-resolution types

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel policy contract typing + validator/runtime call sites
**Deps**: archive/tickets/SEATRES/SEATRES-027-enforce-card-seat-order-uniqueness-and-cardinality.md, archive/tickets/SEATRES/SEATRES-048-centralize-card-seat-order-cardinality-policy.md

## Problem

`turn-flow-seat-order-policy.ts` currently imports `SeatOrderShapeAnalysis` from `seat-resolution.ts` only for type coupling. This makes a policy-contract module depend on seat-resolution internals and weakens layer boundaries for future reuse.

## Assumption Reassessment (2026-03-03)

1. `packages/engine/src/kernel/turn-flow-seat-order-policy.ts` currently imports `SeatOrderShapeAnalysis` from `seat-resolution.ts`.
2. Validator/runtime call sites only need `distinctSeatCount` for cardinality policy checks; they do not require full seat-resolution typing.
3. Existing active tickets do not currently scope removing this type-level coupling for the new policy module.

## Architecture Check

1. A policy contract module should be a dependency leaf; using primitive/minimal local types is cleaner and reduces accidental cross-module drift.
2. This is pure kernel-internal architecture hardening and does not introduce any game-specific logic; GameDef/runtime remain game-agnostic.
3. No backwards-compatibility shims are introduced; only call signatures are tightened to reflect actual contract needs.

## What to Change

### 1. Remove policy-module dependency on `seat-resolution`

1. Change policy helper input from a `Pick<SeatOrderShapeAnalysis, 'distinctSeatCount'>` object to a primitive `distinctSeatCount: number` (or a local minimal shape type declared in the policy module).
2. Remove `seat-resolution` import from policy module.

### 2. Update call sites and tests

1. Update validator/runtime invariant call sites to pass only the required value.
2. Ensure existing tests continue passing and add/adjust a unit test if needed to lock the decoupled helper contract.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-seat-order-policy.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify)
- `packages/engine/src/kernel/turn-flow-runtime-invariants.ts` (modify)
- `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts` (modify/add if needed)

## Out of Scope

- Structured runtime context payload work (tracked by `tickets/SEATRES-049-add-structured-runtime-context-for-card-seat-order-shape-invariant.md`)
- Boundary-path card seat-order coverage expansion (tracked by `tickets/SEATRES-050-add-boundary-and-mapping-collapse-contract-tests-for-card-seat-order-shape.md`)

## Acceptance Criteria

### Tests That Must Pass

1. `turn-flow-seat-order-policy.ts` no longer imports types from `seat-resolution.ts`.
2. Validator/runtime cardinality behavior remains unchanged while using decoupled policy contract input.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Shared policy modules remain dependency-light and reusable across compile/runtime boundaries.
2. Card seat-order cardinality enforcement remains single-source and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts` — confirm runtime invariant behavior unchanged after decoupled policy helper signature.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/turn-flow-runtime-invariants.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck && pnpm turbo lint`
