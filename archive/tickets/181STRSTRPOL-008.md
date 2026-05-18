# 181STRSTRPOL-008: Phase 1 — Trace integration (`selectors` field on PolicyAgentDecisionTrace)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/agents/policy-eval.ts`
**Deps**: `archive/tickets/181STRSTRPOL-007.md`

## Problem

The selector runtime from 007 evaluates and feeds refs into considerations, but the trace produced by `policy-eval.ts` doesn't surface the selector contributions yet. Operators investigating "why did the agent pick this candidate" need to see which selector items ranked, what their quality components scored, and whether `impactSatisfied` was true — without rerunning with verbose tracing. Spec 181 §5.6 specifies a new `selectors` field on `PolicyAgentDecisionTrace`, capped at top-K selected entries per selector.

## Assumption Reassessment (2026-05-18)

1. `PolicyAgentDecisionTrace` lives at `packages/engine/src/kernel/types-core.ts:2123-2148`. Adding a `selectors` field is additive; downstream readers must not assume the field is absent. Confirmed by Step 2 verification.
2. Trace cap discipline from Spec 162 / 180 (top-K, stable ordering, truncation markers, interned ids) is the precedent. Selector trace honours the same caps.
3. Default trace level is `'summary'` (Spec 181 §10); selector trace at summary level emits the selected item only. `'verbose'` emits top-K (default K=5).

## Architecture Check

1. Trace is downstream-only — no kernel logic change, no scoring change (Foundation #5, #11).
2. Top-K cap + stable ordering ensure trace cost is bounded (Foundation #10).
3. Trace bytes increase is bounded: summary mode adds ~1 line per active selector; verbose mode adds ≤ K * components per selector. Spec §13.6 budget gate applies — confirmed by 005's overhead measurement.

## What to Change

### 1. Trace type extension

`packages/engine/src/kernel/types-core.ts:2123-2148` — extend `PolicyAgentDecisionTrace` with:

```ts
readonly selectors?: ReadonlyArray<SelectorTraceEntry>;

type SelectorTraceEntry = {
  readonly selectorId: SelectorId;
  readonly selectedKey?: string;                       // primary (rank-1) item key; absent if empty
  readonly selectedQuality?: number;
  readonly selectedRank?: number;                      // always 1 by construction when present
  readonly impactSatisfied: boolean;
  readonly emptyReason?: 'whereExcludedAll' | 'sourceEmpty' | 'minImpactFailed';
  readonly components?: ReadonlyMap<ComponentId, number>;
  readonly topK?: ReadonlyArray<SelectorTopKEntry>;    // verbose mode only; absent at summary
  readonly truncated?: boolean;                        // true if more items existed beyond top-K
};

type SelectorTopKEntry = {
  readonly key: string;
  readonly quality: number;
  readonly rank: number;
  readonly components: ReadonlyMap<ComponentId, number>;
};
```

### 2. Trace producer

In `policy-eval.ts`, after each selector evaluation in 007's cache, materialise a `SelectorTraceEntry` from the cached `SelectedSelectorView`:

- Summary mode: `selectorId`, `selectedKey`, `selectedQuality`, `selectedRank` (always 1), `impactSatisfied`, `components` (rank-1 only). No `topK`. `truncated` reflects whether the underlying `view.selected.length > 1`.
- Verbose mode: same plus `topK` populated with up to K=5 entries (configurable via profile-level `selector.traceTopK` setting; default 5).

Selectors that did not evaluate during this decision (cost-class skipped due to scope, or cache miss because consideration didn't reference them) are NOT added to the trace — only active selectors surface.

Stable ordering: `selectors` array is ordered by `selectorId` ascending (interned id sort) for deterministic trace bytes.

### 3. Interned-id discipline

Reuse the existing interned-id pattern for trace ids (matches Spec 180 trace shape). New `SelectorId` interns join the same pool.

### 4. Backward-compatibility audit

Search for `PolicyAgentDecisionTrace` consumers (golden trace fixtures, trace serialisers, runner UI). Any consumer that destructures the trace must tolerate the new optional `selectors` field. Foundation #14 — no shims; readers that need the new field add it now in this ticket.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — extend `PolicyAgentDecisionTrace`, add `SelectorTraceEntry` / `SelectorTopKEntry`)
- `packages/engine/src/agents/policy-eval.ts` (modify — trace producer for `selectors` field)
- `packages/engine/test/agents/policy-selector-trace.test.ts` (new — trace shape + summary/verbose split + stable ordering tests)
- Any golden trace fixtures that include selector-using profiles (re-bless with `Re-bless golden trace:` rationale per `.claude/rules/testing.md` if any exist; otherwise no change)

## Out of Scope

- Conformance tests (009, 010, 011).
- ARVN migration (012).
- Runner UI changes to surface selector trace (out of engine scope; runner ticket would be separate).

## Acceptance Criteria

### Tests That Must Pass

1. `policy-selector-trace.test.ts` — summary mode emits one `SelectorTraceEntry` per active selector with primary item only.
2. `policy-selector-trace.test.ts` — verbose mode emits up to K=5 `topK` entries per selector.
3. `policy-selector-trace.test.ts` — stable ordering: `selectors` array is sorted by `selectorId` ascending; two runs produce bit-identical bytes.
4. `policy-selector-trace.test.ts` — empty selectors (`onEmpty: 'traceAndNoContribution'`) emit a `SelectorTraceEntry` with `selectedKey` absent and `emptyReason` populated.
5. `policy-selector-trace.test.ts` — selectors not evaluated this decision do NOT appear in the trace.
6. Existing trace tests: no regression after the additive field.
7. Existing suite: `pnpm turbo test`

### Invariants

1. Trace is deterministic — same inputs → bit-identical `selectors` bytes (Foundation #8).
2. Summary trace cost is bounded (Foundation #10): one entry per active selector, primary item only.
3. Top-K cap enforced in verbose mode.
4. No selector triggers a preview drive solely to populate trace (consumes already-computed view from 007's cache).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/agents/policy-selector-trace.test.ts` — trace shape, summary/verbose split, stable ordering, empty case.

### Commands

1. `pnpm -F @ludoforge/engine test -- policy-selector-trace`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome (2026-05-18)

Implemented the selector trace integration:

1. Added `PolicySelectorTraceEntry` / `PolicySelectorTopKTraceEntry` and optional `selectors` on `PolicyAgentDecisionTrace`.
2. Exposed evaluated selector trace entries from `PolicyEvaluationContext`, sourced only from the selector cache so trace collection does not force extra selector or preview evaluation.
3. Threaded selector traces through `PolicyEvaluationMetadata` and `buildPolicyAgentDecisionTrace`.
4. Added `packages/engine/test/unit/agents/policy-selector-trace.test.ts` covering summary entries, verbose top-K cap, deterministic bytes, empty selector traces, and omission of unevaluated selectors.

Implementation note: component maps use `Readonly<Record<string, number>>` rather than runtime `Map` objects because the existing trace surface is JSON-shaped and serializes records deterministically.

## Verification (2026-05-18)

Passing:

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/agents/policy-selector-trace.test.js packages/engine/dist/test/unit/agents/policy-selector-eval.test.js packages/engine/dist/test/unit/infrastructure/test-class-markers.test.js`
3. `pnpm -F @ludoforge/engine run schema:artifacts:check`
4. `pnpm run check:ticket-deps`
5. `git diff --check`
6. `pnpm turbo build`
7. `pnpm turbo lint`
8. `pnpm turbo typecheck`

Red, unchanged from the known broad-suite state:

1. `pnpm turbo test` still fails in `dist/test/architecture/policy-preview-inner-outcome-parity.test.js` for Spec 178 ARVN continuedDeepening seeds `1005`, `1011`, `1008`, `1013`, and `1009`, with turnId/golden drift in the `arvn-evolved` outcome-parity fixture. Unit tests, runner tests, and the new selector trace tests pass before the architecture lane reaches that existing failure.

Source size check:

1. `packages/engine/src/kernel/types-core.ts` — 2483 lines, pre-existing shared kernel type file.
2. `packages/engine/src/agents/policy-evaluation-core.ts` — 2394 lines, pre-existing shared runtime file.
3. `packages/engine/src/agents/policy-eval.ts` — 1634 lines, pre-existing shared runtime file.
4. `packages/engine/src/agents/policy-diagnostics.ts` — 412 lines.
5. `packages/engine/test/unit/agents/policy-selector-trace.test.ts` — 215 lines.
