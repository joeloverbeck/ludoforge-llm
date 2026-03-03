# SEATRES-057: Add validator and self-seat fallback suggestion regression coverage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL test coverage only
**Deps**: archive/tickets/SEATRES-042-clarify-seat-reference-diagnostic-suggestion-wording.md

## Problem

Seat-reference fallback suggestion wording is now centralized, but current tests do not fully lock fallback behavior for all seat-reference diagnostic paths. This leaves a regression gap where wording drift can reappear without failing tests.

## Assumption Reassessment (2026-03-03)

1. Compiler path fallback wording for `CNL_COMPILER_SEAT_REF_MISSING` is already asserted in `packages/engine/test/unit/compiler-structured-results.test.ts`.
2. Cross-validator path has an added fallback assertion for `CNL_XREF_TURN_FLOW_ELIGIBILITY_SEAT_MISSING`, but `CNL_XREF_EVENT_DECK_GRANT_EXECUTE_AS_SEAT_MISSING` currently exercises only a `Did you mean ...` branch.
3. Validator seat-reference tests in `packages/engine/test/unit/validate-spec-scenario.test.ts` currently assert code/path behavior but do not assert fallback suggestion text for no-alternative seat misses.
4. No active ticket in `tickets/` currently scopes these specific fallback-suggestion regression gaps.

## Architecture Check

1. Locking fallback suggestion behavior at test level keeps centralized diagnostic policy robust against drift while preserving deterministic diagnostics.
2. This work is test-only and keeps GameSpecDoc (game-specific) separate from GameDef/simulator runtime logic (agnostic).
3. No backward-compatibility aliases or shims; this strengthens canonical contracts only.

## What to Change

### 1. Add validator fallback suggestion assertion coverage

In scenario validator tests, use a seat id value that avoids alternative matching and assert the exact fallback suggestion text for `CNL_VALIDATOR_REFERENCE_MISSING` seat-reference diagnostics.

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
