# 96GLOSTAAGG-006: Integration tests, golden updates, and property tests for aggregation expressions

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — tests and golden fixtures
**Deps**: 96GLOSTAAGG-003, 96GLOSTAAGG-004, 96GLOSTAAGG-005, `packages/engine/test/helpers/production-spec-helpers.ts`

## Problem

The new aggregation expression kinds need end-to-end validation: compiling through the full FITL pipeline, evaluating against known FITL game state, verifying conditional scoreTerm activation based on aggregated thresholds, and updating golden catalog snapshots. Without this, we cannot be confident that the feature works in a realistic game context.

## Assumption Reassessment (2026-03-30)

1. `fitl-policy-catalog.golden.json` exists at `packages/engine/test/fixtures/gamedef/` — must be regenerated after new expression kinds are available.
2. `texas-policy-catalog.golden.json` exists at same location — must also be regenerated (even if Texas Hold'em doesn't use new expressions, the catalog schema may change).
3. `policy-production-golden.test.ts` verifies golden catalog snapshots — confirmed.
4. `fitl-policy-agent.test.ts` contains FITL-specific integration tests — this is where new integration tests belong.
5. FITL production spec is compiled via `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts`.
6. The FITL agent YAML would need to actually use the new expressions for integration tests to be meaningful — this ticket includes adding test-only YAML fixtures or modifying the test harness to inject custom policy catalogs.

## Architecture Check

1. Integration tests validate the full compilation → evaluation pipeline against realistic game data. This is the correct final validation layer (Foundation #11 — testing as proof).
2. Golden tests capture catalog shape for regression detection. Updating them after schema extensions is standard practice.
3. Property tests verify mathematical consistency (e.g., `adjacentTokenAgg` result ≤ `globalTokenAgg` result for same filter). These are architecture-level proofs.
4. No game-specific logic in engine code — the tests use FITL data as a test case, but the tested expressions are generic.

## What to Change

### 1. Add integration tests to `fitl-policy-agent.test.ts`

Test scenarios:
- Compile FITL spec with injected state features using `globalTokenAgg` (e.g., count VC bases on map).
- Evaluate the feature at a known FITL game state and verify the count matches manual counting.
- Compile with `globalZoneAgg` (e.g., sum opposition across provinces) and verify.
- Compile with `adjacentTokenAgg` (e.g., count US troops near a specific zone) and verify.
- Conditional scoreTerm: define a scoreTerm with `when` clause referencing a globalTokenAgg feature, verify it activates/deactivates at correct threshold.

### 2. Regenerate golden catalog files

After the new expression kinds are wired into the compilation pipeline:
- Regenerate `fitl-policy-catalog.golden.json`.
- Regenerate `texas-policy-catalog.golden.json`.
- Verify `policy-production-golden.test.ts` passes with updated goldens.

### 3. Add property tests

In a new or existing property test file:
- `globalTokenAgg` count with no filter equals total token count across board zones (iterate state.zones manually to verify).
- `globalTokenAgg` count ≥ 0 for any filter.
- `adjacentTokenAgg` result for any filter ≤ `globalTokenAgg` result for same filter (adjacent zones are a subset).
- Aggregation over empty state returns 0 (not undefined, NaN, or negative).
- `globalZoneAgg` count with no filter equals number of board zones.

### 4. Add FITL-specific evaluation fixture

Create a test helper or inline fixture that:
- Sets up a known FITL game state with specific token placements (e.g., 5 VC bases across 3 provinces, known opposition values).
- Defines state features using the new expressions.
- Evaluates and asserts exact numeric results.

## Files to Touch

- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify) — add integration tests
- `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json` (modify) — regenerate
- `packages/engine/test/fixtures/gamedef/texas-policy-catalog.golden.json` (modify) — regenerate
- `packages/engine/test/unit/policy-production-golden.test.ts` (modify) — may need snapshot update logic
- `packages/engine/test/unit/property/policy-determinism.test.ts` (modify) — add property tests

## Out of Scope

- Modifying FITL production YAML to add real aggregation features (that's game-content work, not engine work).
- Runner package changes.
- Schema JSON updates.
- Performance benchmarks (existing perf test file covers policy agent; aggregation performance is addressed in spec § Performance Considerations).
- Changes to compilation or evaluation logic (done in 003/004/005).

## Acceptance Criteria

### Tests That Must Pass

1. Integration: FITL compilation with injected `globalTokenAgg` state feature succeeds without diagnostics.
2. Integration: `globalTokenAgg` count of VC bases at known state returns correct number.
3. Integration: `globalZoneAgg` sum of opposition at known state returns correct total.
4. Integration: `adjacentTokenAgg` count of troops near specific zone returns correct number.
5. Integration: conditional scoreTerm activates when threshold is met, deactivates when not.
6. Golden: `policy-production-golden.test.ts` passes with regenerated golden files.
7. Property: `globalTokenAgg` count with no filter = manual total token count on board zones.
8. Property: `adjacentTokenAgg` result ≤ `globalTokenAgg` result for same filter.
9. Property: aggregation over empty state returns 0.
10. Existing suite: `pnpm turbo test`

### Invariants

1. Golden files are regenerated, not hand-edited (reproducible from source).
2. Integration tests use realistic FITL data, not toy fixtures — proves end-to-end correctness.
3. Property tests are game-agnostic — they verify mathematical properties, not FITL-specific behavior.
4. No modifications to engine source code in this ticket — tests only.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` — `describe('global aggregation expressions')`:
   - globalTokenAgg count, globalZoneAgg sum, adjacentTokenAgg count, conditional scoreTerm threshold
2. `packages/engine/test/unit/property/policy-determinism.test.ts` — add aggregation consistency properties
3. `packages/engine/test/unit/policy-production-golden.test.ts` — verify updated goldens

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "global aggregation"`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern "policy-production-golden"`
3. `pnpm turbo test`
4. `pnpm turbo typecheck`
