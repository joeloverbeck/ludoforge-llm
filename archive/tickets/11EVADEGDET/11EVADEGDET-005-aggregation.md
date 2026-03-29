# 11EVADEGDET-005: aggregateEvals and generateEvalReport

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — evaluator aggregation on top of the existing `sim` evaluator seam
**Deps**: archive/tickets/11EVADEGDET/11EVADEGDET-001-types-and-config.md, archive/tickets/11EVADEGDET/11EVADEGDET-003-per-trace-metrics.md, archive/tickets/11EVADEGDET/11EVADEGDET-004-degeneracy-detection.md

## Problem

Spec 11 still requires the aggregate evaluator layer: `aggregateEvals` combines per-trace `TraceEval` values into an `EvalReport`, and `generateEvalReport` is the convenience wrapper that evaluates raw traces then aggregates them. Campaign harnesses and future CLI/reporting code should consume these functions instead of open-coding aggregation logic.

## Assumption Reassessment (2026-03-29)

1. `TraceEval`, `TraceMetrics`, `EvalReport`, and `Metrics` already exist in `packages/engine/src/kernel/types-core.ts`; this ticket must consume those contracts rather than redefine them.
2. `evaluateTrace` already exists in `packages/engine/src/sim/trace-eval.ts` and is re-exported from `packages/engine/src/sim/index.ts`.
3. `GameDef` does not have a top-level `gameDefId` field. The canonical definition identifier is `def.metadata.id`. The ticket must use that exact contract.
4. `GameTrace.gameDefId` already exists. `generateEvalReport` should not infer a report id from the traces when the spec explicitly passes `GameDef`; it should use `def.metadata.id` and leave trace/report consistency validation out of scope for this ticket.
5. The current `sim` layer is intentionally split by concern (`delta.ts`, `trace-eval.ts`, `simulator.ts`, etc.). Adding a small `aggregate-evals.ts` module and a thin `eval-report.ts` wrapper fits the existing architecture better than expanding `trace-eval.ts` into a second responsibility.
6. Engine unit tests run through Node's built test runner against built `dist/test/...` files. The original ticket's `--test-name-pattern` commands are not the repo's normal focused-test shape and must be corrected.
7. There is already strong per-trace evaluator coverage in `packages/engine/test/unit/sim/trace-eval.test.ts`. This ticket should add focused aggregation/report-generation tests rather than trying to retest per-trace formulas.
8. The current codebase does not use Jest spies here. The right contract test for `generateEvalReport` is output equivalence with `aggregateEvals(traces.map(evaluateTrace))`, not an implementation-detail assertion about "calling" helpers.

## Architecture Check

1. `aggregateEvals` should remain a pure function from `(gameDefId, TraceEval[])` to `EvalReport` with no game-specific logic and no mutation.
2. Keeping aggregation separate from `trace-eval.ts` is cleaner than folding aggregate behavior into the per-trace evaluator. These are different levels of abstraction and should stay in separate modules.
3. `generateEvalReport` is acceptable as a thin convenience wrapper, but it is slightly over-coupled because it receives an entire `GameDef` only to read `metadata.id`. That coupling is tolerable here because Spec 11 explicitly defines the API that way. The implementation should keep the wrapper minimal so a future spec cleanup can narrow the parameter if desired.
4. The aggregate layer should not introduce aliasing, compatibility fields, or derived "legacy" report shapes. `EvalReport` already has the correct modern contract (`perSeed`, not `traces`) and this ticket should preserve it unchanged.
5. Empty-input behavior should be explicit and deterministic: zeroed aggregate metrics, no flags, and empty `perSeed`. That is cleaner than throwing for an empty batch and makes downstream campaign code simpler.
6. It would be worse architecture to introduce an abstract "report builder" class or registry here. Two small pure functions are enough and leave the surface robust and extensible.

## What to Change

### 1. Add `packages/engine/src/sim/aggregate-evals.ts`

Implement:

```typescript
export function aggregateEvals(
  gameDefId: string,
  evals: readonly TraceEval[]
): EvalReport;
```

Behavior:
- Preserve `gameDefId`
- Set `runCount` to `evals.length`
- Produce aggregate `metrics` by averaging each field from `TraceEval.metrics`
- Produce `degeneracyFlags` as the stable-order union of all flags present in the input evals
- Preserve `perSeed` as the input `evals`
- Empty `evals` returns zeroed metrics, empty `degeneracyFlags`, and empty `perSeed`

Implementation notes:
- Keep a file-local `mean` helper; do not couple this module to internal helpers from `trace-eval.ts`.
- Preserve deterministic flag order by iterating input evals in order and appending unseen flags once.
- Ensure all returned aggregate metrics are finite for both empty and non-empty inputs.

### 2. Add `packages/engine/src/sim/eval-report.ts`

Implement:

```typescript
export function generateEvalReport(
  gameDefId: string,
  traces: readonly GameTrace[],
  config?: EvalConfig
): EvalReport;
```

Behavior:
1. Evaluate every trace via `evaluateTrace(trace, config)`
2. Aggregate with `aggregateEvals(def.metadata.id, evals)`

Notes:
- Use `def.metadata.id`, not a non-existent `def.gameDefId`
- Keep this wrapper thin; no duplicate aggregation logic

### 3. Re-export from `packages/engine/src/sim/index.ts`

Add `aggregateEvals` and `generateEvalReport` to the sim barrel.

## Files to Touch

- `packages/engine/src/sim/aggregate-evals.ts` (new)
- `packages/engine/src/sim/eval-report.ts` (new)
- `packages/engine/src/sim/index.ts` (modify)
- `packages/engine/test/unit/sim/aggregate-evals.test.ts` (new)
- `packages/engine/test/unit/sim/eval-report.test.ts` (new)

## Out of Scope

- Per-trace metric computation or degeneracy detection logic in `trace-eval.ts`
- Any changes to `TraceEval`, `EvalReport`, runtime schemas, or schema artifacts
- CLI or campaign harness integration
- Cross-checking that `def.metadata.id` matches every `trace.gameDefId`
- Composite scores / fitness functions
- Spec 14 behavior characterization or MAP-Elites work

## Acceptance Criteria

### Tests That Must Pass

1. Two `TraceEval` inputs with known metrics aggregate to the correct arithmetic means.
2. Union of degeneracy flags is deduplicated and stays in deterministic first-seen order.
3. Empty `evals` produces `runCount = 0`, zeroed metrics, empty flags, and empty `perSeed`.
4. Single `TraceEval` input produces aggregate metrics equal to the trace metrics, with `avgGameLength = trace.metrics.gameLength`.
5. `generateEvalReport(gameDefId, traces, config)` returns the same report as `aggregateEvals(gameDefId, traces.map(trace => evaluateTrace(trace, config)))`.
6. `perSeed` contains all input `TraceEval` values unchanged.
7. `runCount` always equals the number of input evals.
8. The report `gameDefId` equals the provided `gameDefId` for `aggregateEvals` and `def.metadata.id` for `generateEvalReport`.
9. `pnpm turbo typecheck`
10. `pnpm turbo lint`
11. `pnpm turbo test`

### Invariants

1. No mutation of input eval arrays, trace arrays, config objects, or individual `TraceEval` / `GameTrace` objects.
2. `aggregateEvals` and `generateEvalReport` are deterministic.
3. `degeneracyFlags` in the report contain no duplicates.
4. All aggregate metrics are finite numbers.
5. `aggregateEvals` does not depend on `GameDef`; only `generateEvalReport` touches `GameDef`, and only to read `metadata.id`.
6. No backwards-compatibility aliases or legacy report fields are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/aggregate-evals.test.ts`
   - Mean aggregation across multiple trace evals
   - Empty-input behavior
   - Stable deduplicated flag union
   - Single-eval pass-through semantics
   - Immutability / no-input-mutation contract

2. `packages/engine/test/unit/sim/eval-report.test.ts`
   - Wrapper equivalence to manual `evaluateTrace` + `aggregateEvals`
   - Uses `def.metadata.id` as report id
   - Empty-trace convenience behavior
   - Config propagation to `evaluateTrace`

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/sim/aggregate-evals.test.js`
3. `node --test packages/engine/dist/test/unit/sim/eval-report.test.js`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
6. `pnpm turbo test`

## Outcome

- Completion date: 2026-03-29
- Outcome amended: 2026-03-29
- What actually changed:
  - Added `packages/engine/src/sim/aggregate-evals.ts` with pure `aggregateEvals(gameDefId, evals)` aggregation logic for report metrics, stable deduplicated degeneracy-flag union, and explicit empty-input handling.
  - Added `packages/engine/src/sim/eval-report.ts` with the thin `generateEvalReport(gameDefId, traces, config?)` wrapper that evaluates traces and aggregates them using the explicit identifier string.
  - Re-exported both functions from `packages/engine/src/sim/index.ts`.
  - Added focused unit coverage in `packages/engine/test/unit/sim/aggregate-evals.test.ts` and `packages/engine/test/unit/sim/eval-report.test.ts`.
- Deviations from original plan:
  - The ticket was corrected first because the original assumptions were wrong about the `GameDef` identifier field, prerequisite ticket locations, and the engine's focused test command shape.
  - The original plan suggested verifying `generateEvalReport` by asserting helper calls. The implementation instead tests the architectural contract that wrapper output matches manual `evaluateTrace` plus `aggregateEvals`, which is cleaner and tool-agnostic.
  - Ticket 11EVADEGDET-007 later narrowed `generateEvalReport` from `(def, traces, config?)` to `(gameDefId, traces, config?)`, removing the unnecessary `GameDef` coupling from the wrapper.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/sim/aggregate-evals.test.js`
  - `node --test packages/engine/dist/test/unit/sim/eval-report.test.js`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm turbo test`
