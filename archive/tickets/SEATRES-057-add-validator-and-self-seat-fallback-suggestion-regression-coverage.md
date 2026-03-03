# SEATRES-057: Add validator and self-seat fallback suggestion regression coverage

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL test coverage only
**Deps**: archive/tickets/SEATRES-042-clarify-seat-reference-diagnostic-suggestion-wording.md

## Problem

Seat-reference fallback suggestion wording is now centralized, but current tests do not fully lock fallback behavior for all seat-reference diagnostic paths. This leaves a regression gap where wording drift can reappear without failing tests.

## Assumption Reassessment (2026-03-03)

1. Compiler path fallback wording for `CNL_COMPILER_SEAT_REF_MISSING` is already asserted in `packages/engine/test/unit/compiler-structured-results.test.ts`.
2. Cross-validator path already asserts fallback wording for `CNL_XREF_TURN_FLOW_ELIGIBILITY_SEAT_MISSING` (`Use one of the declared seat ids.`), but `CNL_XREF_EVENT_DECK_GRANT_EXECUTE_AS_SEAT_MISSING` currently exercises only a `Did you mean ...` branch.
3. Validator scenario seat-reference tests in `packages/engine/test/unit/validate-spec-scenario.test.ts` currently assert code/path behavior but do not assert fallback suggestion text (`Use one of the declared seat ids from the selected seat catalog.`) for no-alternative seat misses.
4. No active ticket in `tickets/` currently scopes these specific fallback-suggestion regression gaps.

## Reassessed Scope (2026-03-03)

1. This ticket remains test-only and should not modify diagnostic production code.
2. Coverage additions should lock two no-alternative branches only:
   - Validator scenario seat-reference missing diagnostics (`CNL_VALIDATOR_REFERENCE_MISSING` with selected-seat-catalog fallback).
   - Xref `executeAsSeat` seat-reference missing diagnostics (`CNL_XREF_EVENT_DECK_GRANT_EXECUTE_AS_SEAT_MISSING` with self-or-seat fallback).
3. Keep existing `Did you mean ...` branch tests intact to preserve both branch contracts.

## Architecture Check

1. Locking fallback suggestion behavior at test level keeps centralized diagnostic policy robust against drift while preserving deterministic diagnostics.
2. This work is test-only and keeps GameSpecDoc (game-specific) separate from GameDef/simulator runtime logic (agnostic).
3. No backward-compatibility aliases or shims; this strengthens canonical contracts only.

## What to Change

### 1. Add validator fallback suggestion assertion coverage

In scenario validator tests, use a seat id value that avoids alternative matching and assert the exact fallback suggestion text for `CNL_VALIDATOR_REFERENCE_MISSING` seat-reference diagnostics (`Use one of the declared seat ids from the selected seat catalog.`).

### 2. Add executeAsSeat fallback suggestion branch coverage

In cross-validator tests, add a case for unknown `executeAsSeat` with no close alternatives so `CNL_XREF_EVENT_DECK_GRANT_EXECUTE_AS_SEAT_MISSING` must use the fallback suggestion (`Use "self" or one of the declared seat ids.`).

## Files to Touch

- `packages/engine/test/unit/validate-spec-scenario.test.ts` (modify)
- `packages/engine/test/unit/cross-validate.test.ts` (modify)

## Out of Scope

- Diagnostic code changes
- Runtime/simulator behavior changes
- Additional diagnostic wording refactors

## Acceptance Criteria

### Tests That Must Pass

1. Validator seat-reference diagnostics assert exact fallback wording when alternatives are unavailable.
2. Cross-validator executeAsSeat diagnostics assert exact fallback wording when alternatives are unavailable.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Diagnostic fallback wording remains deterministic and centralized.
2. GameDef and simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-spec-scenario.test.ts` — assert seat-reference fallback suggestion text in no-alternative scenario. Rationale: prevents silent wording drift in validator path.
2. `packages/engine/test/unit/cross-validate.test.ts` — assert executeAsSeat fallback suggestion text in no-alternative scenario. Rationale: ensures fallback branch is covered, not only `Did you mean` branch.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js`
3. `node --test packages/engine/dist/test/unit/cross-validate.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-03
- **What Changed**:
  - Updated `packages/engine/test/unit/validate-spec-scenario.test.ts` to cover no-alternative scenario seat-reference diagnostics and assert fallback suggestion text for all scenario seat paths.
  - Updated `packages/engine/test/unit/cross-validate.test.ts` to add a no-close-alternative `executeAsSeat` case and assert fallback suggestion `Use "self" or one of the declared seat ids.` with no alternatives payload.
  - Updated this ticket’s assumptions/scope before implementation to reflect exact current fallback strings and branch coverage state.
- **Deviations from Original Plan**:
  - No implementation-scope deviation; scope remained test-only.
  - Verification was strengthened by also running `pnpm turbo lint`.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js` passed.
  - `node --test packages/engine/dist/test/unit/cross-validate.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo lint` passed.
