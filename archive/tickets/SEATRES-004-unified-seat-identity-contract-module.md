# SEATRES-004: Unified seat identity contract module for compiler surfaces

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler architecture boundary (`compiler-core.ts`, `cross-validate.ts`, new shared contract module, diagnostics, tests)
**Deps**: archive/tickets/SEATRES-002-canonical-seat-identity-source.md, archive/tickets/SEATRES-003-seat-regression-guards-and-context-dryness.md

## Problem

Seat identity is still derived/consumed differently across compiler surfaces:

1. Selector lowering currently uses canonical seat ids derived in compiler core.
2. Cross-surface validations (victory/event seat references) still validate against raw `turnFlow.eligibility.seats`.
3. Contract errors can leak as late generic failures (`PLAYER_SELECTOR_ID_OUT_OF_BOUNDS`) rather than explicit seat-contract diagnostics.

This keeps seat behavior functional but not architecturally unified.

## Assumption Reassessment (2026-03-01)

1. `compiler-core.ts` now derives canonical selector seat ids, but cross-validation independently builds seat targets from turn-flow seats.
2. `cross-validate.ts` currently has no shared seat-contract input from compiler core.
3. Existing tests already cover selector-seat canonicalization inside `compiler-core.ts` (`compiler-structured-results.test.ts`), but they do **not** enforce that cross-validation consumes the same canonical seat identity source.
4. Existing active tickets do not currently cover creation of a shared seat-identity contract module consumed by both lowering and cross-validation.

## Architecture Check

1. A single shared seat-identity contract module is cleaner than duplicating seat logic in multiple compiler subsystems.
2. This remains game-agnostic: the module interprets schema-level seat surfaces, not game rules.
3. No compatibility shims: invalid seat-contract shapes should emit explicit compiler diagnostics.
4. Current mismatch symptoms are broader than one error code; they can surface as `CNL_COMPILER_PLAYER_SELECTOR_INVALID` (compile-time) and/or downstream bounds/identity failures. The fix target is unified contract semantics, not a single diagnostic substitution.
5. Seat identity has two explicit compiler domains that should be modeled, not conflated:
   - selector-lowering domain (`selectorSeatIds`) may canonicalize index seats to named piece-catalog seats
   - seat-reference/xref domain (`referenceSeatIds`) follows turn-flow seat ids used by event/victory seat references

## What to Change

### 1. Add a shared compiler seat-identity contract module

Create a neutral compiler-shared module (for example `packages/engine/src/cnl/seat-identity-contract.ts`) that derives and returns:

1. canonical selector seat ids (`selectorSeatIds`)
2. canonical seat reference ids for cross-surface validations (`referenceSeatIds`)
3. resolved seat contract mode metadata (for deterministic diagnostics/tests)

### 2. Make compiler-core and cross-validate consume the same contract output

1. Replace ad hoc seat derivation in `compiler-core.ts` with contract output.
2. Thread seat-contract output into cross-validation so victory/event/reference checks use the same identity policy as selector lowering.

### 3. Add explicit compiler diagnostics for seat-contract incoherence

Emit a dedicated compiler diagnostic when seat surfaces are structurally incoherent (for example index-mode count mismatch between `turnFlow.eligibility.seats` and piece-catalog seats), instead of relying on incidental selector/bounds failures later in the pipeline.

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
2. `packages/engine/test/unit/cross-validate.test.ts` — assert seat reference validation uses shared contract output (not independent ad hoc targets), including index-seat turn-flow + named piece-catalog seat references.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `node --test packages/engine/dist/test/unit/cross-validate.test.js`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-01
- **What Changed**:
  - Added shared seat contract module at `packages/engine/src/cnl/seat-identity-contract.ts`.
  - Replaced local seat derivation in `compiler-core.ts` with the shared contract output.
  - Threaded shared seat contract into `cross-validate.ts` so cross-validation seat targets come from contract output instead of ad hoc derivation.
  - Added explicit diagnostic code `CNL_COMPILER_SEAT_IDENTITY_CONTRACT_INCOHERENT` and emit logic for index-seat/piece-catalog count mismatch.
  - Strengthened tests in:
    - `packages/engine/test/unit/compiler-structured-results.test.ts`
    - `packages/engine/test/unit/cross-validate.test.ts`
    - `packages/engine/test/integration/compile-pipeline.test.ts` (fixture coherence fix)
- **Deviations From Original Plan**:
  - Seat identity was split into two explicit contract domains:
    - `selectorSeatIds` for selector lowering
    - `referenceSeatIds` for seat-reference cross-validation
  - This avoids conflating selector canonicalization with turn-flow-authored seat reference semantics while still centralizing policy in one module.
- **Verification Results**:
  - `pnpm turbo build` passed
  - `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js` passed
  - `node --test packages/engine/dist/test/unit/cross-validate.test.js` passed
  - `node --test packages/engine/dist/test/integration/compile-pipeline.test.js` passed
  - `pnpm -F @ludoforge/runner test test/config/visual-config-files.test.ts` passed
  - `pnpm turbo test` passed
  - `pnpm turbo typecheck` passed
  - `pnpm turbo lint` passed
