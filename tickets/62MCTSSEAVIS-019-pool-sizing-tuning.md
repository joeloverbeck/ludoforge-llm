# 62MCTSSEAVIS-019: Node Pool Sizing Tuning

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Possibly — agents/mcts/config.ts, mcts-agent.ts
**Deps**: 62MCTSSEAVIS-016, 62MCTSSEAVIS-017

## Problem

The default `decisionDepthMultiplier` (4) and pool sizing formula may need tuning based on actual FITL and Texas Hold'em decision tree profiles. Decision nodes increase depth but may reduce width — the net pool pressure needs measurement.

## What to Change

### 1. Profile pool utilization

Using visitor/diagnostics data from 62MCTSSEAVIS-016/017:
- Measure peak node allocation vs pool capacity for each scenario
- Identify scenarios near pool exhaustion
- Measure decision depth distribution

### 2. Tune multiplier if needed

If pool exhaustion occurs in normal scenarios:
- Increase `decisionDepthMultiplier` default
- Or adjust the formula

If pool is consistently underutilized:
- Decrease multiplier to save memory

### 3. Update preset values

Adjust `decisionDepthMultiplier` in fast/default/strong presets based on profiling.

## Files to Touch

- `packages/engine/src/agents/mcts/config.ts` (modify if default changes)
- `packages/engine/src/agents/mcts/mcts-agent.ts` (modify if formula changes)

## Out of Scope

- Decision expansion logic (already implemented)
- Search loop changes
- Rollout changes
- CI workflow changes (62MCTSSEAVIS-020)

## Acceptance Criteria

### Tests That Must Pass

1. No pool exhaustion in FITL fast/default preset scenarios
2. Pool utilization < 80% for fast preset, < 90% for default preset
3. No memory regression — pool doesn't allocate 10x more than needed
4. All existing tests pass: `pnpm -F @ludoforge/engine test`

### Invariants

1. Pool capacity formula is monotonically increasing with iterations
2. Pool capacity >= `legalMoves.length * 4` (minimum floor always respected)
3. Graceful degradation still works if pool is exhausted despite tuning

## Test Plan

### Commands

1. `RUN_MCTS_FITL_E2E=1 pnpm -F @ludoforge/engine test:e2e` (with visitor showing pool stats)
2. `pnpm -F @ludoforge/engine test`
