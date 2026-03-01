# SEATRES-004: Unified seat identity contract module for compiler surfaces

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler architecture boundary (`compiler-core.ts`, `cross-validate.ts`, new shared contract module, diagnostics, tests)
**Deps**: archive/tickets/SEATRES-002-canonical-seat-identity-source.md, tickets/SEATRES-003-seat-regression-guards-and-context-dryness.md

## Problem

Seat identity is still derived/consumed differently across compiler surfaces:

1. Selector lowering currently uses canonical seat ids derived in compiler core.
2. Cross-surface validations (victory/event seat references) still validate against raw `turnFlow.eligibility.seats`.
3. Contract errors can leak as late generic failures (`PLAYER_SELECTOR_ID_OUT_OF_BOUNDS`) rather than explicit seat-contract diagnostics.

This keeps seat behavior functional but not architecturally unified.

## Assumption Reassessment (2026-03-01)

1. `compiler-core.ts` now derives canonical selector seat ids, but cross-validation independently builds seat targets from turn-flow seats.
2. `cross-validate.ts` currently has no shared seat-contract input from compiler core.
3. Existing active tickets do not currently cover creation of a shared seat-identity contract module consumed by both lowering and cross-validation.

## Architecture Check

1. A single shared seat-identity contract module is cleaner than duplicating seat logic in multiple compiler subsystems.
2. This remains game-agnostic: the module interprets schema-level seat surfaces, not game rules.
3. No compatibility shims: invalid seat-contract shapes should emit explicit compiler diagnostics.

## What to Change

### 1. Add a shared compiler seat-identity contract module

Create a neutral compiler-shared module (for example `packages/engine/src/cnl/seat-identity-contract.ts`) that derives and returns:

1. canonical selector seat ids
2. canonical seat reference ids for cross-surface validations
3. resolved seat contract mode metadata (for deterministic diagnostics/tests)

### 2. Make compiler-core and cross-validate consume the same contract output

1. Replace ad hoc seat derivation in `compiler-core.ts` with contract output.
2. Thread seat-contract output into cross-validation so victory/event/reference checks use the same identity policy as selector lowering.

### 3. Add explicit compiler diagnostics for seat-contract incoherence

Emit a dedicated compiler diagnostic when seat surfaces are structurally incoherent (for example index-mode count mismatch that would otherwise fail as generic player-id bounds).

## Files to Touch

- `packages/engine/src/cnl/seat-identity-contract.ts` (new)
- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/src/cnl/cross-validate.ts` (modify)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify)
- `packages/engine/test/unit/cross-validate.test.ts` (modify/add)

## Out of Scope

- Enforcing one global seat namespace across all game specs (handled separately)
- Runtime/kernel turn-flow execution semantics changes
- Runner visual-config behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Selector lowering and cross-validation consume the same seat-identity contract output.
2. Incoherent seat contract inputs fail with explicit seat-contract diagnostic (not only generic bounds errors).
3. Existing suite: `pnpm turbo test`

### Invariants

1. Compiler seat identity policy has one source of truth.
2. GameDef/runtime remain game-agnostic and free of game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-structured-results.test.ts` — assert deterministic seat-contract diagnostics for incoherent seat surfaces.
2. `packages/engine/test/unit/cross-validate.test.ts` — assert seat reference validation uses shared contract output (not independent ad hoc targets).

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `node --test packages/engine/dist/test/unit/cross-validate.test.js`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
