# SEATRES-042: Clarify seat-reference diagnostic suggestion wording

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — compiler diagnostic wording
**Deps**: archive/tickets/SEATRES-022-split-compiler-seat-reference-diagnostic-code-from-asset-reference-missing.md

## Problem

Seat-reference miss diagnostics currently suggest using “declared seat catalog ids,” which is ambiguous because the failed field is a seat id value, not a data-asset id. This weakens diagnostic precision for users and tooling.

## Assumption Reassessment (2026-03-03)

1. Seat-reference misses currently emit `CNL_COMPILER_SEAT_REF_MISSING` in compiler data-asset derivation flow.
2. The suggestion string for these diagnostics refers to seat catalog ids rather than seat ids.
3. `packages/engine/test/unit/compiler-structured-results.test.ts` currently verifies code/path coverage for these misses, but does not lock suggestion wording.
4. Similar wording exists in other diagnostics (`cross-validate.ts` and `validate-extensions.ts`) under different diagnostic codes; this ticket remains scoped to the compiler data-asset diagnostic only.
5. No active ticket in `tickets/` currently scopes wording precision for `CNL_COMPILER_SEAT_REF_MISSING`.

## Architecture Check

1. Precise diagnostic language improves long-term maintainability and supportability of agnostic compiler contracts.
2. This is message-level refinement only; no game-specific logic leaks into `GameDef` or simulation layers.
3. No backward-compatibility shims; canonical code and contract remain unchanged.

## What to Change

### 1. Update compiler seat-reference suggestion text

Change `CNL_COMPILER_SEAT_REF_MISSING` suggestion text to explicitly reference seat ids (not seat catalog ids) from the selected seat catalog.

### 2. Add targeted assertion for suggestion text

Add or update unit test assertion to lock wording to the corrected seat-id-focused guidance.

## Files to Touch

- `packages/engine/src/cnl/compile-data-assets.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add)

## Out of Scope

- Diagnostic code changes
- Seat-selection algorithm changes
- Validator wording parity

## Acceptance Criteria

### Tests That Must Pass

1. Seat-reference diagnostics suggest using declared seat ids from selected seat catalog (not asset ids).
2. Diagnostic code/path behavior remains unchanged from `SEATRES-022`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Compiler diagnostic semantics stay deterministic and domain-accurate.
2. Compiler remains game-agnostic and free of compatibility aliases.
3. Scope is intentionally limited to `CNL_COMPILER_SEAT_REF_MISSING`; no cross-validator/validator wording changes in this ticket.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-structured-results.test.ts` — assert corrected suggestion wording for a seat-reference miss. Rationale: prevents regression to ambiguous asset-id language.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion Date**: 2026-03-03
- **What Changed**:
  - Updated `CNL_COMPILER_SEAT_REF_MISSING` fallback suggestion in `compile-data-assets.ts` from seat-catalog-id wording to seat-id wording (`Use one of the declared seat ids from the selected seat catalog.`).
  - Strengthened `compiler-structured-results.test.ts` to assert the exact suggestion text for seat-reference misses.
  - Updated the fixture values in that test to an intentionally distant invalid seat id (`invalid-seat-id`) so fallback-suggestion behavior is deterministically exercised (not replaced by fuzzy alternatives).
  - Post-archive refinement: centralized seat-reference fallback suggestion literals in `validate-spec-shared.ts` and replaced duplicate raw strings across compiler/xref/validator call sites (`compile-data-assets.ts`, `cross-validate.ts`, `validate-extensions.ts`) to prevent wording drift.
  - Added cross-validate regression coverage to lock the centralized seat-reference fallback wording on the xref path.
- **Deviations From Original Plan**:
  - Scope clarification was added during reassessment: similar wording exists in cross-validator/validator diagnostics, but this ticket intentionally remained limited to compiler code `CNL_COMPILER_SEAT_REF_MISSING`.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (357/357).
  - `pnpm turbo lint` passed.
