# SEATRES-010: Remove runtime numeric-seat fallback and fail fast on unresolvable active seat

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel seat resolution, turn-flow/coup/free-op runtime invariant handling
**Deps**: archive/tickets/SEATRES-005-strict-single-seat-namespace-and-spec-migration.md

## Problem

Runtime seat resolution still includes numeric fallback and multiple `String(activePlayer)` fallbacks when canonical seat resolution fails. This silently reintroduces aliasing and can mask invalid runtime state.

## Assumption Reassessment (2026-03-01)

1. `resolvePlayerIndexForSeatValue()` still falls back to numeric parsing.
2. `resolvePlayerIndexForTurnFlowSeat()` and `resolveTurnFlowSeatForPlayerIndex()` preserve numeric/index fallback paths.
3. Several card-driven runtime paths still fallback to `String(activePlayer)` when seat resolution fails (`turn-flow-eligibility`, `legal-moves-turn-order`, `effects-turn-flow`, `phase-advance`).
4. Existing tests pass under current behavior but do not enforce strict fail-fast invariants for unresolved active seats.
5. Active tickets `SEATRES-006`, `SEATRES-007`, and `SEATRES-008` do not explicitly remove runtime numeric fallback or fallback-to-string behavior.

## Architecture Check

1. Runtime must enforce the same strict seat identity contract as compiler surfaces; otherwise architecture is internally inconsistent.
2. Failing fast on invariant breach is cleaner than auto-fallback because it preserves determinism and observability of invalid state.
3. This remains game-agnostic: invariant checks are generic seat-contract enforcement, not game-specific branching.
4. No backwards compatibility aliasing is retained.

## What to Change

### 1. Remove numeric seat aliasing in kernel resolution

1. Eliminate numeric fallback from runtime seat resolution helpers used by turn-flow and coup logic.
2. Ensure resolution APIs return `null` for unresolved/non-canonical seat tokens rather than reinterpret indexes.

### 2. Fail fast when active seat cannot be resolved in card-driven runtime paths

1. Replace `?? String(activePlayer)` fallbacks with explicit runtime invariant errors in card-driven contexts.
2. Apply across:
   - turn-flow eligibility/apply/consume paths
   - free-operation move filtering
   - turn-flow effect grant resolution
   - coup seat progression paths
3. Keep non-card-driven behavior unchanged.

### 3. Add strict runtime invariant tests

1. Add targeted tests that construct intentionally malformed card-driven state and assert deterministic invariant errors.
2. Add parity tests ensuring valid canonical seat states continue to pass existing behavior.

## Files to Touch

- `packages/engine/src/kernel/seat-resolution.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/test/unit/kernel/seat-resolution.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add)
- `packages/engine/test/unit/phase-advance.test.ts` (modify/add)
- `packages/engine/test/integration/*turn-flow*.test.ts` (modify only where strict invariant behavior changes expected diagnostics)

## Out of Scope

- SeatCatalog contract introduction
- Compiler selector shape parity work
- Seat-resolution performance optimization/caching

## Acceptance Criteria

### Tests That Must Pass

1. Runtime no longer resolves seat identity via numeric index fallback in card-driven paths.
2. Card-driven paths throw deterministic invariant errors when active seat cannot be resolved.
3. Valid canonical seat flows remain behaviorally stable.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Compiler and runtime share strict no-alias seat identity semantics.
2. Invalid card-driven seat state fails fast; no silent fallback to numeric/player-index string.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/seat-resolution.test.ts` — remove expectations that numeric fallback resolves seat identity.
Rationale: locks runtime helper policy to strict canonical behavior.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — assert unresolved active seat in card-driven mode surfaces invariant errors.
Rationale: prevents silent legality drift under malformed runtime state.
3. `packages/engine/test/unit/phase-advance.test.ts` — assert coup seat progression fails deterministically on unresolved seat mapping.
Rationale: protects phase progression from hidden fallback behavior.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/seat-resolution.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `node --test packages/engine/dist/test/unit/phase-advance.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
