# 156PREVOBSUTMET-004: Synthetic-decision trace per preview drive

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-preview.ts` (driver loop), `policy-eval.ts` (trace propagation), new tests
**Deps**: `archive/tickets/156PREVOBSUTMET-001.md`

## Problem

Today's preview drive is opaque: the trace records `previewDriveDepth` and `previewCompletionPolicy` but not the actual sequence of inner microturns the driver took or how each inner option was selected. This is the diagnostic gap that hides Gap 3 in `reports/microturn-preview-architectural-gaps-2026-05-06.md`: a govern-mode chooseOne where greedy completion picks `aid` (alphabetical) instead of `patronage` cannot be told apart from a govern-mode chooseOne where the agent's policy chose `patronage` deliberately, because both produce a `ready` outcome with no inner-step record. Spec 156's synthetic-decision trace closes the gap by capturing a per-inner-microturn record under verbose tier: depth, microturn kind, decision key, selected option, selection reason, score, contributions, completion policy.

This ticket implements the capture inside `policy-preview.ts`'s driver loop and propagates the array through `policy-eval.ts` onto the per-candidate verbose trace. Spec 159 will populate the `'microturnPolicy'` and `'fallback'` selectionReason values; this ticket only emits `'greedyAlphabetical'` because that's the only completion policy with well-defined semantics in the post-Spec-145 engine today.

## Assumption Reassessment (2026-05-06)

1. The preview driver loop sits inside `createPolicyPreviewRuntime` (`policy-preview.ts:494+`). The per-microturn application path is the call site for capturing `SyntheticDecisionTraceEntry` rows. Confirm exact line range during implementation.
2. `pickInnerDecision` (`policy-preview.ts:472-492`) is the single dispatch site selecting `pickGreedyChooseOneDecision` / `pickGreedyChooseNStepDecision` / their `agentGuided` siblings. The capture point is in or immediately after `pickInnerDecision` returns a decision.
3. `traceLevel: 'verbose'` is the existing opt-in tier (`policy-diagnostics.ts:13`). This ticket emits synthetic decisions only when verbose is requested; default `traceLevel: 'summary'` paths are unaffected.
4. Ticket 001 deliberately did not add `SyntheticDecisionTraceEntry` or a `previewDrive` sub-object because the live trace contract currently uses flat `previewDriveDepth` and `previewCompletionPolicy` fields. This ticket owns the coherent nested preview-drive schema/type migration and the population of real entries.
5. The driver may visit the same microturn kind multiple times within a single drive (e.g., a chooseN with multiple `add` steps). Each invocation produces one trace entry; depths are strictly increasing.

## Architecture Check

1. Capturing inside the driver — not at the consumer side — means the trace data is authoritative: no derivation from intermediate state, no risk of consumer-side reconstruction errors. Alternatives (consumer reconstructs from `previewDriveDepth` + state diffs; periodic state snapshots) all fan out work without authoritative semantics.
2. Engine-agnostic: `microturnKind`, `decisionKey`, `selectedOptionStableKey` are generic kernel-protocol terms. No game-specific identifiers in the engine trace.
3. No backwards-compatibility shims. Verbose tier is opt-in; non-verbose runs continue to emit summary-only traces unchanged. F#14 requires this ticket to avoid a parallel trace contract: if it introduces `candidate.previewDrive.syntheticDecisions`, it must migrate the existing flat preview-drive fields into the same nested object or otherwise prove the final schema has one authoritative preview-drive shape.

## What to Change

### 1. Driver-loop capture — `packages/engine/src/agents/policy-preview.ts`

Inside `createPolicyPreviewRuntime`'s drive loop (the section that calls `pickInnerDecision` and applies the decision), accumulate `SyntheticDecisionTraceEntry[]` per drive:

```ts
const syntheticDecisions: SyntheticDecisionTraceEntry[] = [];
let depth = 0;
while (notTerminal && depth < depthCap) {
  const microturn = publishMicroturn(state, def);
  if (microturn.kind === 'actionSelection' && /* different seat or compound retired */) break;
  const decision = pickInnerDecision(state, def, microturn, policy, input);
  if (decision === undefined) break;  // outcome: noPreviewDecision

  if (traceLevel === 'verbose') {
    depth += 1;
    syntheticDecisions.push({
      depth,
      microturnKind: microturn.kind,
      decisionKey: extractDecisionKey(decision),  // implementation: uniform field on Decision union
      selectedOptionStableKey: stableKeyFor(decision),
      selectionReason: 'greedyAlphabetical',  // Spec 159 will distinguish 'microturnPolicy' / 'fallback'
      score: 0,  // Spec 159 will populate
      scoreContributions: [],  // Spec 159 will populate
      completionPolicy: policy === 'agentGuided' ? 'greedy' : policy,  // Spec 159 will rename
    });
  }

  state = applyPublishedDecision(state, def, decision);
}
return { /* existing PreviewOutcome */, syntheticDecisions };
```

Exact code shape will follow the existing driver-loop conventions (immutability, deterministic state advancement, F#11 draft-state from Spec 146). The capture is verbose-tier-only.

### 2. Type propagation — `packages/engine/src/agents/policy-preview.ts`, `policy-eval.ts`

The per-drive `syntheticDecisions` array attaches to the per-candidate `PolicyEvaluationCandidateMetadata.previewDrive` sub-object. `policy-eval.ts` reads it from the driver's result and includes it in the verbose-tier candidate metadata. This ticket owns adding the `previewDrive` type/schema shape and reconciling the existing flat `previewDriveDepth` / `previewCompletionPolicy` fields so the repo does not retain duplicate preview-drive contracts.

### 3. Tests

`packages/engine/test/unit/agents/synthetic-decision-trace.test.ts` (new) — `architectural-invariant`. Verbose-tier driver-loop trace correctness. Cover: ordering (depth ascending), depth monotonicity (strictly increasing), one entry per inner microturn taken, microturnKind matches the kernel-published kind.

`packages/engine/test/unit/agents/synthetic-decision-replay-identity.test.ts` (new) — `architectural-invariant`. Two runs over the same GameDef + seed produce byte-identical `syntheticDecisions[]` arrays.

`packages/engine/test/integration/synthetic-decision-fitl-canary-golden.test.ts` (new) — `golden-trace`. Pinned FITL fixture with verbose tier; assert exact synthetic-decisions array on a frozen seed.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify — driver-loop capture)
- `packages/engine/src/agents/policy-eval.ts` (modify — propagate syntheticDecisions onto candidate metadata)
- `packages/engine/test/unit/agents/synthetic-decision-trace.test.ts` (new)
- `packages/engine/test/unit/agents/synthetic-decision-replay-identity.test.ts` (new)
- `packages/engine/test/integration/synthetic-decision-fitl-canary-golden.test.ts` (new)
- `packages/engine/test/fixtures/trace/synthetic-decision-fitl-canary.json` (new — fixture for golden test)

## Out of Scope

- Populating `selectionReason: 'microturnPolicy' | 'fallback'`. (Spec 159 — when `policyGuided` lands.)
- Populating real `score` and `scoreContributions` in synthetic-decision entries. (Spec 159.)
- Renaming `agentGuided` → `policyGuided` in the `completionPolicy` field. (Spec 159.)
- Per-option preview at inner microturns. (Spec 160.)
- Per-candidate `selectionReason`. (Ticket 003 — different surface; same enum name, different schema location.)

## Acceptance Criteria

### Tests That Must Pass

1. New: synthetic-decision trace contains one entry per inner microturn taken; depths are strictly increasing 1..N; `microturnKind` matches `kernel.publishMicroturn(state).kind` at each step.
2. New: replay-identity — two runs over the same GameDef + seed produce byte-identical `syntheticDecisions[]` JSON.
3. New: under `traceLevel: 'summary'`, `syntheticDecisions` is omitted (no behavior change for non-verbose consumers).
4. New: golden FITL canary trace matches a frozen fixture under verbose tier.
5. Existing engine suite: `pnpm -F @ludoforge/engine test`.
6. Existing typecheck: `pnpm turbo typecheck`.

### Invariants

1. (architectural-invariant) `syntheticDecisions[].depth` is strictly increasing within a single drive (1, 2, 3, ...).
2. (architectural-invariant) `syntheticDecisions.length` ≤ `depthCap` (F#10).
3. (architectural-invariant) Replay-identity: `syntheticDecisions[]` is byte-identical across runs (F#8).
4. (architectural-invariant) Verbose-tier-only emission: `traceLevel: 'summary'` produces no `syntheticDecisions` field (or undefined).
5. (architectural-invariant) Each entry's `selectedOptionStableKey` matches the `Decision` actually applied to draft state at that depth.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/synthetic-decision-trace.test.ts` (new) — `architectural-invariant`. Driver-loop trace correctness.
2. `packages/engine/test/unit/agents/synthetic-decision-replay-identity.test.ts` (new) — `architectural-invariant`. Replay-identity.
3. `packages/engine/test/integration/synthetic-decision-fitl-canary-golden.test.ts` (new) — `golden-trace`. Pinned canary fixture.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- agents/synthetic-decision-trace`
2. `pnpm -F @ludoforge/engine test:unit -- agents/synthetic-decision-replay-identity`
3. `pnpm -F @ludoforge/engine test:integration -- synthetic-decision-fitl-canary-golden`
4. `pnpm turbo lint typecheck test`
