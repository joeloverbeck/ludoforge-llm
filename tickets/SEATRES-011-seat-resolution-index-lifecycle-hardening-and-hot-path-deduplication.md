# SEATRES-011: Seat-resolution index lifecycle hardening and hot-path deduplication

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel seat-resolution API and callers in turn-flow/coup/legal-move paths
**Deps**: archive/tickets/SEATRES-010-remove-runtime-numeric-seat-fallback-and-fail-fast-on-unresolvable-active-seat.md

## Problem

Current runtime seat resolution rebuilds `SeatResolutionIndex` repeatedly in hot paths and re-runs nested lookups across the same `(def, playerCount)` context. This increases complexity and avoidable overhead in turn-flow/legal-move evaluation loops.

## Assumption Reassessment (2026-03-01)

1. `resolvePlayerIndexForTurnFlowSeat()` currently constructs a fresh index each call.
2. `resolveTurnFlowSeatForPlayerIndex()` loops seats and repeatedly invokes seat resolution, compounding rebuild cost.
3. Callers (`turn-flow-eligibility`, `phase-advance`, `legal-moves-turn-order`, `effects-turn-flow`) invoke these helpers in high-frequency paths.
4. Existing tests verify correctness but do not lock a single-build-per-context lifecycle for seat resolution.
5. Active tickets `SEATRES-006`, `SEATRES-007`, and `SEATRES-008` do not cover performance/lifecycle deduplication of seat-resolution indexes.

## Architecture Check

1. Passing a prebuilt immutable index through callers is cleaner than hidden rebuilds inside leaf helpers.
2. This improves extensibility: future seat metadata lookups can reuse the same context object without duplicate recomputation.
3. Change remains game-agnostic and does not embed game-specific data/logic.
4. No fallback compatibility or alias shims are introduced.

## What to Change

### 1. Refactor seat-resolution API to support context reuse

1. Add helpers that accept a prebuilt `SeatResolutionIndex` for repeated lookups.
2. Keep API surface explicit about when index construction occurs (builder vs resolver responsibilities).

### 2. Update hot-path callers to build once and reuse

1. Build index once per relevant runtime operation (for example per turn-flow legality/apply step).
2. Thread index through repeated seat lookups instead of invoking per-call builders.
3. Preserve existing semantics and diagnostics.

### 3. Add regression coverage for lifecycle discipline

1. Add focused tests that validate new resolver signatures and lookup parity against existing behavior.
2. Add lightweight perf-oriented regression test(s) that assert no repeated rebuilding inside critical helper loops (for example via instrumentation/spies in unit scope).

## Files to Touch

- `packages/engine/src/kernel/seat-resolution.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify, if lookup reuse applies)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify, if lookup reuse applies)
- `packages/engine/test/unit/kernel/seat-resolution.test.ts` (modify/add)
- `packages/engine/test/unit/phase-advance.test.ts` (modify/add if helper-threading changes)

## Out of Scope

- Changing seat identity semantics
- Adding game-specific optimization paths
- Runner/UI concerns

## Acceptance Criteria

### Tests That Must Pass

1. Seat-resolution behavior remains identical while index construction occurs once per caller context.
2. No repeated hidden seat-index rebuild loops remain in updated hot paths.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Seat-resolution responsibilities are explicit: build index once, reuse everywhere in operation scope.
2. Runtime remains deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/seat-resolution.test.ts` — resolver parity tests for prebuilt-index APIs.
Rationale: ensures refactor preserves functional outcomes.
2. `packages/engine/test/unit/phase-advance.test.ts` — verifies updated callers still resolve coup seat progression correctly.
Rationale: protects key control-flow path while deduplicating lookup work.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/seat-resolution.test.js`
3. `node --test packages/engine/dist/test/unit/phase-advance.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
