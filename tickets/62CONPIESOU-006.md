# 62CONPIESOU-006: Unit tests for `evalQuery` prioritized variant

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — test files only
**Deps**: archive/tickets/62CONPIESOU-004.md

## Problem

The `evalQuery` handler for `prioritized` needs comprehensive unit test coverage. The spec (section "Required Tests") lists specific query evaluation tests that must pass.

## Assumption Reassessment (2026-03-14)

1. Existing eval-query tests are in `packages/engine/test/unit/eval-query.test.ts`. Confirmed.
2. Tests use `node --test` runner (not Vitest) — engine package convention. Confirmed.
3. Tests create synthetic GameDef/GameState fixtures with minimal zone/token setups. Confirmed by existing test patterns.

## Architecture Check

1. Tests should use synthetic fixtures — no FITL data. This ensures engine-agnosticism of the test coverage.
2. Tests should cover the exact list from the spec's "Unit Tests — Query evaluation" section.
3. Ticket 004 confirmed that `evalQuery` should not expose tier metadata or a `computeTierMembership(...)` helper. This ticket should only cover the pure query-evaluation behavior that actually belongs to `evalQuery`.

## What to Change

### 1. Add `prioritized` evalQuery tests

In `packages/engine/test/unit/eval-query.test.ts` (or a new focused test file if the existing file is large):

**Required test cases (from spec)**:
- `prioritized` with 2 tiers returns concatenated results
- `prioritized` with 3 tiers returns concatenated results in tier order
- `prioritized` with an empty tier returns only results from non-empty tiers
- Combined `maxQueryResults` enforcement applies to the flattened result

**Additional edge cases**:
- `prioritized` with 1 tier behaves like a passthrough
- Shape mismatch across tiers throws (tokens in tier 1, integers in tier 2)
- `qualifierKey` is passed through but does not affect evalQuery behavior (it's for legality only)

## Files to Touch

- `packages/engine/test/unit/eval-query.test.ts` (modify)

## Out of Scope

- Legality tests (ticket 007)
- Integration tests (ticket 009)
- Card 87 (ticket 008)
- Any source file changes
- Performance benchmarks

## Acceptance Criteria

### Tests That Must Pass

1. All 4 spec-required query evaluation tests pass
2. All edge case tests pass
3. Existing suite: `pnpm -F @ludoforge/engine test` (no regressions)

### Invariants

1. All test fixtures are synthetic — no FITL-specific identifiers in test descriptions or fixture data
2. Tests use `node --test` runner convention (engine package)
3. Tests are deterministic — same seed produces same results

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-query.test.ts` — prioritized query evaluation suite

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
