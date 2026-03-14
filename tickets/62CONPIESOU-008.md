# 62CONPIESOU-008: Rework card 87 (Nguyen Chanh Thi) to use `prioritized` query

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data file only
**Deps**: archive/tickets/KERQUERY/62CONPIESOU-001-prioritized-query-ast-and-recursive-infrastructure.md, tickets/62CONPIESOU-002.md, tickets/62CONPIESOU-004.md, tickets/62CONPIESOU-005.md

## Problem

Card 87's unshaded effect currently uses a `concat` query that pools Available and map sources freely, violating FITL Rule 1.4.1. With the `prioritized` query available, card 87 must be reworked to use tier-ordered sourcing with `qualifierKey: type`.

## Assumption Reassessment (2026-03-14)

1. Card 87 is in `data/games/fire-in-the-lake/41-events/065-096.md` (around line 4255-4473). Confirmed.
2. The spec provides the exact replacement YAML for the `chooseN` options (spec lines 108-182).
3. The replacement affects the `options`, `min`, and `max` fields of the `chooseN` — all three reference the query and must be updated from `concat` to `prioritized`.
4. The remainder of card 87 (destination selection, movement, support shift) is unchanged per spec.

## Architecture Check

1. This is a data-only change — no engine source is modified.
2. The `prioritized` query with `qualifierKey: type` encodes Rule 1.4.1 in authored YAML, keeping the engine game-agnostic.
3. The exact YAML is provided in the spec — minimal interpretation needed.

## What to Change

### 1. Replace card 87 unshaded `chooseN` query

In `data/games/fire-in-the-lake/41-events/065-096.md`, replace the `concat` query in card 87's unshaded `chooseN` with the `prioritized` query from the spec:

- `options.query` changes from `concat` (with `sources`) to `prioritized` (with `tiers` + `qualifierKey: type`)
- Tier 1: `tokensInZone` from `available-ARVN:none` with ARVN faction filter
- Tier 2: `tokensInMapSpaces` from the 11 specified spaces with ARVN faction + zone filter
- `min` and `max` aggregates also change from `concat` to `prioritized` with same tier structure

### 2. Preserve all other card 87 content

The destination `chooseN`, `move` effects, and support shift logic remain untouched.

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (modify — card 87 section only)

## Out of Scope

- Any engine source files
- Any other cards in the events file
- Other event files
- Any test files (integration tests are in ticket 009)
- Macro changes (the `place-from-available-or-map` macro is for auto-placement, not interactive — it stays as-is)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` succeeds (card 87 compiles with the new query)
2. Card 87 compiles without diagnostics via `compileProductionSpec()`
3. Existing suite: `pnpm -F @ludoforge/engine test` (no regressions — other cards unaffected)

### Invariants

1. Card 87's `chooseN` uses `query: prioritized` with `qualifierKey: type` and exactly 2 tiers
2. Tier 1 = Available ARVN pieces, Tier 2 = map ARVN pieces in specified spaces
3. The 11 space identifiers in tier 2 match the original `concat` query's zone list exactly
4. No other cards in the file are modified
5. Card 87's destination selection, movement, and support shift logic are unchanged

## Test Plan

### New/Modified Tests

1. No new test files in this ticket — integration tests are in ticket 009

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
