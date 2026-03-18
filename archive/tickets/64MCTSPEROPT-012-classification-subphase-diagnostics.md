# 64MCTSPEROPT-012: Classification and Discovery Subphase Diagnostics

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel instrumentation hooks, diagnostics
**Deps**: 64MCTSPEROPT-011

## Problem

Search-side laziness reduces how often classification runs, but does not reduce the ~1s cost of each `legalChoicesEvaluate()` call. The spec (section 3.10) requires adding subphase diagnostics inside classification/discovery to identify the next optimization targets: runtime binding construction, choice-target enumeration, AST predicate evaluation, pipeline validation/cost checking.

## Assumption Reassessment (2026-03-17)

1. `legalChoicesEvaluate()` in `packages/engine/src/kernel/legal-choices.ts` is the expensive call — **confirmed**.
2. No subphase timing exists inside `legalChoicesEvaluate()` currently.
3. The spec suggests game-agnostic optimizations: compiled decision plans, memoized predicates, per-state query indexes.

## Architecture Check

1. Subphase diagnostics are non-invasive — gated behind a flag, zero-cost when disabled.
2. Instrumentation is game-agnostic — measures generic kernel phases.
3. This provides the data needed to prioritize kernel-side optimizations.

## What to Change

### 1. Add subphase timing to `legalChoicesEvaluate()`

Add optional timing hooks for:
- Binding construction time
- Choice-target enumeration time
- AST predicate evaluation time
- Pipeline validation / cost checking time

These should only run when a diagnostics flag is passed (e.g., via `LegalChoicesRuntimeOptions`).

### 2. Add subphase diagnostics to accumulator

Add to `MutableDiagnosticsAccumulator`:
- `classificationBindingTimeMs: number`
- `classificationTargetEnumTimeMs: number`
- `classificationPredicateTimeMs: number`
- `classificationPipelineTimeMs: number`

### 3. Thread diagnostics through to MCTS

The MCTS layer passes its accumulator to the classification calls. When `diagnostics: true`, classification subphase timing is captured.

### 4. Add to `MctsSearchDiagnostics` output

Expose subphase timings in the final diagnostics result.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify — add optional subphase timing hooks)
- `packages/engine/src/agents/mcts/diagnostics.ts` (modify — new subphase fields)
- `packages/engine/src/agents/mcts/materialization.ts` (modify — pass diagnostics to classification)
- `packages/engine/src/agents/mcts/state-cache.ts` (modify — pass diagnostics through)

## Out of Scope

- Actually implementing kernel-side optimizations (compiled predicates, memoization, query indexes) — those are future follow-ons.
- Changing `legalChoicesEvaluate()` behavior — this ticket only adds instrumentation.
- MCTS search logic changes
- Family widening, lazy expansion, etc.

## Acceptance Criteria

### Tests That Must Pass

1. With `diagnostics: true`, subphase timings are populated (non-zero when classification runs).
2. With `diagnostics: false`, no performance overhead — no timing calls.
3. Subphase times sum approximately to total `materializeTimeMs` (within tolerance).
4. `pnpm -F @ludoforge/engine test` — full suite passes.
5. `pnpm turbo typecheck` passes.

### Invariants

1. `legalChoicesEvaluate()` return values unchanged — diagnostics are observational only.
2. Zero-cost when diagnostics disabled.
3. No game-specific logic in instrumentation.
4. Kernel purity preserved — timing hooks don't alter state.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/classification-subphase-diagnostics.test.ts` (new) — verify subphase fields populated.
2. `packages/engine/test/unit/kernel/legal-choices-diagnostics.test.ts` (new) — verify kernel hooks work.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-18
- **What changed**:
  - `packages/engine/src/kernel/legal-choices.ts`: Added `ClassificationSubphaseTiming` interface, `createClassificationSubphaseTiming()` factory, and `classificationSubphaseTiming` option on `LegalChoicesRuntimeOptions`. Instrumented 4 subphases (binding construction, predicate evaluation, target enumeration, pipeline validation) inside `legalChoicesEvaluate()` and `legalChoicesWithPreparedContextInternal()`.
  - `packages/engine/src/agents/mcts/diagnostics.ts`: Added 4 subphase fields (`classificationBindingTimeMs`, `classificationTargetEnumTimeMs`, `classificationPredicateTimeMs`, `classificationPipelineTimeMs`) to `MutableDiagnosticsAccumulator`, `createAccumulator()`, `MctsSearchDiagnostics`, and `collectDiagnostics()`.
  - `packages/engine/src/agents/mcts/materialization.ts`: Added `buildSubphaseOptions()`/`flushSubphaseTiming()` helpers. Wired subphase timing into `classifyMovesForSearch`, `classifySingleMove`, `materializeMovesForRollout`.
  - `packages/engine/test/unit/agents/mcts/classification-subphase-diagnostics.test.ts` (new): 4 tests verifying subphase fields populated, zero overhead when disabled, sum within tolerance of materializeTimeMs.
  - `packages/engine/test/unit/kernel/legal-choices-diagnostics.test.ts` (new): 5 tests verifying kernel-level timing hooks, accumulation, return-value invariance, zero-overhead path.
- **Deviations from original plan**: `state-cache.ts` did not need modification — it already passes `acc` to materialization functions which now internally create and flush subphase timing. No other deviations.
- **Verification results**: `pnpm turbo typecheck` passes, `pnpm turbo lint` passes, `pnpm -F @ludoforge/engine test` — 5149 tests pass, 0 failures.
