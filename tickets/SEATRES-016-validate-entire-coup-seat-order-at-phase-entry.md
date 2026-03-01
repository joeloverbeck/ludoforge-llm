# SEATRES-016: Validate entire coup seat order at phase entry

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — card-driven coup phase entry/runtime invariant validation
**Deps**: archive/tickets/SEATRES-010-remove-runtime-numeric-seat-fallback-and-fail-fast-on-unresolvable-active-seat.md

## Problem

Coup phase entry currently validates only the first seat in `coupSeatOrder`. Invalid later seats or duplicate seats are discovered only after progression begins, producing delayed failures and weaker diagnostics.

## Assumption Reassessment (2026-03-01)

1. `applyCoupPhaseEntryReset()` checks only `firstSeat` resolvability before entering coup state.
2. Later invalid seats currently fail downstream (for example in implicit pass progression) rather than at coup entry.
3. Current tests cover first-seat failure but do not assert full-order upfront validation.
4. This work is not covered by active tickets `SEATRES-011` through `SEATRES-014`.

## Architecture Check

1. Upfront whole-order validation is cleaner: state either enters coup mode with a valid canonical order or fails immediately with precise diagnostics.
2. The rule is game-agnostic and runtime-contract based; no game-specific logic leaks into engine.
3. No compatibility aliases are introduced.

## What to Change

### 1. Validate full coup seat order before state transition

1. In `applyCoupPhaseEntryReset()`, validate every seat in `coupSeatOrder` resolves canonically.
2. Reject duplicate seat entries deterministically.
3. Produce deterministic `RUNTIME_CONTRACT_INVALID` error messages that identify invalid seat token(s) and/or duplicates.

### 2. Keep coup progression logic simple by relying on validated entry state

1. Preserve downstream progression behavior, but ensure entry invariants guarantee valid seat order before any implicit-pass iteration.
2. Avoid late invariant surprises in `coupPhaseImplicitPass()` caused by invalid entry seat lists.

## Files to Touch

- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/test/unit/phase-advance.test.ts` (modify/add)
- `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` (modify/add if coup scenarios exist)

## Out of Scope

- Turn-flow non-coup phase semantics
- SeatCatalog compiler diagnostics
- Runtime performance index deduplication work

## Acceptance Criteria

### Tests That Must Pass

1. Coup entry fails immediately when any `coupSeatOrder` seat cannot resolve canonically.
2. Coup entry fails immediately on duplicate `coupSeatOrder` entries.
3. Valid coup seat orders preserve existing behavior.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Coup phases never start with partially valid or duplicate seat orders.
2. Runtime errors for coup seat-order contract violations are deterministic and front-loaded at entry.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/phase-advance.test.ts` — unresolved non-first coup seat fails at entry.
2. `packages/engine/test/unit/phase-advance.test.ts` — duplicate coup seat entry fails at entry.
3. `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` — canonical coup flow parity remains stable.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/phase-advance.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-turn-flow-golden.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
