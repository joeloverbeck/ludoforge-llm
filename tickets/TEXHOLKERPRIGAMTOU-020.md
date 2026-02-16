# TEXHOLKERPRIGAMTOU-020: Texas Quality Gate (Compile + Runtime + Showdown Contracts)

**Status**: TODO
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-018, TEXHOLKERPRIGAMTOU-019
**Blocks**: TEXHOLKERPRIGAMTOU-008, TEXHOLKERPRIGAMTOU-009

## 1) What must change / be implemented

Add mandatory tests that prevent structurally-valid but non-playable Texas specs from passing CI:

1. Add a Texas compile gate test that fails on any error-severity diagnostic.
2. Add a Texas simulator smoke test: compile, initialize, enumerate/apply legal moves for a minimum step window without runtime errors.
3. Add targeted invariant checks for:
- chip conservation
- card conservation
- no negative stacks
4. Ensure these tests run under standard `npm test` (not optional/manual).
5. Keep gate generic in style so future games can reuse the same contract pattern.

## 2) Invariants that should pass

1. Texas spec is both parse-valid and compile-valid.
2. Texas spec is simulator-runnable beyond initialization.
3. Core runtime conservation invariants hold in smoke flow.
4. CI catches contract drift early when GameSpec YAML changes.

## 3) Tests that should pass

1. New unit/integration Texas compile gate test.
2. New integration simulator smoke test for Texas.
3. New integration invariant checks (chip/card/no-negative) over deterministic seeds.
4. Regression: `npm run build`, `npm test`, `npm run lint`.
