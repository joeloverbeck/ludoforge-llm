# SEATRES-041: Harden seat-reference diagnostic cardinality assertions

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — compiler unit-test strictness
**Deps**: archive/tickets/SEATRES-022-split-compiler-seat-reference-diagnostic-code-from-asset-reference-missing.md

## Problem

Current unit coverage for seat-reference diagnostics checks path presence and code separation but does not assert exact cardinality. Duplicate emissions or unexpected extra seat-reference diagnostics could pass unnoticed.

## Assumption Reassessment (2026-03-03)

1. `compiler-structured-results.test.ts` currently verifies expected seat paths are present for `CNL_COMPILER_SEAT_REF_MISSING`.
2. The test currently does not enforce exact count of seat-reference diagnostics for that scenario.
3. No active ticket in `tickets/` currently targets strict cardinality assertion for this case.

Reassessment result: assumptions still match current code/tests; no scope correction required before implementation.

## Architecture Check

1. Exact-count assertions strengthen deterministic diagnostic contracts and reduce hidden duplication regressions.
2. This is test-only hardening; no game-specific behavior is introduced in agnostic compiler/runtime surfaces.
3. No compatibility aliases/shims; tests target canonical post-split behavior.

## What to Change

### 1. Tighten unit assertions for seat-reference diagnostics

In the existing seat-reference rejection test, assert the exact number of `CNL_COMPILER_SEAT_REF_MISSING` diagnostics expected for the scenario.

### 2. Guard against duplicate path emissions

Assert uniqueness by path for emitted seat-reference diagnostics in that scenario.

## Files to Touch

- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify)

## Out of Scope

- Compiler diagnostic emission refactors
- New diagnostic codes
- Validator test parity

## Acceptance Criteria

### Tests That Must Pass

1. Unit test fails if extra or duplicate `CNL_COMPILER_SEAT_REF_MISSING` diagnostics appear in the target scenario.
2. Unit test still confirms seat paths map to seat-reference code and not asset-reference code.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Seat-reference diagnostics are deterministic in both code and cardinality for the fixture scenario.
2. Diagnostic taxonomy split remains explicit and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-structured-results.test.ts` — strengthen seat-reference test with exact cardinality and path uniqueness checks. Rationale: prevents silent duplicate/extra emission regressions.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`

## Outcome

1. Updated `packages/engine/test/unit/compiler-structured-results.test.ts` to enforce exact `CNL_COMPILER_SEAT_REF_MISSING` cardinality for the fixture scenario.
2. Added explicit uniqueness assertion on seat-reference diagnostic paths and exact expected-path set equality.
3. Preserved existing taxonomy-split assertions to ensure seat misses do not regress to `CNL_COMPILER_DATA_ASSET_REF_MISSING`.
4. Executed planned tests plus lint successfully.
