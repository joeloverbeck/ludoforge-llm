# FITLRULES2-008: Production Runtime Option-Matrix Enforcement Tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only hardening
**Deps**: FITLRULES2-007

## Problem

Current option-matrix tests cover synthetic defs well and now check production matrix row presence, but do not yet assert production runtime second-eligible behavior across Rule 2.3.4 branches.

## Assumption Reassessment (2026-02-23)

1. Production FITL `turnFlow.optionMatrix` now contains the three Rule 2.3.4 rows.
2. Existing production compile assertions do not guarantee runtime legal-move gating behavior.
3. Mismatch: data-contract test exists, runtime-contract test for production path is incomplete.

## Architecture Check

1. Runtime contract tests on production data reduce regression risk at the architecture boundary (data policy -> generic kernel behavior).
2. This preserves agnostic engine boundaries by validating behavior via generic APIs (`initialState`, `legalMoves`, `applyMove`) without game-specific kernel branches.
3. No compatibility shims; tests lock in strict declared behavior.

## What to Change

### 1. Expand production option-matrix integration tests

Add production runtime cases that execute a first-eligible action class and assert second-eligible legal action classes exactly match matrix policy (+ `pass`).

### 2. Add interrupt regression assertion

Keep/add a guard that interrupt-phase actions are not blocked by option-matrix filtering.

## Files to Touch

- `packages/engine/test/integration/fitl-option-matrix.test.ts` (modify)
- `packages/engine/test/integration/fitl-commitment-phase.test.ts` (modify, if needed for regression lock)

## Out of Scope

- New FITL rules data changes.
- Kernel behavior changes unrelated to option-matrix/interrupt interaction.

## Acceptance Criteria

### Tests That Must Pass

1. Production runtime: first=`event` => second allows only operation/op+SA (+pass).
2. Production runtime: first=`operation` => second allows only limitedOperation (+pass).
3. Production runtime: first=`operationPlusSpecialActivity` => second allows limitedOperation/event (+pass).
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Production runtime legal moves reflect declared option matrix exactly.
2. Interrupt-phase move legality does not depend on first/second eligible matrix state.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-option-matrix.test.ts` — add production runtime branch assertions.
2. `packages/engine/test/integration/fitl-commitment-phase.test.ts` — preserve regression coverage for interrupt-phase legality.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`
