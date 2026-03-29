# 11EVADEGDET-003: Per-trace metric computation (7 metrics)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — add evaluator module on top of existing sim utilities
**Deps**: archive/tickets/11EVADEGDET/11EVADEGDET-001-types-and-config.md, archive/tickets/11EVADEGDET/11EVADEGDET-002-delta-reconstruction.md

## Problem

Spec 11 defines 7 per-trace metrics that quantify game quality: `gameLength`, `avgBranchingFactor`, `actionDiversity`, `resourceTension`, `interactionProxy`, `dominantActionFreq`, and `dramaMeasure`. These must be computed from a single `GameTrace` using only trace data (no re-simulation). Two metrics (`resourceTension`, `dramaMeasure`) depend on delta reconstruction from 11EVADEGDET-002.

## Assumption Reassessment (2026-03-29)

1. `MoveLog.move.actionId` exists on `Move` and remains the correct source for action-frequency metrics.
2. `MoveLog.legalMoveCount` is a number and can be consumed directly for branching-factor metrics.
3. `MoveLog.player` is `PlayerId` (a branded number), so interaction metrics can compare numeric player identities without additional decoding.
4. `MoveLog.deltas` is `readonly StateDelta[]`; only deltas whose `path` matches `perPlayerVars.<playerId>.<varName>` are relevant to the metrics in this ticket.
5. `TraceMetrics`, `TraceEval`, `EvalReport`, runtime schemas, JSON schema artifacts, and `EvalConfig` are already present from 11EVADEGDET-001. This ticket must consume those contracts, not redefine them.
6. `DEFAULT_EVAL_CONFIG` already exists in `packages/engine/src/sim/eval-config.ts`; this ticket should merge caller config onto that default only where metric computation needs it.
7. `reconstructPerPlayerVarTrajectory` already lives in `packages/engine/src/sim/delta.ts`, is re-exported via `sim/index.ts`, and already has focused unit coverage from 11EVADEGDET-002.
8. The current repo already validates `TraceEval`/`EvalReport` schema shapes in `packages/engine/test/unit/json-schema.test.ts` and `packages/engine/test/unit/schemas-top-level.test.ts`; those tests do not need further schema changes for this ticket.

## Architecture Check

1. All metric formulas remain pure functions of trace data with no game-specific logic (Foundation §1).
2. Shannon entropy can use `Math.log2` safely because evaluator metrics are offline analysis outputs rather than deterministic kernel state.
3. A dedicated `packages/engine/src/sim/trace-eval.ts` module is still the cleanest seam. It keeps evaluation logic cohesive without polluting `delta.ts`, whose job is delta emission/replay ownership.
4. `trace-eval.ts` must depend on `reconstructPerPlayerVarTrajectory` from `sim/delta.ts` for `resourceTension` and `dramaMeasure` instead of duplicating any replay/path parsing logic.
5. The module should expose one public entry point, `evaluateTrace`, plus file-local helpers for each metric. That keeps the public surface small and leaves room for 11EVADEGDET-004 to extend the same seam with degeneracy detection.
6. It would be worse architecture to spread per-metric helpers across multiple files or to introduce a separate “metric registry” abstraction now. The evaluator surface is still small, and premature abstraction would make the extension path harder rather than cleaner.
7. If `interactionProxy` needs to classify `perPlayerVars.<playerId>.<varName>` delta paths, that parser should be reused from `sim/delta.ts` via a small shared export rather than duplicated in `trace-eval.ts`.

## What to Change

### 1. Create `packages/engine/src/sim/trace-eval.ts`

Implement `evaluateTrace(trace: GameTrace, config?: EvalConfig): TraceEval`.

Internal metric helpers (all pure functions):

- `computeGameLength(trace)` → `trace.turnsCount`
- `computeAvgBranchingFactor(moves)` → `mean(moves.map(m => m.legalMoveCount))`
- `computeActionDiversity(moves)` → normalized Shannon entropy of `actionId` frequencies
- `computeResourceTension(trajectory)` → mean cross-player variance across numeric variables and turns
- `computeInteractionProxy(moves)` → mean ratio of cross-player deltas to total perPlayerVar deltas
- `computeDominantActionFreq(moves)` → `max(freq) / total`
- `computeDramaMeasure(trajectory, scoringVar, turnsCount)` → lead changes / turnsCount

Edge cases per spec:
- Empty `moves` → all metrics default to 0
- Single distinct action → `actionDiversity = 0` (avoid division by zero in `H_max`)
- No `perPlayerVars` deltas in a move → skip that move in `interactionProxy` mean
- No `scoringVar` in config → `dramaMeasure = 0`
- No per-player variables present in reconstructed snapshots → `resourceTension = 0`
- Boolean per-player variables reconstructed from deltas must not be fed into numeric variance/drama calculations; only numeric values participate in those metrics
- Tied leaders must not count as a lead-change churn source; only transitions between unique leaders count toward `dramaMeasure`

Implementation notes:
- `evaluateTrace` should return a `TraceEval` with `degeneracyFlags: []` for now; 11EVADEGDET-004 owns flag detection.
- `turnCount` in the returned `TraceEval` should mirror `trace.turnsCount`.
- Merge config with `DEFAULT_EVAL_CONFIG` once near the top-level evaluator entry point rather than inside each helper.
- Keep numeric helper behavior explicit:
  - `resourceTension` uses only numeric per-player variable snapshots.
  - `dramaMeasure` uses only a numeric `scoringVar`; non-numeric or absent values are treated as “no usable score” for that turn.

### 2. Re-export from `sim/index.ts`

Add `evaluateTrace` to sim barrel export.

### 3. Share per-player delta-path parsing if needed

If `trace-eval.ts` needs to classify per-player delta paths directly (for example, `interactionProxy`), expose a small shared helper from `packages/engine/src/sim/delta.ts` and reuse it instead of copying the regex/path contract into the evaluator module.

## Files to Touch

- `packages/engine/src/sim/trace-eval.ts` (new)
- `packages/engine/src/sim/delta.ts` (modify only if needed to share per-player delta-path parsing)
- `packages/engine/src/sim/index.ts` (modify — add export)
- `packages/engine/test/unit/sim/trace-eval.test.ts` (new)

## Out of Scope

- Degeneracy flag detection (11EVADEGDET-004 — this ticket should return an empty `degeneracyFlags` array and stop there)
- Aggregation across traces (11EVADEGDET-005)
- Integration tests with real simulations (11EVADEGDET-006)
- Delta reconstruction implementation (11EVADEGDET-002 — already delivered and consumed as an import)
- Composite scores / fitness functions (explicitly out of scope per spec)
- Any schema/type changes already completed in 11EVADEGDET-001

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
10. Trace with boolean-only per-player variables → `resourceTension = 0`
11. Trace with tied leaders on intermediate turns only counts unique-leader transitions in `dramaMeasure`
12. All computed metrics are finite (not NaN, not Infinity)
13. `actionDiversity`, `interactionProxy`, `dominantActionFreq` in [0, 1]
14. `evaluateTrace(...).degeneracyFlags` is `[]` for this ticket
15. `pnpm turbo typecheck`
16. `pnpm turbo test`

### Invariants

1. `evaluateTrace` is deterministic: same trace + config → same result (Foundation §5)
2. No mutation of input trace or config (Foundation §7)
3. Bounded metrics stay in [0, 1] range as specified
4. All metrics are finite numbers
5. Engine agnosticism: no game-specific variable names or action IDs referenced in logic
6. `evaluateTrace` does not reimplement delta parsing/replay that already exists in `sim/delta.ts`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/trace-eval.test.ts`:
   - Per-metric tests with synthetic traces (hand-crafted `MoveLog` arrays)
   - Edge case: empty moves
   - Edge case: single action type
   - Edge case: no perPlayerVar deltas
   - Edge case: scoringVar absent vs present
   - Edge case: boolean per-player vars are ignored by numeric metrics
   - Edge case: tied leaders do not create artificial drama churn
   - Contract: `degeneracyFlags` is empty in this ticket
   - Property: all metrics finite for any valid trace
   - Property: bounded metrics in [0, 1]

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/sim/trace-eval.test.js`
3. `pnpm turbo typecheck`
4. `pnpm turbo test`

## Outcome

- Completion date: 2026-03-29
- What actually changed:
  - Corrected the ticket scope before implementation so it reflects that 11EVADEGDET-001 and 11EVADEGDET-002 had already delivered evaluator contracts, schema support, and delta reconstruction.
  - Added `packages/engine/src/sim/trace-eval.ts` with `evaluateTrace(trace, config?)`, covering all 7 per-trace metrics and returning an empty `degeneracyFlags` array pending 11EVADEGDET-004.
  - Reused delta reconstruction from `packages/engine/src/sim/delta.ts` and exported the existing per-player delta-path parser so `interactionProxy` classification and delta replay share one path-contract owner.
  - Re-exported `evaluateTrace` from `packages/engine/src/sim/index.ts`.
  - Added `packages/engine/test/unit/sim/trace-eval.test.ts` covering the main metric formulas, empty traces, single-action entropy, skipped non-player deltas, boolean-only variable handling, tied-leader drama behavior, immutability, and bounded/finite metrics.
- Deviations from original plan:
  - The original ticket assumed some evaluator foundations were still pending. After reassessment, the implementation was narrowed to the missing per-trace evaluator only.
  - A small shared export was added to `packages/engine/src/sim/delta.ts` so `trace-eval.ts` would not duplicate the `perPlayerVars.<playerId>.<varName>` parsing contract.
  - `resourceTension` was implemented over post-move turn snapshots rather than including the reconstructed initial pre-turn state in the average, which is the cleaner reading of “per-turn” variance.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/sim/trace-eval.test.js`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm turbo test`
