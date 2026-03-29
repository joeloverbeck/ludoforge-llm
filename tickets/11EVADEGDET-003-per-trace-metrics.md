# 11EVADEGDET-003: Per-trace metric computation (7 metrics)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new sim module
**Deps**: archive/tickets/11EVADEGDET/11EVADEGDET-001-types-and-config.md, tickets/11EVADEGDET-002-delta-reconstruction.md

## Problem

Spec 11 defines 7 per-trace metrics that quantify game quality: `gameLength`, `avgBranchingFactor`, `actionDiversity`, `resourceTension`, `interactionProxy`, `dominantActionFreq`, and `dramaMeasure`. These must be computed from a single `GameTrace` using only trace data (no re-simulation). Two metrics (`resourceTension`, `dramaMeasure`) depend on delta reconstruction from 11EVADEGDET-002.

## Assumption Reassessment (2026-03-29)

1. `MoveLog.move.actionId` exists and is used for action frequency counting — need to confirm `Move` shape includes `actionId`.
2. `MoveLog.legalMoveCount` is a number — confirmed at types-core.ts line ~1406.
3. `MoveLog.player` is `PlayerId` (branded number) — confirmed.
4. `MoveLog.deltas` is `readonly StateDelta[]` — confirmed.
5. `TraceMetrics` interface from 11EVADEGDET-001 defines the exact 7 fields.
6. `EvalConfig.scoringVar` controls `dramaMeasure` — if absent, `dramaMeasure = 0`.

## Architecture Check

1. All metric formulas are pure functions of trace data — no game-specific logic (Foundation §1).
2. Shannon entropy uses `Math.log2` — this is fine since metrics are floating-point display values, not kernel state (Foundation §5 integer constraint applies to game state, not analysis).
3. Placed in `sim/trace-eval.ts` as the core per-trace evaluation module.
4. Uses `reconstructPerPlayerVarTrajectory` from 11EVADEGDET-002 for `resourceTension` and `dramaMeasure`.

## What to Change

### 1. Create `packages/engine/src/sim/trace-eval.ts`

Implement `evaluateTrace(trace: GameTrace, config?: EvalConfig): TraceEval`.

Internal metric helpers (all pure functions):

- `computeGameLength(trace)` → `trace.turnsCount`
- `computeAvgBranchingFactor(moves)` → `mean(moves.map(m => m.legalMoveCount))`
- `computeActionDiversity(moves)` → normalized Shannon entropy of `actionId` frequencies
- `computeResourceTension(trajectory)` → mean cross-player variance across variables and turns
- `computeInteractionProxy(moves)` → mean ratio of cross-player deltas to total perPlayerVar deltas
- `computeDominantActionFreq(moves)` → `max(freq) / total`
- `computeDramaMeasure(trajectory, scoringVar, turnsCount)` → lead changes / turnsCount

Edge cases per spec:
- Empty `moves` → all metrics default to 0
- Single distinct action → `actionDiversity = 0` (avoid division by zero in `H_max`)
- No `perPlayerVars` deltas in a move → skip that move in `interactionProxy` mean
- No `scoringVar` in config → `dramaMeasure = 0`

### 2. Re-export from `sim/index.ts`

Add `evaluateTrace` to sim barrel export.

## Files to Touch

- `packages/engine/src/sim/trace-eval.ts` (new)
- `packages/engine/src/sim/index.ts` (modify — add export)
- `packages/engine/test/unit/sim/trace-eval.test.ts` (new)

## Out of Scope

- Degeneracy flag detection (11EVADEGDET-004 — will be added to the same `evaluateTrace` function but is a separate ticket)
- Aggregation across traces (11EVADEGDET-005)
- Integration tests with real simulations (11EVADEGDET-006)
- Delta reconstruction implementation (11EVADEGDET-002 — consumed as import)
- Composite scores / fitness functions (explicitly out of scope per spec)

## Acceptance Criteria

### Tests That Must Pass

1. Known trace (10 turns) → `gameLength = 10`
2. Known trace with varying `legalMoveCount` [2, 4, 6] → `avgBranchingFactor = 4.0`
3. Trace where 1 action used exclusively → `actionDiversity = 0`
4. Trace where 3 actions used equally (10 each, 30 total) → `actionDiversity ≈ 1.0`
5. Trace with no cross-player deltas → `interactionProxy = 0`
6. Trace where 90% moves are same action → `dominantActionFreq ≈ 0.9`
7. Trace with `scoringVar` provided, 5 lead changes in 20 turns → `dramaMeasure = 0.25`
8. Trace without `scoringVar` → `dramaMeasure = 0`
9. Trace with empty moves → all metrics 0
10. All computed metrics are finite (not NaN, not Infinity)
11. `actionDiversity`, `interactionProxy`, `dominantActionFreq` in [0, 1]
12. `pnpm turbo typecheck`
13. `pnpm turbo test`

### Invariants

1. `evaluateTrace` is deterministic: same trace + config → same result (Foundation §5)
2. No mutation of input trace or config (Foundation §7)
3. Bounded metrics stay in [0, 1] range as specified
4. All metrics are finite numbers
5. Engine agnosticism: no game-specific variable names or action IDs referenced in logic

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/trace-eval.test.ts`:
   - Per-metric tests with synthetic traces (hand-crafted `MoveLog` arrays)
   - Edge case: empty moves
   - Edge case: single action type
   - Edge case: no perPlayerVar deltas
   - Edge case: scoringVar absent vs present
   - Property: all metrics finite for any valid trace
   - Property: bounded metrics in [0, 1]

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern trace-eval`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`
