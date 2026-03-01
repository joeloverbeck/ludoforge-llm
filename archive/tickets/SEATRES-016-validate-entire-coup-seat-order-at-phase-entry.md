# SEATRES-016: Validate entire coup seat order at phase entry

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — card-driven coup phase entry/runtime invariant validation
**Deps**: archive/tickets/SEATRES-010-remove-runtime-numeric-seat-fallback-and-fail-fast-on-unresolvable-active-seat.md

## Problem

Coup phase entry currently validates only the first seat in `coupSeatOrder`. Invalid later seats or duplicate seats are discovered only after progression begins, producing delayed failures and weaker diagnostics.

## Assumption Reassessment (2026-03-01)

1. `applyCoupPhaseEntryReset()` currently resolves and validates only `coupSeatOrder[0]` (`firstSeat`), then writes the full seat order into runtime.
2. Later invalid seats currently fail downstream (for example in `coupPhaseImplicitPass()` when `nextSeat` cannot resolve) rather than at coup entry.
3. Current unit coverage in `phase-advance.test.ts` asserts first-seat failure at coup entry, but does not assert entry-time rejection for unresolved non-first seats or duplicates.
4. Archived `SEATRES-011` through `SEATRES-014` do not implement whole-order entry validation.
5. Active `SEATRES-027` targets compile/validation-time card seat-order uniqueness/cardinality and does not replace runtime coup-entry validation for `coupPlan.seatOrder`.

## Architecture Check

1. Upfront whole-order validation is cleaner: coup state is entered only with a fully resolvable, duplicate-free canonical order.
2. This front-loads invariant enforcement and keeps progression paths (`coupPhaseImplicitPass`) focused on progression, not structural error discovery.
3. The rule is runtime-contract based and game-agnostic; no game-specific identifiers or branches are introduced.
4. No compatibility aliases are introduced.

## What to Change

### 1. Validate full coup seat order before state transition

1. In `applyCoupPhaseEntryReset()`, validate every seat in `coupSeatOrder` resolves canonically.
2. Reject duplicate seat entries deterministically.
3. Produce deterministic `RUNTIME_CONTRACT_INVALID` error messages that identify unresolved seat token(s) and duplicate token(s).

### 2. Keep coup progression logic simple by relying on validated entry state

1. Preserve downstream progression behavior, but ensure entry invariants guarantee valid seat order before any implicit-pass iteration.
2. Avoid late invariant surprises in `coupPhaseImplicitPass()` caused by invalid entry seat lists.

## Files to Touch

- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/test/unit/phase-advance.test.ts` (modify/add)
- `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` (modify/add if needed for coup-regression parity)

## Out of Scope

- Turn-flow non-coup phase semantics
- SeatCatalog compiler diagnostics
- Compile-time card seat-order schema changes (handled by other tickets)
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

## Outcome

- Completion date: 2026-03-01
- What changed:
  - Added upfront coup-entry invariant validation in `applyCoupPhaseEntryReset()` to validate all `coupSeatOrder` seats for canonical resolvability and duplicate detection before entering coup runtime state.
  - Replaced first-seat-only failure path with deterministic `RUNTIME_CONTRACT_INVALID` diagnostics that include unresolved and duplicate seat token lists.
  - Expanded `phase-advance` unit coverage with explicit first-seat unresolved, non-first unresolved, and duplicate coup seat-order entry cases.
- Deviations from original plan:
  - `fitl-turn-flow-golden` integration test did not require changes; existing golden behavior remained stable.
  - Runtime error contract message changed from a first-seat-specific string to a whole-order invariant message to align with stricter entry validation.
- Verification results:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/phase-advance.test.js` passed.
  - `node --test packages/engine/dist/test/integration/fitl-turn-flow-golden.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo test` passed on re-run (first run had a transient unrelated runner timeout in `test/bootstrap/resolve-bootstrap-config.test.ts`).
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
