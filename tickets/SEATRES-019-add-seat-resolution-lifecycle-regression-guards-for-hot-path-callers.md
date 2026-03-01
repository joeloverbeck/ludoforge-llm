# SEATRES-019: Add seat-resolution lifecycle regression guards for hot-path callers

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — unit-test instrumentation/regression coverage for seat-resolution lifecycle behavior
**Deps**: archive/tickets/SEATRES-011-seat-resolution-index-lifecycle-hardening-and-hot-path-deduplication.md

## Problem

Current tests primarily verify seat-resolution correctness, but they do not enforce lifecycle discipline at caller boundaries (for example, that hot-path operations do not regress into repeated index builds).

## Assumption Reassessment (2026-03-01)

1. `seat-resolution` resolver correctness is covered, including explicit-index APIs.
2. There is no focused regression test asserting build frequency/lifecycle behavior in hot-path caller operations.
3. Active tickets `SEATRES-012` through `SEATRES-017` do not cover instrumentation-based lifecycle regression guards.

## Architecture Check

1. Lifecycle guard tests prevent accidental architecture regressions while preserving freedom to refactor internals.
2. Coverage is runtime-contract and game-agnostic; no game-specific behavior is introduced in kernel logic.
3. No compatibility paths are added; tests enforce strict forward architecture direction.

## What to Change

### 1. Add focused lifecycle instrumentation tests

1. Add unit tests that instrument/spy on `buildSeatResolutionIndex` in critical caller paths.
2. Assert expected build count per operation scope (single-build expectations where applicable).

### 2. Lock parity alongside lifecycle assertions

1. Pair build-count assertions with existing behavior parity checks so lifecycle hardening does not alter semantics.
2. Ensure tests fail clearly when lifecycle discipline regresses.

## Files to Touch

- `packages/engine/test/unit/kernel/seat-resolution.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add)
- `packages/engine/test/unit/phase-advance.test.ts` (modify/add if lifecycle assertions are added there)
- `packages/engine/src/kernel/seat-resolution.ts` (modify only if test seams/hooks are required)

## Out of Scope

- Changing seat identity semantics
- Seat-catalog compile diagnostics
- Runner visual/model behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Caller-level lifecycle tests fail if hot paths reintroduce repeated index construction within a single operation scope.
2. Existing seat-resolution behavior remains unchanged under lifecycle guard coverage.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Seat-resolution lifecycle expectations are codified in tests, not only comments/convention.
2. Kernel/runtime stay game-agnostic and strict-seat-contract.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/seat-resolution.test.ts` — add lifecycle guard cases around prebuilt-index use and reuse expectations.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — add caller-path lifecycle assertions where turn-flow seat lookups are exercised.
3. `packages/engine/test/unit/phase-advance.test.ts` — add lifecycle assertions for coup/active-seat lookup paths if build-count seams are practical.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/seat-resolution.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `node --test packages/engine/dist/test/unit/phase-advance.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
