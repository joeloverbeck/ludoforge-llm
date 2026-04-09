# 122CROSEAVIC-007: Integration tests — FITL and Texas Hold'em `seatAgg` profiles

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/122CROSEAVIC-005.md`

## Problem

Unit tests verify individual components (compilation, evaluation, validation) in isolation. Integration tests are needed to verify the full end-to-end pipeline: authored YAML → compilation → evaluation in a real game context. Two game families exercise complementary aspects:

- **FITL** (asymmetric, per-seat profiles): Verifies `seatAgg` with `opponents` filter produces correct results when each seat has a distinct victory margin.
- **Texas Hold'em** (symmetric, shared profile): Verifies that the same compiled profile using `seatAgg { over: opponents }` produces different seat sets depending on which seat is acting — validating runtime resolution.

## Assumption Reassessment (2026-04-09)

1. FITL production data is loaded through `data/games/fire-in-the-lake.game-spec.md` plus imported fragments, not a `data/games/fitl/` directory. The compiled production `GameDef` has canonical seats `us`, `arvn`, `nva`, and `vc`.
2. Texas Hold'em production data is loaded through `data/games/texas-holdem.game-spec.md` plus imported fragments. The compiled production `GameDef` currently has a single canonical seat, `neutral`, and `agents.bindingsBySeat = { neutral: 'baseline' }`.
3. Because Texas compiles a single shared seat, `seatAgg { over: opponents }` in the current Texas production model resolves to an empty set rather than distinct actor-relative opponents. The positive cross-seat `seatAgg` proof therefore belongs in FITL; Texas can only serve as an integration proof of the current shared-seat boundary unless a later ticket redesigns Texas seat identity.
4. The live test infrastructure for production-spec compilation and agent evaluation is exercised in existing integration tests at `packages/engine/test/integration/` and supports authored in-memory overlays compiled against production specs.

## Architecture Check

1. Integration tests use the real GameSpecDoc → GameDef compilation → evaluation pipeline with narrow in-memory authored overlays, not mocked kernel or compiler paths.
2. FITL remains the positive cross-seat proof because it compiles distinct canonical seats and per-seat policy bindings. Texas remains valuable as a boundary proof that the current shared `neutral` seat model does not expose actor-relative opponents, which keeps the ticket aligned with the live architecture instead of inventing a false positive scenario.
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

### 2. Texas Hold'em shared-seat integration proof

Create (or extend) a shared Texas profile using `seatAgg`:

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
- Compile the profile once against the live Texas production spec.
- Evaluate it at a real Texas decision point.
- Assert the compiled policy still resolves through the shared `neutral` seat binding.
- Assert `seatAgg { over: opponents, expr: 1, aggOp: count }` returns `0`, proving the current Texas seat model does not expose actor-relative opponent seats.

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
2. Texas Hold'em shared `neutral` profile proves the current production seat model yields an empty opponent set for `seatAgg { over: opponents }`.
3. Explicit seat list `[us, nva]` aggregates only the named seats.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Integration tests use real compilation and evaluation — no mocked kernel or compiler.
2. Tests are deterministic — fixed game states, fixed seat orders.
3. The ticket does not silently reinterpret Texas as a per-player seat model when the live production spec still compiles a single shared `neutral` seat.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/agents/seat-agg-e2e.test.ts` — full end-to-end seatAgg integration tests

### Commands

1. `pnpm -F @ludoforge/engine test:e2e`
2. `pnpm -F @ludoforge/engine test:all`

## Outcome

Completed: 2026-04-09

Implemented in [packages/engine/test/integration/agents/seat-agg-e2e.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/agents/seat-agg-e2e.test.ts). The new integration coverage compiles narrow in-memory authored overlays against the live FITL and Texas production specs, then evaluates them through the real runtime pipeline.

FITL now provides the positive end-to-end proof for `seatAgg` over `opponents` and explicit seat lists. Texas was rewritten to a shared-seat boundary proof after reassessment showed the live production spec compiles only a single canonical seat, `neutral`, so `seatAgg { over: opponents }` correctly resolves to an empty set there instead of actor-relative opponent seats.

No production engine code changed. No schema or artifact regeneration was required.

Verification:
1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/dist/test/integration/agents/seat-agg-e2e.test.js`
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm -F @ludoforge/engine test:all`

Remaining deferred scope stays with [122CROSEAVIC-008.md](/home/joeloverbeck/projects/ludoforge-llm/tickets/122CROSEAVIC-008.md). No Texas per-player seat-model redesign was absorbed in this ticket.
