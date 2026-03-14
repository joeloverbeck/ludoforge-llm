# 62CONPIESOU-009: Integration tests — card 87 Rule 1.4.1 + synthetic non-FITL fixture

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — test files + possibly a test fixture file
**Deps**: 62CONPIESOU-004 (evalQuery), 62CONPIESOU-005 (legality), 62CONPIESOU-008 (card 87 rework)

## Problem

The spec requires integration tests proving that the `prioritized` query correctly enforces Rule 1.4.1 end-to-end on the real FITL card 87, plus a synthetic non-FITL fixture demonstrating engine-agnosticism of the feature.

## Assumption Reassessment (2026-03-14)

1. FITL integration tests use `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts`. Confirmed per CLAUDE.md.
2. FITL event tests exist in `packages/engine/test/` — e.g., tests for other event cards. These set up game state, evaluate legal moves, and verify behavior.
3. Synthetic fixture tests use inline Game Spec Markdown or fixture files in `packages/engine/test/fixtures/`.
4. The spec lists 3 FITL integration tests and 1 non-FITL test (section "Integration Tests").

## Architecture Check

1. FITL integration tests compile the production spec and set up state with specific Available/map piece configurations. They verify that `chooseN` legal options include/exclude the right items.
2. The synthetic non-FITL fixture demonstrates `prioritized` with a different `qualifierKey` (e.g., `color`) in a made-up game, proving the engine doesn't depend on FITL concepts.
3. No backwards-compatibility concerns — these are new tests.

## What to Change

### 1. Add FITL card 87 integration tests

In a new or existing FITL event test file:

**Required test cases (from spec)**:
- Card 87 unshaded: with Available ARVN Troops present, player **cannot** select map ARVN Troops (tier-2 Troops are illegal)
- Card 87 unshaded: with **no** Available ARVN Troops, player **can** select map ARVN Troops (tier-2 Troops become legal)
- Card 87 unshaded: qualifier independence — Available Police status does **not** affect map Troop legality (independent qualifiers)

**Test setup pattern**:
1. Compile production FITL spec
2. Initialize game state with specific seed
3. Set up Available zone with specific ARVN pieces (or empty for "no available" test)
4. Place ARVN pieces on map spaces near Hue
5. Execute event to reach card 87's `chooseN`
6. Enumerate legal moves and verify which pieces are selectable

### 2. Add synthetic non-FITL integration test

Create a minimal Game Spec fixture (`packages/engine/test/fixtures/prioritized-sourcing-synthetic.md` or inline) with:
- Two zones: `supply` and `board`
- Tokens with a `color` property (e.g., `red`, `blue`)
- A `chooseN` effect using `prioritized` query with `qualifierKey: 'color'`
- Tier 1: tokens in `supply`, Tier 2: tokens on `board`

**Required test case (from spec)**:
- Synthetic spec: with supply red tokens available, board red tokens are illegal; supply blue exhaustion unlocks board blue tokens independently

### 3. FITL event-selector test conventions

Per CLAUDE.md: "when legality depends on broad map predicates, neutralize the relevant support/opposition slice first and then apply explicit overrides." Follow this pattern for card 87 tests.

## Files to Touch

- `packages/engine/test/integration/fitl-card-87-prioritized.test.ts` (new — or add to existing FITL event test file)
- `packages/engine/test/fixtures/prioritized-sourcing-synthetic.md` (new — synthetic fixture)
- `packages/engine/test/integration/prioritized-sourcing-synthetic.test.ts` (new — synthetic integration test)

## Out of Scope

- Any engine source file changes
- Card 87 YAML changes (ticket 008)
- Unit tests (tickets 006, 007)
- Other FITL cards
- Performance benchmarks
- UI/UX validation

## Acceptance Criteria

### Tests That Must Pass

1. Card 87 integration test: Available Troops present → map Troops illegal
2. Card 87 integration test: No Available Troops → map Troops legal
3. Card 87 integration test: qualifier independence (Police vs Troops)
4. Synthetic integration test: prioritized sourcing with `qualifierKey: 'color'` behaves correctly
5. Existing suite: `pnpm -F @ludoforge/engine test` (no regressions)
6. `pnpm turbo test` (full suite passes)

### Invariants

1. FITL integration tests use `compileProductionSpec()` — no separate fixture files for FITL profiles/events
2. Synthetic fixture uses non-FITL terminology (no faction names, no FITL zone names)
3. All tests are deterministic (seeded PRNG)
4. Legal choice generation and move application agree on admissibility
5. Prioritized sourcing behavior is identical whether tested via FITL or synthetic fixture

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-card-87-prioritized.test.ts` — 3 FITL integration tests
2. `packages/engine/test/integration/prioritized-sourcing-synthetic.test.ts` — 1+ synthetic integration tests
3. `packages/engine/test/fixtures/prioritized-sourcing-synthetic.md` — synthetic Game Spec fixture

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo test`
