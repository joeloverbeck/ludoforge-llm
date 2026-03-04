# ENGINEARCH-162: Harden Free-Operation Monsoon Contract Tests (Positive + Negative)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — integration test coverage only
**Deps**: tickets/ENGINEARCH-161-monsoon-window-filter-after-free-op-variants.md

## Problem

Current monsoon grant coverage only asserts the positive path (`allowDuringMonsoon: true`) and misses the negative case, leaving policy regressions undetected.

## Assumption Reassessment (2026-03-04)

1. Verified existing integration coverage includes monsoon allow-path assertion.
2. Verified no complementary disallow-path assertion for the same restricted action setup.
3. Mismatch: test title implies exclusivity (“only when”) but does not prove it; corrected scope adds explicit negative assertion.

## Architecture Check

1. Tight policy tests improve robustness without adding runtime complexity.
2. Preserves agnostic engine boundaries by testing generic turn-flow behavior, not FITL-specific branching.
3. No compatibility shims; this is stricter contract testing.

## What to Change

### 1. Add negative monsoon free-op assertion

Create a near-identical test setup without `allowDuringMonsoon` and assert restricted move remains blocked during monsoon.

### 2. Keep positive assertion adjacent

Retain and pair positive assertion to document intended policy boundary.

## Files to Touch

- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Runtime refactors (handled by ENGINEARCH-161).
- Card-specific FITL logic updates.

## Acceptance Criteria

### Tests That Must Pass

1. Negative-path test: no monsoon free-op bypass when flag absent.
2. Positive-path test: bypass exists when flag present.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Test names and assertions fully match stated behavior.
2. Monsoon policy remains explicit and deterministic under generated free-op moves.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add disallow case for monsoon-restricted free-op grants.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `pnpm -F @ludoforge/engine test`
