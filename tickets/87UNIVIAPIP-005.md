# 87UNIVIAPIP-005: Unit test for discovery cache hit + integration parity verification

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: 87UNIVIAPIP-004 (full pipeline wired)

## Problem

The discovery cache mechanism needs explicit test coverage to verify:
1. Cache hits actually occur for event moves during classification.
2. Cache misses occur for pipeline parameterized variants (different Move objects).
3. The classified-move-parity test continues to hold (functional equivalence).
4. No regression in the performance benchmark.

## Assumption Reassessment (2026-03-27)

1. `classified-move-parity.test.ts` exists at `packages/engine/test/integration/classified-move-parity.test.ts` — confirmed via glob.
2. `resolveMoveDecisionSequence` is importable from `move-decision-sequence.ts` — confirmed (exported at line 42).
3. `DiscoveryCache` will be exported from `move-decision-sequence.ts` after 87UNIVIAPIP-001 — expected.
4. FITL production spec can be compiled via `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts` — per CLAUDE.md testing requirements.
5. Event moves are identifiable by `move.eventDeckId !== undefined` or by action ID matching event actions — verifiable from GameDef.

## Architecture Check

1. Tests verify the cache mechanism without coupling to internal implementation details — they observe cache hits via a spy/wrapper, not by inspecting private state.
2. The parity test is the primary correctness proof — if classified moves are identical with and without the cache, the optimization is safe.
3. Performance assertion is a regression guard, not a hard target — uses relative comparison.

## What to Change

### 1. New unit test: discovery cache hit for event moves

Create `packages/engine/test/unit/kernel/discovery-cache-event-hit.test.ts`:

- Compile the FITL production spec.
- Call `enumerateLegalMoves` on a state that has event moves.
- Instrument `legalChoicesDiscover` with a counting wrapper (or use the `DiscoveryCache` size after enumeration) to verify that the cache was populated for event base moves during enumeration.
- Verify that `resolveMoveDecisionSequence` (called internally by `probeMoveViability`) received the cache and used it — this can be verified indirectly by confirming the classified moves are identical AND by checking that the discovery cache Map has entries for event moves after enumeration.

**Approach**: The simplest way to verify cache hit behavior without coupling to internals:
1. Export a test-only counter or use the `DiscoveryCache` size from `enumerateRawLegalMoves` (accessible indirectly through the result).
2. Or: instrument the test by calling `enumerateRawLegalMoves` directly (it's module-private, but test helpers can re-export it or the test can verify behavior through `enumerateLegalMoves`).

**Recommended approach**: Call `enumerateLegalMoves` and verify functional equivalence (parity). For cache-hit verification, write a focused test that:
- Creates a minimal GameDef with one event action (using a test fixture, not FITL production).
- Calls the internal pipeline manually to observe cache population.

### 2. New unit test: pipeline variants are cache misses

Create assertions within the same test file:

- Create a GameDef with a pipeline action that has param expansions.
- Verify that the template move and parameterized variant moves are different objects.
- Verify that the cache does NOT serve the parameterized variant from the template's cache entry.

### 3. Verify classified-move-parity test still passes

This is not a new test — just confirm that `packages/engine/test/integration/classified-move-parity.test.ts` passes with the full cache wiring active.

### 4. Run performance benchmark

Run the FITL performance test to verify no regression and measure improvement:

```bash
pnpm -F @ludoforge/engine test -- --test-name-pattern="performance" 2>&1 | tail -20
```

Document the before/after timing in the PR description.

## Files to Touch

- `packages/engine/test/unit/kernel/discovery-cache-event-hit.test.ts` (new) — cache hit verification for event moves, cache miss verification for pipeline variants

## Out of Scope

- Source code changes — this is test-only
- `classified-move-parity.test.ts` — should pass without modification (if it doesn't, that's a bug in 87UNIVIAPIP-001 through 004)
- Performance optimization beyond what the cache provides — measured, not tuned
- Agent completion caching (step 3 redundancy) — future work per spec
- Any hot-path object shapes

## Acceptance Criteria

### Tests That Must Pass

1. New `discovery-cache-event-hit.test.ts` passes, confirming:
   - Cache is populated during enumeration for event base moves.
   - Pipeline parameterized variants do not produce false cache hits.
2. `classified-move-parity.test.ts` passes unchanged.
3. `pnpm turbo test` passes with no regressions.
4. `pnpm turbo typecheck` passes.

### Invariants

1. The classified-move-parity contract holds: same actionIds, same viability classifications, same move count as before the cache was introduced.
2. All 8 validation steps in `probeMoveViability` still execute for every move — no probe bypass.
3. No test uses `legalChoicesDiscover` mocking — tests verify behavior through the public `enumerateLegalMoves` API or through documented test helpers.
4. Performance benchmark does not regress (within noise margin, typically ±5%).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/discovery-cache-event-hit.test.ts` — verifies cache population and hit/miss behavior

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="discovery-cache"`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern="classified-move-parity"`
3. `pnpm turbo test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
