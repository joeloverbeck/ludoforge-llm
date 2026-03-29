# 11EVADEGDET-005: aggregateEvals and generateEvalReport

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — new sim modules
**Deps**: 11EVADEGDET-001 (types), 11EVADEGDET-003 (evaluateTrace), 11EVADEGDET-004 (degeneracy flags)

## Problem

Spec 11 defines two aggregation functions: `aggregateEvals` (combine per-trace results into a report with mean metrics and flag union) and `generateEvalReport` (convenience wrapper that evaluates all traces then aggregates). These are the primary API surface for campaign harnesses and the future CLI.

## Assumption Reassessment (2026-03-29)

1. `EvalReport` interface (updated in 11EVADEGDET-001) has: `gameDefId`, `runCount`, `metrics: Metrics`, `degeneracyFlags`, `perSeed: readonly TraceEval[]`.
2. `Metrics` interface has 7 fields matching `TraceMetrics` field names but prefixed with `avg` for `gameLength` → `avgGameLength`.
3. `GameDef` has a `gameDefId` field — need to verify the exact field name.
4. `TraceEval` has `metrics: TraceMetrics` — established in 11EVADEGDET-001.

## Architecture Check

1. `aggregateEvals` is a pure function: `(gameDefId, TraceEval[]) → EvalReport`. No game-specific logic (Foundation §1).
2. `generateEvalReport` is a thin wrapper: evaluate each trace, then aggregate. It accepts `GameDef` only to extract `gameDefId`.
3. Mean computation is straightforward arithmetic — no special edge cases beyond empty input (returns zeroed report).
4. Flag union via `Set` deduplication — standard pattern.

## What to Change

### 1. Create `packages/engine/src/sim/aggregate-evals.ts`

```typescript
export function aggregateEvals(
  gameDefId: string,
  evals: readonly TraceEval[]
): EvalReport;
```

Implementation per spec:
- Empty evals → all-zero metrics, no flags, empty perSeed
- Non-empty → compute mean of each metric across `evals[].metrics`, union flags via Set, include all evals as perSeed

Helper: `mean(values: readonly number[]): number` — returns 0 for empty array.

### 2. Create `packages/engine/src/sim/eval-report.ts`

```typescript
export function generateEvalReport(
  def: GameDef,
  traces: readonly GameTrace[],
  config?: EvalConfig
): EvalReport;
```

Implementation:
1. `const evals = traces.map(t => evaluateTrace(t, config))`
2. `return aggregateEvals(def.gameDefId, evals)`

Note: verify the exact field on `GameDef` for the ID. It may be `def.id` or similar.

### 3. Re-export from `sim/index.ts`

Add `aggregateEvals` and `generateEvalReport` to sim barrel export.

## Files to Touch

- `packages/engine/src/sim/aggregate-evals.ts` (new)
- `packages/engine/src/sim/eval-report.ts` (new)
- `packages/engine/src/sim/index.ts` (modify — add exports)
- `packages/engine/test/unit/sim/aggregate-evals.test.ts` (new)
- `packages/engine/test/unit/sim/eval-report.test.ts` (new)

## Out of Scope

- Per-trace metric computation (11EVADEGDET-003)
- Per-trace degeneracy detection (11EVADEGDET-004)
- Delta reconstruction (11EVADEGDET-002)
- Composite scores or fitness functions (spec explicitly excludes)
- MAP-Elites / evolution pipeline integration (Spec 14)
- Campaign harness modifications (consumer responsibility)

## Acceptance Criteria

### Tests That Must Pass

1. Two TraceEvals with known metrics → means computed correctly (manually verified arithmetic)
2. Union of degeneracy flags across traces (e.g., trace A has LOOP_DETECTED, trace B has STALL → report has both)
3. Empty evals array → all metrics 0, no flags, empty perSeed
4. Single TraceEval → metrics match per-trace metrics exactly
5. `generateEvalReport` convenience wrapper produces same result as manual evaluate + aggregate
6. `perSeed` array contains all input TraceEvals
7. `runCount` matches input array length
8. `gameDefId` matches input
9. `pnpm turbo typecheck`
10. `pnpm turbo test`

### Invariants

1. No mutation of input evals array or individual TraceEval objects (Foundation §7)
2. `aggregateEvals` is deterministic (Foundation §5)
3. `degeneracyFlags` in report is deduplicated (no duplicate flag values)
4. All aggregated metrics are finite (not NaN, not Infinity)
5. `perSeed` is the input evals — not a copy, not filtered
6. Engine agnosticism: `gameDefId` is a string, no game-specific interpretation (Foundation §1)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/aggregate-evals.test.ts`:
   - Two-eval mean computation
   - Flag union with deduplication
   - Empty evals edge case
   - Single eval pass-through
   - Large eval set (10+) for numeric stability

2. `packages/engine/test/unit/sim/eval-report.test.ts`:
   - `generateEvalReport` with mock GameDef and synthetic traces
   - Verify it calls evaluateTrace for each trace and aggregates

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern aggregate-evals`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern eval-report`
3. `pnpm turbo typecheck`
4. `pnpm turbo test`
