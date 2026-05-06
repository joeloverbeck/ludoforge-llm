# 156PREVOBSUTMET-002: readyRefStats aggregator and utility classifier

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-eval.ts`, new pure-function classifier module, new unit tests
**Deps**: `archive/tickets/156PREVOBSUTMET-001.md`

## Problem

Spec 156's headline diagnostic — "did preview produce a useful, differentiating signal?" — requires aggregating ready candidates' resolved preview-ref values into per-ref distribution stats and classifying the decision-level utility. Without this aggregation, today's `previewOutcome: ready` rate is consistent with both "preview is working" and "preview is technically ready but every candidate projects to the same margin" (the Gap 3 failure mode in `reports/microturn-preview-architectural-gaps-2026-05-06.md`). This ticket implements the aggregator and the classifier, then wires them into the decision-level emit. Together they convert `readyRefStats` and `utility` from the schema-empty defaults that ticket 001 landed into populated values consumers can read.

## Assumption Reassessment (2026-05-06)

1. Ticket 001 has landed `ReadyRefStats` interface, `PREVIEW_UTILITY_VALUES` const, schema fields, and empty defaults. This ticket assumes those types exist and populates them. Verify by importing.
2. Ready candidates' resolved preview-ref values are accessible via `candidate.previewRefIds` (Set) and a per-candidate resolved-values map. Confirm the exact field name during implementation by `grep -nE "previewRefIds|previewRef.*[Vv]alue" packages/engine/src/agents/policy-eval.ts`. If the resolved values aren't trace-attached today, the aggregator pulls them from the same source the existing `evaluateConsideration` uses (`evaluation.evaluatePreviewRef(candidate, refId)` or equivalent).
3. The classifier is a pure function over `ReadyRefStats` — no I/O, no state. It belongs in a new dedicated module so it can be unit-tested in isolation and exported for downstream regression tests.
4. F#8 (Determinism): aggregator iterates candidates in `canonicalIndex` order; min/max are integer-only; comparisons via `<`/`>`, never `localeCompare`.

## Architecture Check

1. Pure-function classifier separated from the aggregator: easy to test in isolation, easy to reuse by downstream consumers (campaign analyzers, regression tests). Alternative (compute utility inline at emit time) would couple the classification logic to the trace-emit call site and force every consumer to re-derive it.
2. No game-specific logic: `readyRefStats` is keyed by generic ref id strings, the classifier reads only `distinctValueCount` per ref. Same engine code aggregates FITL, Texas Hold'em, and any future game.
3. No backwards-compatibility shims. Existing field defaults from ticket 001 (`readyRefStats: {}`, `utility: 'none'`) are replaced by populated values; no `optional` keyword, no `if (utility === undefined)` branches.

## What to Change

### 1. Classifier module — `packages/engine/src/agents/preview-utility-classifier.ts` (new)

```ts
import type { ReadyRefStats } from './policy-eval.js';

export type PreviewUtility = 'none' | 'constant' | 'lowInformation' | 'differentiating';

export const classifyPreviewUtility = (
  readyRefStats: Readonly<Record<string, ReadyRefStats>>,
): PreviewUtility => {
  const refIds = Object.keys(readyRefStats).sort();  // deterministic iteration
  if (refIds.length === 0) return 'none';
  let anyReady = false;
  let anyDistinct = false;
  let anyConstant = false;
  for (const refId of refIds) {
    const stats = readyRefStats[refId];
    if (stats === undefined) continue;
    if (stats.readyCount === 0) continue;
    anyReady = true;
    if (stats.distinctValueCount > 1) anyDistinct = true;
    else anyConstant = true;
  }
  if (!anyReady) return 'none';
  if (anyDistinct && anyConstant) return 'lowInformation';
  if (anyDistinct) return 'differentiating';
  return 'constant';
};
```

Pure, deterministic, integer-only. Sort key is the ref id string (codepoint compare via `Array.prototype.sort`'s default). No `localeCompare`.

### 2. Aggregator — `packages/engine/src/agents/policy-eval.ts`

After `finalizePreviewOutcome` resolves on every candidate, before metadata is composed, iterate ready candidates × requested ref ids:

```ts
const readyRefStats: Record<string, ReadyRefStats> = {};
for (const refId of profile.preview.requestedRefIds /* canonical iteration order */) {
  const values: number[] = [];
  for (const candidate of activeCandidates) {  // canonical-index order
    if (candidate.previewOutcome !== 'ready') continue;
    const value = evaluation.getResolvedPreviewRefValue(candidate, refId);  // exact API name TBD during implementation
    if (value !== undefined) values.push(value);
  }
  if (values.length === 0) {
    readyRefStats[refId] = { readyCount: 0, distinctValueCount: 0, min: null, max: null, range: null, allReadyValuesEqual: true };
    continue;
  }
  const distinct = new Set(values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  readyRefStats[refId] = {
    readyCount: values.length,
    distinctValueCount: distinct.size,
    min, max, range: max - min,
    allReadyValuesEqual: distinct.size === 1,
  };
}
const utility = classifyPreviewUtility(readyRefStats);
```

Wire `readyRefStats` and `utility` into the `previewUsage` object composed for the metadata.

If the resolved-ref-value accessor doesn't exist as a single API today, add it during implementation — it's a minor extension to `PolicyEvaluationContext`. Document the choice in the implementation commit.

### 3. Tests

`packages/engine/test/unit/agents/preview-utility-classifier.test.ts` (new) — pure-function tests covering all four utility values plus zero-ready and zero-ref edge cases. `architectural-invariant`.

`packages/engine/test/unit/agents/preview-ready-ref-stats-aggregator.test.ts` (new) — aggregation correctness against a constructed candidate set with hand-computed expected stats. Cover ready-uniform (single distinct value), ready-differentiated (multiple distinct values), all-gated (zero ready), mixed (some ready, some unresolved). `architectural-invariant`.

`packages/engine/test/integration/preview-utility-fitl-golden.test.ts` (new) — `golden-trace`. Pin the `exp-002` "DIFFERENTIATED decision" excerpt and the "IDENTICAL margins decision" excerpt from `reports/microturn-preview-architectural-gaps-2026-05-06.md` Appendix; assert `utility === 'differentiating'` and `'constant'` respectively.

## Files to Touch

- `packages/engine/src/agents/preview-utility-classifier.ts` (new)
- `packages/engine/src/agents/policy-eval.ts` (modify — wire aggregator into emit)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify if needed — `getResolvedPreviewRefValue` API exposure)
- `packages/engine/test/unit/agents/preview-utility-classifier.test.ts` (new)
- `packages/engine/test/unit/agents/preview-ready-ref-stats-aggregator.test.ts` (new)
- `packages/engine/test/integration/preview-utility-fitl-golden.test.ts` (new)
- `packages/engine/test/fixtures/trace/preview-utility-fitl-canary.json` (new — captured fixture for the golden test)

## Out of Scope

- Adding `readyRefStats` to the trace schema. (Ticket 001.)
- Populating `selectionReason` for non-gated candidates. (Ticket 003 for parity; Specs 157/159 for the other enumerators.)
- Synthetic-decision trace. (Ticket 004.)
- Inner-frontier `scoreContributions`. (Ticket 005.)

## Acceptance Criteria

### Tests That Must Pass

1. New: classifier returns `'none'` on empty stats, `'constant'` when every ref's `distinctValueCount === 1`, `'differentiating'` when at least one ref's count > 1 and none are constant, `'lowInformation'` when mixed.
2. New: aggregator computes correct stats over a 9-candidate hand-checked fixture.
3. New: golden trace test on the FITL canary fixture: `previewUsage.utility === 'differentiating'` for the `exp-002` "DIFFERENTIATED decision"; `=== 'constant'` for the "IDENTICAL margins decision".
4. New: aggregator is deterministic — two runs over the same ready-candidate set produce byte-identical `readyRefStats` JSON.
5. Existing engine suite: `pnpm -F @ludoforge/engine test`.
6. Existing typecheck: `pnpm turbo typecheck`.

### Invariants

1. (architectural-invariant) For every `actionSelection` decision with at least one ready candidate, `utility ∈ {'constant', 'lowInformation', 'differentiating'}`. `'none'` only when zero candidates are ready.
2. (architectural-invariant) `readyRefStats[refId].readyCount` over all `refId` equals the number of ready candidates that resolved `refId` (parity with per-candidate resolved-ref data).
3. (architectural-invariant) `readyRefStats[refId].allReadyValuesEqual === (distinctValueCount <= 1)` (definition consistency).
4. (architectural-invariant) Classifier output is pure — no dependency on iteration order beyond stable string sort of ref ids.
5. (golden-trace) FITL canary fixture re-emits byte-identical `readyRefStats` and `utility` across runs.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/preview-utility-classifier.test.ts` (new) — `architectural-invariant`. Pure-function classifier; covers all four utility values and edge cases.
2. `packages/engine/test/unit/agents/preview-ready-ref-stats-aggregator.test.ts` (new) — `architectural-invariant`. Aggregation correctness on a hand-checked fixture.
3. `packages/engine/test/integration/preview-utility-fitl-golden.test.ts` (new) — `golden-trace`. Pinned FITL canary excerpts.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- agents/preview-utility-classifier`
2. `pnpm -F @ludoforge/engine test:unit -- agents/preview-ready-ref-stats-aggregator`
3. `pnpm -F @ludoforge/engine test:integration -- preview-utility-fitl-golden`
4. `pnpm turbo lint typecheck test`
