# 179ACTSELPRE-004: Phase 1c — `previewUsage.outcomeGrantContinuation` trace surface

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-eval.ts` (trace surface), schema artifacts.
**Deps**: `archive/tickets/179ACTSELPRE-003.md`

## Problem

Spec 179 §4.3 prescribes adding a `previewUsage.outcomeGrantContinuation` block to per-decision traces with: `enabled`, `extraDepthCap`, observed `extraDepthReached`, and counts of `completed` / `postGrantCap` / `stochastic` exits. This is the Foundation 9 (Replay/Audit) and Foundation 20 (Preview Signal Integrity) surface for the new opt-in — operators investigating opponent-preview behavior in profiles that opted in must be able to see in the trace whether and how the extended drive ran. Without this block, the `postGrantCap` exit kind landed by ticket 003 is observable in the per-candidate `previewDrive.kind` but not aggregable across the decision.

## Assumption Reassessment (2026-05-17)

1. `policy-eval.ts` tracks `previewUsage` per decision — verified via brainstorm Explore agent (`policy-eval.ts:209, 269, 554, 893, 1046, 1236, 1248` for various previewUsage fields). The `readyRefStats` block is the closest analog to the new `outcomeGrantContinuation` block in shape.
2. Trace serializer flows through `packages/engine/schemas/Trace.schema.json` — adding a new optional `previewUsage.outcomeGrantContinuation` field requires schema regen.
3. Ticket 003 has landed the `postGrantCap` exit kind — this ticket aggregates it into the decision-level trace summary.

## Architecture Check

1. **Additive trace field — no shape regression for opt-out profiles.** Profiles that do not enable `outcomeGrantContinuation` emit no `outcomeGrantContinuation` block in `previewUsage` (the field is absent, not present-with-zeros). This preserves byte-identical trace shapes for the existing conformance corpus.
2. **Foundation 9 (Replay/Audit)** — the block makes the opt-in observable in deterministic trace output; replaying the same seed + profile produces the same block content.
3. **Foundation 20 (Preview Signal Integrity)** — the block extends the integrity taxonomy from per-ref (Spec 162) to per-decision aggregate counts. Consumers can distinguish "decision X had Y candidates whose post-grant continuation completed vs. Z that hit the cap" without manually walking per-candidate trace records.
4. **Bounded computation (Foundation 10)** — the block adds O(1) fields per decision (3 counts + 2 config values), not O(candidates × seats). No new memory footprint concerns.

## What to Change

### 1. Add `previewUsage.outcomeGrantContinuation` to the trace shape

In `packages/engine/src/agents/policy-eval.ts` near the `previewUsage` materialization (around lines 1046, 1236, 1248), conditionally emit:

```ts
if (input.outcomeGrantContinuation?.enabled) {
  previewUsage.outcomeGrantContinuation = {
    enabled: true,
    extraDepthCap: input.outcomeGrantContinuation.extraDepthCap,
    capClass: input.outcomeGrantContinuation.capClass,
    extraDepthReached: maxObservedPostGrantDepth,
    exitCounts: {
      completed: completedCount,         // candidates that completed post-grant successfully
      postGrantCap: postGrantCapCount,   // candidates that hit extraDepthCap
      stochastic: stochasticCount,       // candidates that exited via stochastic during post-grant continuation
    },
  };
}
```

Counters increment as the driver returns finish() results across candidates within the decision.

### 2. Regenerate schema artifacts

Add the new optional field to the relevant Trace schema (or whichever schema governs `previewUsage`). Run `pnpm turbo schema:artifacts` and commit regenerated JSON.

### 3. Trace-shape regression test

Add `packages/engine/test/architecture/preview-post-grant/trace-shape-outcome-grant-continuation.test.ts`:

```ts
// @test-class: architectural-invariant
```

Cover:
- Opt-out profile produces no `previewUsage.outcomeGrantContinuation` block (key is absent from the JSON, not present-with-zeros).
- Opt-in profile with all candidates completing produces a block with `exitCounts.completed = N`, `extraDepthReached <= extraDepthCap`.
- Opt-in profile with depth-capped candidates produces `exitCounts.postGrantCap > 0`.
- Replay determinism: same seed + same profile → byte-identical `outcomeGrantContinuation` block contents.

### 4. Document the new trace field in the schema

Add a short comment in `packages/engine/schemas/Trace.schema.json` (or equivalent) for the new field describing its purpose and citing Spec 179.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify — emit the new block)
- `packages/engine/schemas/Trace.schema.json` (regenerated; document the new field)
- `packages/engine/test/architecture/preview-post-grant/trace-shape-outcome-grant-continuation.test.ts` (new — architectural-invariant)

## Out of Scope

- Per-candidate trace fields (the `previewDrive.kind = 'postGrantCap'` per-candidate field was added by ticket 003 — this ticket only aggregates).
- Cookbook documentation of the new trace surface — owned by ticket 005.
- WASM-route trace surface alignment — owned by ticket 006 if WASM mirrors the opt-in.
- Promoting the trace aggregation script from `campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs` (ticket 001) into the engine — that script lives in the campaign and ticket 005 uses it for Phase 2 comparison; engine-side promotion is a separate concern if it arises.

## Acceptance Criteria

### Tests That Must Pass

1. `trace-shape-outcome-grant-continuation.test.ts` — all four cases (opt-out absent, opt-in completed, opt-in cap-hit, replay determinism).
2. Engine test suite green: `pnpm -F @ludoforge/engine test`.
3. Schema artifact reproducibility: `pnpm turbo schema:artifacts` idempotent.

### Invariants

1. Opt-out profiles produce traces byte-identical to today — no new field appears in their trace JSON.
2. Replay determinism (Foundation 8): same seed + profile + game → byte-identical `outcomeGrantContinuation` block across runs.
3. Counts are non-negative integers summing to the total number of candidates that entered the post-grant continuation path.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-post-grant/trace-shape-outcome-grant-continuation.test.ts` — proves the trace surface contract.

### Commands

1. Targeted: `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-post-grant/trace-shape-outcome-grant-continuation.test.js`
2. Schema regen: `pnpm turbo schema:artifacts`
3. Full engine: `pnpm -F @ludoforge/engine test`
4. Full turbo: `pnpm turbo test`
