# 122CROSEAVIC-007: Integration tests — FITL and Texas Hold'em `seatAgg` profiles

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/122CROSEAVIC-005.md`

## Problem

Unit tests verify individual components (compilation, evaluation, validation) in isolation. Integration tests are needed to verify the full end-to-end pipeline: authored YAML → compilation → evaluation in a real game context. Two game families exercise complementary aspects:

- **FITL** (asymmetric, per-seat profiles): Verifies `seatAgg` with `opponents` filter produces correct results when each seat has a distinct victory margin.
- **Texas Hold'em** (symmetric, shared profile): Verifies that the same compiled profile using `seatAgg { over: opponents }` produces different seat sets depending on which seat is acting — validating runtime resolution.

## Assumption Reassessment (2026-04-09)

1. FITL game data with per-seat agent profiles exists in `data/games/fitl/` — to be verified at implementation time. FITL has 4 seats (govt, us, nva, vc) with distinct victory margins.
2. Texas Hold'em game data with shared agent profile exists in `data/games/texas-holdem/` — to be verified at implementation time. All seats share one profile.
3. The test infrastructure for agent profile compilation and evaluation is exercised in existing integration tests at `packages/engine/test/integration/agents/` — confirmed.

## Architecture Check

1. Integration tests use real GameSpecDoc → GameDef compilation → evaluation pipeline. No mocks for the kernel or compiler.
2. Game-agnostic: the tests verify that `seatAgg` works across materially different game families (asymmetric vs symmetric), consistent with Foundation 16 (Testing as Proof) conformance corpus requirement.
3. No backwards-compatibility shims.

## What to Change

### 1. FITL integration test

Create a test profile for ARVN using `seatAgg` for defensive scoring:

```yaml
stateFeatures:
  maxOpponentMargin:
    type: number
    expr:
      seatAgg:
        over: opponents
        expr: { ref: victory.currentMargin.$seat }
        aggOp: max
```

Test:
- Compile the profile with the FITL GameDef.
- Set up a game state with known victory margins for each seat.
- Evaluate `maxOpponentMargin` for the ARVN seat.
- Assert the result equals the maximum margin among the 3 non-ARVN seats.

### 2. Texas Hold'em shared-profile integration test

Create (or extend) a shared profile using `seatAgg`:

```yaml
stateFeatures:
  opponentCount:
    type: number
    expr:
      seatAgg:
        over: opponents
        expr: { literal: 1 }
        aggOp: count
```

Test:
- Compile the profile once.
- Evaluate it for seat 0 → `opponentCount` equals N-1.
- Evaluate it for seat 1 → `opponentCount` equals N-1 (same value but different opponent set).
- Verify the opponent sets are different by using a margin-based feature that produces different results per seat.

### 3. Explicit seat list integration test

Test `seatAgg { over: [us, nva] }` in the FITL context — verify only the named seats are aggregated.

## Files to Touch

- `packages/engine/test/integration/agents/seat-agg-e2e.test.ts` (new)

## Out of Scope

- Modifying game data files or production agent profiles
- Performance benchmarking of `seatAgg` evaluation
- LLM evolution pipeline integration

## Acceptance Criteria

### Tests That Must Pass

1. FITL `seatAgg { over: opponents, aggOp: max }` returns the correct maximum opponent margin for ARVN.
2. Texas Hold'em shared profile produces correct `seatAgg` results for different acting seats.
3. Explicit seat list `[us, nva]` aggregates only the named seats.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Integration tests use real compilation and evaluation — no mocked kernel or compiler.
2. Tests are deterministic — fixed game states, fixed seat orders.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/agents/seat-agg-e2e.test.ts` — full end-to-end seatAgg integration tests

### Commands

1. `pnpm -F @ludoforge/engine test:e2e`
2. `pnpm -F @ludoforge/engine test:all`
