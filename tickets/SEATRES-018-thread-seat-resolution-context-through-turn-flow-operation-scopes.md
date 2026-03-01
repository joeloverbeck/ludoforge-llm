# SEATRES-018: Thread seat-resolution context through turn-flow operation scopes

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel seat-resolution API ergonomics and turn-flow eligibility/runtime call chains
**Deps**: archive/tickets/SEATRES-011-seat-resolution-index-lifecycle-hardening-and-hot-path-deduplication.md

## Problem

SEATRES-011 removed hidden index construction from resolver helpers, but several turn-flow operation paths still build `SeatResolutionIndex` independently inside adjacent helper calls. This keeps lifecycle discipline partially convention-based and leaves avoidable rebuilds inside the same logical operation scope.

## Assumption Reassessment (2026-03-01)

1. `seat-resolution` now requires explicit prebuilt indexes for seat lookups.
2. `turn-flow-eligibility` still builds indexes in multiple nearby helpers (`withActiveFromFirstEligible`, `resolveCardSeatOrder`, `parsePlayerId`) instead of threading one operation-scoped context.
3. Active tickets `SEATRES-012` through `SEATRES-017` do not cover seat-resolution context threading/lifecycle reuse in these paths.

## Architecture Check

1. A small explicit seat-resolution context (`build once, pass through`) is cleaner than repeating local builder calls in each helper.
2. This keeps engine logic game-agnostic: context contains canonical seat-index data only, with no game-specific branching.
3. No compatibility aliases/shims are introduced; callers must adopt explicit context ownership.

## What to Change

### 1. Introduce operation-scoped seat-resolution context APIs

1. Add a lightweight context type/helper in `seat-resolution.ts` that wraps `SeatResolutionIndex` construction for operation scope reuse.
2. Keep resolver APIs explicit about consuming the context/index rather than `(def, playerCount)` primitives.

### 2. Thread context through turn-flow eligibility call chains

1. Refactor internal helper signatures in `turn-flow-eligibility.ts` so related operations share one prebuilt context.
2. Remove remaining intra-operation duplicate `buildSeatResolutionIndex(...)` calls.
3. Preserve deterministic runtime behavior and current strict seat contract semantics.

## Files to Touch

- `packages/engine/src/kernel/seat-resolution.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add if call-chain behavior assertions are needed)
- `packages/engine/test/unit/kernel/seat-resolution.test.ts` (modify/add)

## Out of Scope

- Seat-catalog compiler cross-validation work
- Coup seat-order strictness improvements (tracked separately)
- Runtime error shape unification across kernel/effects

## Acceptance Criteria

### Tests That Must Pass

1. Turn-flow eligibility operation paths build seat-resolution context once per operation scope and reuse it across helper lookups.
2. Existing behavior for valid canonical seat flows remains unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Seat-resolution lifecycle ownership is explicit at operation boundaries.
2. GameDef/runtime remain game-agnostic with no game-specific seat logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/seat-resolution.test.ts` — context/index API parity coverage for resolver outcomes.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — turn-flow call-chain regression coverage to ensure behavioral parity after context threading.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/seat-resolution.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
