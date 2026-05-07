# Spec 161: chooseNStep Inner Preview Integration

**Status**: PROPOSED
**Priority**: P2 (closes the architectural gap surfaced by `reports/preview-inner-choosenstep-architectural-gap-2026-05-07.md`. Spec 160 landed `chooseOne` per-option preview but explicitly deferred the `chooseNStep` agent-runtime integration; the documented `preview.inner.chooseNStep: true` flag is currently a silent no-op with no compile-time warning, no trace evidence, and no behavioral effect.)
**Complexity**: M (new per-root-option preview driver wrapping the existing beam driver, runtime adapter parity with `chooseOne`, compiler validation update for the squared-cost formula, sibling-file extraction to respect the 800-line cap. No new ref family, no kernel-level changes.)
**Dependencies**:
- Spec 160 [per-option-preview-inner-microturns] (archived) — established `preview.inner` config, `preview.option.*` ref family, `chooseOne` per-option driver, `chooseNStep` beam driver, and `INNER_PREVIEW_HARD_CAP = 256`. This spec finishes the deferred `chooseNStep` runtime-integration deliverable.
- Spec 159 [preview-policy-guided-completion] (archived) — per-option continuation drives use `policyGuided` via the `pickInnerDecision` shared helper.
- Spec 158 [microturn-policy-scope-and-refs] (archived) — `microturn` scope and `preview.option.*` refs are consumed by the existing chooseN microturn evaluator at `microturn-option-evaluator.ts:154`.
- Spec 156 [preview-observability-and-utility-metrics] (archived) — `chooseNStep` `previewUsage` shape uses the same `mode`/`outcomeBreakdown`/`readyRefStats`/`utility` fields as `chooseOne`.
- Spec 146 [scoped-draft-state-for-preview-drive] (archived) — `createMutableState` provides bounded copy-on-write isolation for each per-option drive.
- Foundation 4 (Authoritative State and Observer Views) — per-option `preview.option.*` resolution honors hidden-information policy via the existing `policy-surface.ts` plumbing reused by Spec 160.
- Foundation 10 (Bounded Computation) — squared-cost formula `maxOptions × (1 + chooseNBeamWidth × maxOptions × max(0, depthCap − 1)) ≤ INNER_PREVIEW_HARD_CAP` is the corrected static bound; existing per-microturn cost cap remains 256.
- Foundation 14 (No Backwards Compatibility) — boolean `preview.inner.chooseNStep` surface stays; no shim or deprecation alias.
- Foundation 15 (Architectural Completeness) — the spec is complete: it adds the runtime adapter, the dispatch, the warning parity, the corrected cost bound, and a structural audit test that prevents recurrence of the silent-no-op pattern.
- Foundation 19 (Decision-Granularity Uniformity) — `chooseNStep` per-option preview is the per-published-decision analog of `chooseOne` per-option preview; the agent's microturn evaluator consumes refs uniformly across both decision kinds.

**Source**:
- `reports/preview-inner-choosenstep-architectural-gap-2026-05-07.md` — full code-level audit of the gap, ticket archaeology, and trace evidence (campaign `fitl-arvn-agent-evolution` exp-003).
- `reports/preview-inner-choosenstep-proposal.md` — external deep-research proposal (Interpretation X selected, with adjustments documented in `## Brainstorm Context` below).
- `archive/specs/160-per-option-preview-inner-microturns.md` — predecessor spec, particularly §6 trace integration and §"Out of Scope".
- `archive/tickets/160PEROPTPREV-006.md`, `archive/tickets/160PEROPTPREV-007.md` — tickets that explicitly carved out the `chooseNStep` agent integration as a follow-up that never landed.
- Code anchors:
  - `packages/engine/src/agents/policy-agent.ts:266` — `chooseFrontierDecision` calls `createPolicyAgentChooseOneInnerPreview` unconditionally; the `chooseNStep` dispatch is missing.
  - `packages/engine/src/agents/policy-agent.ts:106` — `chooseStructuralFrontierDecision` definition (called at line 317); its `innerPreview` parameter type changes to the shared interface in Phase B.
  - `packages/engine/src/agents/policy-agent-inner-preview.ts:147` — `createPolicyAgentChooseOneInnerPreview` adapter; this spec adds a `chooseNStep` sibling.
  - `packages/engine/src/agents/policy-preview-inner.ts:65` — `InnerPreviewBaseInput` interface (currently not exported; Phase A exports it so the new sibling file can extend it).
  - `packages/engine/src/agents/policy-preview-inner.ts:664` — `runChooseNStepBeamPreview` driver (zero non-test callers).
  - `packages/engine/src/agents/microturn-option-evaluator.ts:42` — `scoreContributionsKeyForChooseNStepAdd` defines the per-ADD keying convention the per-option preview map must match.
  - `packages/engine/src/agents/microturn-option-evaluator.ts:154` — chooseN evaluator already consumes `previewOptionResolvedRefsByOptionKey` keyed by ADD value; the wiring is in place but is fed `undefined` because the chooseNStep adapter does not exist.
  - `packages/engine/src/cnl/compile-agents.ts:1018` — current triple-product cap; this spec replaces it with the squared-cost formula when `chooseNStep: true`.
  - `packages/engine/src/cnl/compiler-diagnostic-codes.ts:261` — existing `CNL_COMPILER_AGENT_PREVIEW_INNER_TRIPLE_PRODUCT_EXCEEDED` diagnostic; renamed to `CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP` in Phase C (F#14, clean migration — original name reflects the obsolete single-formula state).
  - `packages/engine/src/cnl/validate-agents.ts:177` — `chooseOne`-only opt-in warning gate; this spec extends it to `chooseNStep`.

## Brainstorm Context

### Original framing

Spec 160 added per-option preview at inner microturns, with two shapes: `chooseOne` (per-option drive returning per-option resolved refs) and `chooseNStep` (beam search returning whole-path resolved refs at end-of-beam states). The `chooseOne` shape integrated cleanly into the agent's microturn evaluator because each option has its own keyed ref-map. The `chooseNStep` shape did not — the beam returns refs at the END of full partial selections, not at the next-step decision granularity that the chooseN microturn evaluator consumes.

Ticket `160PEROPTPREV-007` carved this out explicitly: *"chooseN beam trace propagation — covered structurally by ticket 006's beam pruning trace; this ticket integrates only the chooseOne path."* The spec was archived with the deferral noted but no follow-up ticket. The compiler accepted `preview.inner.chooseNStep: true`, the cookbook documented it as a real toggle, but the agent runtime never invoked the driver from `chooseFrontierDecision`. Setting the flag is a silent no-op.

### Proposal-vs-codebase reassessment

`reports/preview-inner-choosenstep-proposal.md` was produced by an external LLM without codebase access. Reassessment confirms the proposal's principal claims and recommendation (Interpretation X — per-root-option forced continuation beam), with the following adjustments derived from direct inspection:

- **DSL stays boolean.** The proposal's nested `chooseNStep: { enabled: true, mode: perOptionContinuationBeam, rootOptionCap, branchOptionCap, beamWidth, depthCap, hardNodeCap }` is rejected. The existing boolean surface `preview.inner.chooseNStep: true` plus the existing `maxOptions` / `chooseNBeamWidth` / `depthCap` fields carry the same information; restructuring is gratuitous churn (F#14 forbids shims, but it does not mandate breaking DSL when the same shape works). One mode is supported for now; future modes become explicit DSL choices when added.
- **Runtime cap truncation is rejected.** The proposal adds `rootOptionCap` / `branchOptionCap` / runtime skip-and-emit behavior with `rootSkippedCount` / `capped` trace fields. Existing `runChooseOneInnerPreview` and `runChooseNStepBeamPreview` iterate all legal options without runtime truncation; `maxOptions` is an operator-declared static upper bound that the compile-time triple-product check uses. Introducing runtime truncation would be inconsistent with the existing architecture and would let an under-estimated `maxOptions` produce silent partial coverage. The corrected compile-time cost formula is the right fix.
- **CONFIRM is not a per-option-scored option.** The chooseN microturn evaluator at `microturn-option-evaluator.ts:154` only keys ADD options via `scoreContributionsKeyForChooseNStepAdd(request, value)`; CONFIRM has no per-option scoring path. Per-option preview for CONFIRM would not be consumed even if computed. The driver therefore evaluates each legal ADD root option only; CONFIRM continues to be selected by the existing set-completion logic in `matchGuidedChooseNStepDecision`.
- **`fallbackCompletionPolicy: fail` is deferred.** The proposal raises a real concern (trace shows `completionPolicyFallbackCount: 33` co-existing with every drive returning `ready` under `fallbackCompletionPolicy: fail`). This is orthogonal to the chooseNStep integration and may be a separate semantics or naming bug. Combining them risks scope creep; a follow-up spec covers it.
- **Per-option key convention.** The new driver MUST emit refs keyed by `scoreContributionsKeyForChooseNStepAdd(request, value)`-equivalent strings — i.e., `chooseNStep:<decisionKey>:add:<JSON.stringify(value)>`. The existing `chooseNStepStableMoveKey(decision)` helper at `policy-preview-inner.ts:134` produces the same string for ADD decisions; the spec mandates that the runtime adapter use a key derivation that matches both the beam driver's internal key and the microturn evaluator's consumption key. `frontierDecisionKey` (used by the agent's outer trace shape) MUST also produce a compatible key for ADD decisions so the existing `previewByOptionKey.get(frontierDecisionKey(...))` lookup at `policy-agent.ts:290` returns the per-option entry.

### Motivation

1. **Silent no-ops violate F#15.** The compiler accepting a flag, the cookbook documenting it, and the runtime ignoring it is exactly the architectural-incompleteness anti-pattern Foundation 15 forbids. Spec 161 closes the gap completely or removes the flag — the current state is unacceptable.
2. **Operators expect uniform semantics across inner microturns.** The cookbook's worked example for `preferOptionProjectedMargin` is presented uniformly across `chooseOne` and `chooseNStep`. Authors reasonably expect a microturn-scope consideration referencing `preview.option.delta.victory.currentMargin.self` to differentiate options at both decision kinds. Today it works at `chooseOne` and silently does not at `chooseNStep`.
3. **The campaign evidence is concrete.** ARVN seed 1000 had 11 `chooseNStep` decisions, 5/11 tied. Without per-option preview, ties are broken by stable-key alphabetical ordering — a heuristic with no policy-quality signal. With per-option preview, projected-margin deltas differentiate options the same way they do at `chooseOne` (12/24 chooseOne ties broken by exp-001).

### Alternatives explicitly considered

- **Y — Beam rubber-stamp.** Run one beam, take `best.partialSelection[0]` as the recommended next ADD, bypass the chooseN microturn evaluator's per-ADD scoring. **Rejected.** Inconsistent with `chooseOne` semantics; microturn-scope considerations behave differently across inner kinds; weakens trace explainability (the trace would show "beam chose this" without per-ADD score contributions).
- **Z — Reject the flag at compile time.** Change the compiler to error on `preview.inner.chooseNStep: true` and update the cookbook. **Rejected as primary fix** but accepted as a fallback if Spec 161 is blocked. Drops a documented feature; orphans the existing driver and tests.
- **W — Quick-and-dirty wire-through.** Wire `runChooseNStepBeamPreview` minimally; expose `beam.best.resolvedRefs` as a single shared map. **Rejected.** Every option sees the same refs, so `preview.option.delta.victory.currentMargin.self` does not differentiate options. Worse than not wiring it.
- **CONFIRM-as-per-option-scored.** Extend the chooseN microturn evaluator to score CONFIRM as a first-class option. **Rejected for Spec 161** — would require redesigning the evaluator's set-assembly logic. The current "pick the desired set, then walk ADDs until complete, then CONFIRM" pattern is fine; per-option preview for CONFIRM is a separate question.
- **Restructure DSL to nested per-kind config blocks.** **Rejected.** Boolean surface carries the same information.

### User constraints reflected

F#1 (engine-agnostic — no game-specific identifiers in the new driver), F#4 (hidden-info routing reuses Spec 160's existing `policy-surface.ts` path), F#7 (refs are declarative), F#8 (deterministic — same Spec 146 draft-state isolation; same tie-breaks; per-root-option iteration in stable order), F#10 (corrected cost formula bounds total work), F#11 (per-root-option drafts are independent — no aliasing), F#14 (no shim — boolean DSL preserved), F#15 (complete fix: driver + adapter + dispatch + warning + cost-formula + audit test), F#16 (architectural-invariant tests prove every property), F#19 (per-option preview at chooseNStep is the per-published-decision analog of per-option preview at chooseOne).

## Overview

Three deliverables, parallel to Spec 160's `chooseOne` integration:

1. **`runChooseNStepInnerPreview` driver** in a new sibling file `policy-preview-inner-choosenstep.ts`. For each legal next-step ADD decision: applies it to a Spec 146 draft, runs `runChooseNStepBeamPreview` for `depthCap − 1` continuation steps on the resulting state, takes `beam.best.resolvedRefs` as that root option's `resolvedRefs`. Returns a per-root-option `{ options[], outcomeBreakdown }` shape mirroring `ChooseOneInnerPreviewRun`.
2. **`createPolicyAgentChooseNStepInnerPreview` runtime adapter** in `policy-agent-inner-preview.ts`. Same shape as the chooseOne adapter (`run, refIds, usage, byOptionKey, refsByOptionKey`). `chooseFrontierDecision` dispatches by microturn kind so both kinds populate `previewUsage` and `refsByOptionKey` uniformly.
3. **Compiler validation parity**: the `INNER_PREVIEW_HARD_CAP` check uses the squared-cost formula when `chooseNStep: true`; the existing `CNL_COMPILER_AGENT_PREVIEW_INNER_TRIPLE_PRODUCT_EXCEEDED` diagnostic is renamed to `CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP` (per F#14, the formula-specific name no longer fits); the `CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION` warning fires for `chooseNStep: true` without a microturn-scope `preview.option.*` consideration.

Plus an architectural audit test that enumerates compiled `preview.inner` config fields and verifies every field has a runtime consumer, a compiler diagnostic that forbids it, or an explicit trace-only marker. This is the structural guardrail that prevents recurrence of the silent-no-op pattern.

## Phase Acceptance Budget

| Phase | Deliverable | Acceptance Criterion | Effort |
|-------|-------------|----------------------|--------|
| Phase A | Sibling-file extraction + `runChooseNStepInnerPreview` driver | The chooseNStep beam types and `runChooseNStepBeamPreview` move to `policy-preview-inner-choosenstep.ts`; `InnerPreviewBaseInput` is exported from `policy-preview-inner.ts` (currently internal at line 65) so the sibling file can extend it; `policy-preview-inner.ts` drops below 700 lines; the new file exports `runChooseNStepInnerPreview` whose per-root-option iteration produces one entry per legal ADD decision keyed by `chooseNStep:<decisionKey>:add:<JSON(value)>`; the existing beam-driver test (`policy-preview-inner-choosen-beam.test.ts`) passes against the relocated driver. | M |
| Phase B | Runtime adapter + dispatch + warning parity | `createPolicyAgentChooseNStepInnerPreview` exists and returns a structurally compatible `PolicyAgentInnerPreview` (a shared structural interface — no discriminator field — unifies the `chooseOne` and `chooseNStep` adapters' shapes); `chooseFrontierDecision` dispatches by microturn kind and downstream metadata-construction code consumes both via the same shape; setting `preview.inner.chooseNStep: true` on a profile produces non-`disabled` `previewUsage` at every chooseNStep microturn; `CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION` fires for `chooseNStep: true` profiles missing a `preview.option.*` consideration. | M |
| Phase C | Cost-formula validation + diagnostic rename | Compile-time validation uses `maxOptions × (1 + chooseNBeamWidth × maxOptions × max(0, depthCap − 1))` when `chooseNStep: true` and the existing `maxOptions × chooseNBeamWidth × depthCap` formula otherwise; profiles that violate the corrected formula fail compilation with a clear diagnostic; ARVN's `8 × 1 × 4` (squared = 200) compiles cleanly under the 256 cap. The existing `CNL_COMPILER_AGENT_PREVIEW_INNER_TRIPLE_PRODUCT_EXCEEDED` diagnostic is renamed to `CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP` (F#14: rename in `compiler-diagnostic-codes.ts:261`, update emission site at `compile-agents.ts:1020`, update assertion at `test/unit/cnl/compile-preview-inner.test.ts:97`). | S |
| Phase D | Tests + structural audit | Per-option iteration covers every legal ADD; per-option drives are independent (no aliasing); deterministic ordering; differentiation invariant (different ADDs produce different refs on a constructed fixture); replay-identity; default-off byte-identical trace; budget enforcement (corrected formula above cap fails compilation); hidden-info safety; structural audit test enumerates compiled `preview.inner` fields and asserts each has a runtime consumer or a compiler diagnostic. | M |

## Architecture Check

1. **Why this approach is cleaner than alternatives.** Per-root-option forced continuation beam reuses the existing `runChooseNStepBeamPreview` as a continuation evaluator. No new beam algorithm; no new ref family. The only new code is the per-root-option wrapper, the runtime adapter, the dispatch update, and the corrected compile-time cost formula. Each piece has a direct chooseOne analog already landed by Spec 160.
2. **GameSpecDoc vs runtime boundary.** `preview.inner.chooseNStep` is engine-generic config; the new driver does not introduce game-specific identifiers. The actual per-option signal (e.g., "ARVN prefers patrol with high projected margin in zone X") lives in microturn-scope considerations under the profile YAML. F#1 honored.
3. **No backwards-compatibility shims.** Default remains `false`. Existing profiles with `chooseNStep: false` see no behavioral change; profiles that opt in get the new behavior. The compile-time formula migration (replacing the triple product with the squared formula when `chooseNStep: true`) is a strict tightening — profiles that currently compile remain compiling unless they cross the corrected bound. F#14 honored.
4. **Determinism.** Per-root-option iteration in stable lexicographic order over `chooseNStep:<decisionKey>:add:<JSON(value)>` keys. Each per-root-option draft is an independent Spec 146 `createMutableState`. Continuation beam tie-breaking already deterministic in `runChooseNStepBeamPreview`. F#8 honored.
5. **Bounded computation.** Squared-cost formula with the existing 256 hard cap. F#10 honored.
6. **Hidden-info routing.** Per-root-option ref resolution flows through the same `resolveRefs` / `policy-surface.ts` path Spec 160 used for chooseOne; `unknownHidden` propagates to `preview.option.*` refs and `outcomeBreakdown.unknownHidden` increments accordingly. F#4 honored.

## What to Change

### 1. Sibling-file extraction — `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` (new), `packages/engine/src/agents/policy-preview-inner.ts` (modify)

Move the following from `policy-preview-inner.ts` to the new sibling file:
- Type aliases: `ChooseNStepDecision`, `ChooseNStepMicroturn`.
- Interfaces: `RunChooseNStepBeamPreviewInput`, `ChooseNStepBeamPrunedTraceEntry`, `ChooseNStepBeamResult`, `ChooseNStepBeamPreviewRun`.
- Helpers: `chooseNStepStableMoveKey`, the `BeamPartial` / `BeamCandidate` internals used by the beam driver, `scoreChooseNStepCandidate`, `resolveBeamResult`.
- Function: `runChooseNStepBeamPreview`.

`policy-preview-inner.ts` keeps the chooseOne driver, the shared `InnerPreviewBaseInput` interface, the shared `previewOptionRefKey` helper, and shared `resolveRefs` / surface-resolution helpers. Both files import from `policy-surface.ts`, `policy-preview.ts`, `microturn-option-evaluator.ts`, and `microturn-option-eval.ts` directly — `InnerPreviewBaseInput` is exported from `policy-preview-inner.ts` for the sibling to extend.

The existing test file `packages/engine/test/unit/agents/policy-preview-inner-choosen-beam.test.ts` updates its import path to the new location. F#14 — clean refactor, no re-export shim.

### 2. New driver — `packages/engine/src/agents/policy-preview-inner-choosenstep.ts`

```ts
export interface RunChooseNStepInnerPreviewInput extends InnerPreviewBaseInput {
  readonly microturn: ChooseNStepMicroturn;
  readonly beamWidth?: number;
}

export interface ChooseNStepInnerPreviewResult {
  readonly decision: ChooseNStepDecision;        // the legal ADD decision (root option)
  readonly stableMoveKey: string;                // chooseNStep:<decisionKey>:add:<JSON(value)>
  readonly resolvedRefs: ReadonlyMap<string, PolicyValue>;
  readonly driveDepth: number;
  readonly outcome: PolicyPreviewTraceOutcome;
  readonly previewDrive: PolicyPreviewDriveTrace;
  readonly completionPolicyFallbackCount: number;
  readonly continuationBeam: ChooseNStepBeamPreviewRun | null;
}

export interface ChooseNStepInnerPreviewRun {
  readonly options: readonly ChooseNStepInnerPreviewResult[];
  readonly outcomeBreakdown: PolicyPreviewOutcomeBreakdownTrace;
  readonly evaluatedCandidateCount: number;       // sum across all per-root drives
}

export function runChooseNStepInnerPreview(input: RunChooseNStepInnerPreviewInput): ChooseNStepInnerPreviewRun;
```

Algorithm per root ADD decision `D`:
1. `seatResolutionIndex` and `surfaceContext` set up identically to `runChooseNStepBeamPreview`.
2. Snapshot a draft via `createMutableState(input.state)`, then apply `D` via `applyPublishedDecision` with `advanceToDecisionPoint: true` and freeze. Record `score` contribution from the forced ADD via `scoreChooseNStepCandidate` for trace-shape parity (not used to differentiate root options — they are evaluated in declaration order, not ranked).
3. Inspect the resulting microturn:
   - If still inside the same `chooseNStep` (same `seatId`, `turnId`, `kind: 'chooseNStep'`), invoke `runChooseNStepBeamPreview` against the post-ADD state with `depthCap = max(0, originalDepthCap − 1)` and the configured `beamWidth`. Take `beam.best.resolvedRefs` as `D`'s `resolvedRefs`. The `continuationBeam` field captures the full beam run for trace propagation.
   - If the published microturn left the `chooseNStep` (compound turn advanced), invoke the existing inner-completion path used by `runChooseOneInnerPreview` (i.e., `pickInnerDecision` driven by `policyGuided` to `depthCap − 1`). `continuationBeam` is `null`. Resolve refs against the resulting state.
4. Outcome resolution mirrors the chooseOne path: hidden-resolved refs propagate `outcome: 'hidden'` and increment `outcomeBreakdown.unknownHidden`.

Iteration order over root ADD decisions: lexicographic on `stableMoveKey` (deterministic). The legalization filter is `microturn.legalActions.filter(d => d.kind === 'chooseNStep' && d.command === 'add')` — CONFIRM is excluded.

`evaluatedCandidateCount` is the sum of `1` (forced root ADD) plus the continuation `evaluatedCandidateCount` (or completion-drive depth) per root drive.

### 3. Runtime adapter — `packages/engine/src/agents/policy-agent-inner-preview.ts` (modify)

Add a parallel adapter:

```ts
export interface PolicyAgentChooseNStepInnerPreview {
  readonly run: ChooseNStepInnerPreviewRun;
  readonly refIds: readonly string[];
  readonly usage: PolicyEvaluationMetadata['previewUsage'];
  readonly byOptionKey: ReadonlyMap<string, ChooseNStepInnerPreviewRun['options'][number]>;
  readonly refsByOptionKey: ReadonlyMap<string, ReadonlyMap<string, PolicyValue>>;
}

export function createPolicyAgentChooseNStepInnerPreview(
  input: AgentMicroturnDecisionInput,
  resolvedProfile: ResolvedPolicyProfile | null,
): PolicyAgentChooseNStepInnerPreview | undefined;
```

Guards:
- `resolvedProfile === null` → `undefined`.
- `input.microturn.kind !== 'chooseNStep'` → `undefined`.
- `resolvedProfile.profile.preview.inner?.chooseNStep !== true` → `undefined`.

`collectMicroturnPreviewOptionRefs`, `summarizeReadyRefStats`, and `summarizeUsage` are factored to operate over the union `ChooseOneInnerPreviewRun | ChooseNStepInnerPreviewRun` (both share `options[].outcome` and `options[].resolvedRefs` shape via a shared interface). The chooseNStep adapter calls `runChooseNStepInnerPreview` and produces `byOptionKey` / `refsByOptionKey` keyed by `option.stableMoveKey`.

Both adapters expose a common shared structural interface `PolicyAgentInnerPreview` (exported from this file): `run`, `refIds`, `usage`, `byOptionKey`, `refsByOptionKey`. No discriminator field on the adapter shape — `run.options[].decision.kind` already discriminates if downstream code ever needs it. `chooseFrontierDecision` consumes the common shape with no narrowing.

### 4. Dispatch — `packages/engine/src/agents/policy-agent.ts` (modify)

Replace the unconditional `createPolicyAgentChooseOneInnerPreview` call at line 266 with kind-dispatched construction:

```ts
const innerPreview =
  input.microturn.kind === 'chooseOne'
    ? createPolicyAgentChooseOneInnerPreview(input, resolvedProfile)
    : input.microturn.kind === 'chooseNStep'
      ? createPolicyAgentChooseNStepInnerPreview(input, resolvedProfile)
      : undefined;
```

Downstream metadata-construction code (lines 277–305) operates on `innerPreview` via the common `PolicyAgentInnerPreview` shape. Verified: `frontierDecisionKey` (`policy-agent.ts:162`), `chooseNStepStableMoveKey` (`policy-preview-inner.ts:134`), and `scoreContributionsKeyForChooseNStepAdd` (`microturn-option-evaluator.ts:42`) all produce identical strings for ADD decisions: `chooseNStep:<decisionKey>:add:<JSON(value ?? null)>`. An architectural-invariant test (see Test Plan) asserts this parity so future refactors cannot silently drift.

`chooseStructuralFrontierDecision` (definition at `policy-agent.ts:106`, called at line 317) accepts the common `PolicyAgentInnerPreview` shape and propagates `previewUsage` for both kinds.

### 5. Compiler validation — `packages/engine/src/cnl/compile-agents.ts` and `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)

Update `lowerPreviewInnerConfig` (around line 1018) so the cost-formula check is conditional on `chooseNStep`:

```ts
const cost = chooseNStep === true
  ? loweredMaxOptions * (1 + loweredChooseNBeamWidth * loweredMaxOptions * Math.max(0, loweredDepthCap - 1))
  : loweredMaxOptions * loweredChooseNBeamWidth * loweredDepthCap;

if (!Number.isSafeInteger(cost) || cost > INNER_PREVIEW_HARD_CAP) {
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP,
    path: `${path}.inner`,
    severity: 'error',
    message: `Profile "${profileId}" preview.inner cost ${cost} exceeds INNER_PREVIEW_HARD_CAP ${INNER_PREVIEW_HARD_CAP}.`,
    suggestion: chooseNStep === true
      ? `When chooseNStep is enabled, the per-root-option forced continuation beam costs maxOptions × (1 + chooseNBeamWidth × maxOptions × max(0, depthCap − 1)). Reduce maxOptions, chooseNBeamWidth, or depthCap.`
      : `Set maxOptions × chooseNBeamWidth × depthCap to ${INNER_PREVIEW_HARD_CAP} or less.`,
  });
}
```

The cost formula is the static upper bound — actual runtime cost may be lower if a frontier has fewer than `maxOptions` legal options, but compile time guarantees the worst case fits.

**Diagnostic code rename (F#14, no alias).** The existing `CNL_COMPILER_AGENT_PREVIEW_INNER_TRIPLE_PRODUCT_EXCEEDED` (`compiler-diagnostic-codes.ts:261`) is renamed to `CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP`. The original name reflected the obsolete single-formula state and is misleading once the squared-cost branch lands. Migration sites:

- `packages/engine/src/cnl/compiler-diagnostic-codes.ts:261` — rename the constant.
- `packages/engine/src/cnl/compile-agents.ts:1020` — update the diagnostic-code reference at the emission site.
- `packages/engine/test/unit/cnl/compile-preview-inner.test.ts:97` — update the assertion comparing against the diagnostic-code string.

### 6. Compile-time warning parity — `packages/engine/src/cnl/validate-agents.ts` (modify)

Extend `validateInnerPreviewOptionConsiderations` (line 168) to fire for both `chooseOne: true` and `chooseNStep: true`:

```ts
const flagsRequiringConsideration: Array<'chooseOne' | 'chooseNStep'> = [];
if (inner.chooseOne === true) flagsRequiringConsideration.push('chooseOne');
if (inner.chooseNStep === true) flagsRequiringConsideration.push('chooseNStep');
if (flagsRequiringConsideration.length === 0) return;
if (hasPreviewOptionMicroturnConsideration(profileDef.use, library)) return;

for (const flag of flagsRequiringConsideration) {
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION,
    path: `${profilePath}.preview.inner.${flag}`,
    severity: 'warning',
    message: `Profile "${profileId}" has preview.inner.${flag} enabled but no microturn-scope consideration references preview.option.* refs; the per-option preview drive will run but produce no scoring signal.`,
    suggestion: `Add a microturn-scope consideration that references preview.option.delta.victory.currentMargin.self or another preview.option.* ref, or disable preview.inner.${flag}.`,
  });
}
```

The diagnostic code is reused; the path string differentiates which flag triggered. No new diagnostic code added.

### 7. Cookbook — `docs/agent-dsl-cookbook.md` (modify)

Add a worked example for `chooseNStep` per-option preview at a target-zone selection microturn. Reuse the existing `preferOptionProjectedMargin` consideration. State that the same microturn-scope consideration now differentiates options at both `chooseOne` and `chooseNStep` microturns. Note explicitly that CONFIRM is not a per-option-scored option (the `min`/`max` cardinality of the chooseN drives the set-completion logic).

### 8. Structural audit test — `packages/engine/test/architecture/preview-inner-config-runtime-coverage.test.ts` (new)

`architectural-invariant`. Enumerates the compiled `preview.inner` config fields (`chooseOne`, `chooseNStep`, `maxOptions`, `chooseNBeamWidth`, `depthCap`) and asserts, for each field, one of:
1. The field has a runtime consumer (grep-based: at least one non-test reference in `packages/engine/src/agents/`).
2. The field is gated by a compiler diagnostic that forbids it (grep-based: at least one diagnostic-emitting reference in `packages/engine/src/cnl/`).
3. The field is explicitly trace-only and listed in an in-test allowlist with a justification comment.

This is the structural guardrail the silent-no-op pattern slipped past Spec 160. Future preview-config additions must register a runtime consumer, a compiler diagnostic, or an explicit allowlist entry. The test is intentionally conservative — it does not validate that the runtime consumer correctly USES the field (semantic correctness is covered by the spec's other tests), only that one exists.

**Note on test directory.** `packages/engine/test/architecture/` is a new top-level test directory introduced by this spec. Existing top-level test directories (`unit/`, `integration/`, `determinism/`, `e2e/`, `kernel/`, `memory/`, `perf/`, `performance/`, `policy-profile-quality/`) are organized by test scope or subsystem; this audit is cross-subsystem (enumerates a kernel-owned type and greps both `src/agents/` and `src/cnl/`) and does not fit any of them. Future cross-subsystem structural audits land in this directory.

## Files to Touch

- `packages/engine/src/agents/policy-preview-inner.ts` (modify — extract chooseNStep types/helpers/driver to sibling)
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` (new — relocated `runChooseNStepBeamPreview` plus new `runChooseNStepInnerPreview`)
- `packages/engine/src/agents/policy-agent-inner-preview.ts` (modify — add `createPolicyAgentChooseNStepInnerPreview`; refactor `summarizeUsage` over a common shape; export `PolicyAgentInnerPreview` union)
- `packages/engine/src/agents/policy-agent.ts` (modify — kind-dispatched `innerPreview` construction at `chooseFrontierDecision:266`; update downstream consumers to common shape; update `chooseStructuralFrontierDecision` parameter type)
- `packages/engine/src/cnl/compile-agents.ts` (modify — squared-cost formula in `lowerPreviewInnerConfig`; rename diagnostic-code reference)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify — rename `CNL_COMPILER_AGENT_PREVIEW_INNER_TRIPLE_PRODUCT_EXCEEDED` → `CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP`)
- `packages/engine/src/cnl/validate-agents.ts` (modify — extend warning to chooseNStep)
- `packages/engine/schemas/GameDef.schema.json` (no change — boolean DSL preserved)
- `docs/agent-dsl-cookbook.md` (modify — chooseNStep worked example)
- `packages/engine/test/unit/agents/policy-preview-inner-choosen-beam.test.ts` (modify — update import path)
- `packages/engine/test/unit/cnl/compile-preview-inner.test.ts` (modify — update assertion to renamed diagnostic code `CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP`)
- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-per-option.test.ts` (new — `architectural-invariant`)
- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-differentiation.test.ts` (new — `convergence-witness`)
- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-hidden-info.test.ts` (new — `architectural-invariant`)
- `packages/engine/test/unit/cnl/compile-preview-inner-choosenstep-cost.test.ts` (new — `architectural-invariant`)
- `packages/engine/test/unit/cnl/validate-preview-inner-warning-parity.test.ts` (new — `architectural-invariant`)
- `packages/engine/test/determinism/spec-161-choosenstep-inner-preview-replay-identity.test.ts` (new — `architectural-invariant`)
- `packages/engine/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.ts` (new — `architectural-invariant`)
- `packages/engine/test/integration/policy-preview-inner-choosenstep-fitl-canary-golden.test.ts` (new — `golden-trace`; modeled on `packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts`)
- `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-key-parity.test.ts` (new — `architectural-invariant`; asserts key parity across `frontierDecisionKey`, `chooseNStepStableMoveKey`, and `scoreContributionsKeyForChooseNStepAdd` for ADD decisions)
- `packages/engine/test/architecture/` (new directory — new top-level test convention for cross-subsystem structural audits)
- `packages/engine/test/architecture/preview-inner-config-runtime-coverage.test.ts` (new — `architectural-invariant`; structural audit)

## Out of Scope

- **`fallbackCompletionPolicy: fail` semantics.** The trace evidence in `reports/preview-inner-choosenstep-architectural-gap-2026-05-07.md` (33 `completionPolicyFallbackCount` increments co-existing with every drive returning `ready` outcomes under `fallbackCompletionPolicy: fail`) suggests either a real semantics bug or misleading trace-field naming. A separate spec investigates and resolves; this spec does not depend on the resolution.
- **CONFIRM-as-per-option-scored.** Extending the chooseN microturn evaluator to score CONFIRM as a first-class option requires redesigning the set-assembly logic in `microturn-option-evaluator.ts:113`. Future spec if a use case emerges.
- **`directBeamRecommendation` mode.** A future explicit DSL mode (e.g., `preview.inner.chooseNStep.mode: directBeamRecommendation`) where the agent rubber-stamps `beam.best.partialSelection[0]` without per-ADD scoring. Defer until a use case justifies it.
- **`beliefSampled` / ISMCTS / POMCP modes.** Hidden-information-aware planning at inner microturns is a research direction. Out of scope for Spec 161; a future spec covers it.
- **DSL restructuring** to nested per-kind config (`chooseNStep: { enabled: true, mode, rootOptionCap, branchOptionCap, ... }`). Boolean surface is preserved.
- **Runtime cap truncation** (`rootSkippedCount`, `capped: true`). The compile-time formula is the operator's contract; runtime processes all legal options as today.
- **Caching of per-option preview results across microturns within a single agent decision.** Future optimization.
- **Agent-scope tooling for `policyGuided` continuation under bounded recursion.** Reuses Spec 159 unchanged.

## Acceptance Criteria

### Tests That Must Pass

1. New (Phase A): The chooseNStep beam types and `runChooseNStepBeamPreview` live in `policy-preview-inner-choosenstep.ts` and `policy-preview-inner.ts` is below 700 lines.
2. New (Phase A): `runChooseNStepInnerPreview` produces exactly one `ChooseNStepInnerPreviewResult` per legal ADD decision, in lexicographic `stableMoveKey` order. CONFIRM decisions in the legal-action set do not produce per-option entries.
3. New (Phase A): Per-root-option drafts are independent — a constructed fixture mutates `state.globals.x` differently under two different ADDs, and both mutations appear in their respective `resolvedRefs` without cross-contamination.
4. New (Phase A): The continuation beam runs with `depthCap − 1` after the forced ADD; total per-microturn cost ≤ `maxOptions × (1 + chooseNBeamWidth × maxOptions × max(0, depthCap − 1))` (assertion via `evaluatedCandidateCount`).
5. New (Phase B): A profile with `preview.inner.chooseNStep: true` and a `preferOptionProjectedMargin` microturn-scope consideration produces non-`disabled` `previewUsage` at every chooseNStep microturn (red test for the original bug).
6. New (Phase B): Constructed differentiation fixture: ADD A and ADD B lead to different post-ADD states; the chooseN microturn evaluator receives different `preview.option.delta.victory.currentMargin.self` values; the agent picks the option with the higher delta (ARVN-like scenario).
7. New (Phase B): Compile-time warning fires for `preview.inner.chooseNStep: true` profiles missing a `preview.option.*` microturn consideration. The warning suggestion text references `chooseNStep`.
8. New (Phase C): Compile-time error fires when the corrected formula exceeds 256, with diagnostic code `CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP` (renamed from `CNL_COMPILER_AGENT_PREVIEW_INNER_TRIPLE_PRODUCT_EXCEEDED`). ARVN's `8 × 1 × 4` (= 200 squared) compiles cleanly; `8 × 2 × 4` (= 8 × (1 + 2 × 8 × 3) = 392) fails compilation.
9. New (Phase C): A profile with `chooseNStep: false` and high values continues to use the triple-product formula (no breakage of existing chooseOne-only profiles); the renamed diagnostic still fires correctly for triple-product overflow cases.
10. New (Phase B): Key-parity invariant — `frontierDecisionKey`, `chooseNStepStableMoveKey`, and `scoreContributionsKeyForChooseNStepAdd` produce byte-identical strings for the same chooseNStep ADD decision (`chooseNStep:<decisionKey>:add:<JSON(value ?? null)>`).
11. New (Phase D): Replay-identity — same GameDef, initial state, seed, and actions produce byte-identical canonical state and chooseNStep `previewUsage` and synthetic-decision arrays across two runs.
12. New (Phase D): Default-off invariant — profiles with `chooseNStep: false` (or omitted) produce byte-identical inner-microturn trace as the pre-Spec-161 baseline (snapshot fixture committed alongside).
13. New (Phase D): Hidden-info safety — a chooseNStep ADD whose continuation would resolve a hidden ref returns `preview.option.victory.currentMargin.self: unknownHidden` and increments `outcomeBreakdown.unknownHidden`.
14. New (Phase D): Structural audit — every field declared on `preview.inner` config has at least one non-test runtime consumer in `packages/engine/src/agents/` OR a compiler diagnostic that gates it OR an in-test allowlist entry.
15. Existing engine suite: `pnpm -F @ludoforge/engine test`.
16. Existing typecheck: `pnpm turbo typecheck`.
17. FITL canary golden: a pinned chooseNStep frontier produces stable per-option projected-margin values across runs.

### Invariants

1. (architectural-invariant) For every chooseNStep with `preview.inner.chooseNStep: true`, exactly one preview drive runs per legal ADD decision; CONFIRM has no per-option entry.
2. (architectural-invariant) Total synthetic decisions per chooseNStep microturn ≤ `maxOptions × (1 + chooseNBeamWidth × maxOptions × max(0, depthCap − 1))` (corrected hard cap; F#10).
3. (architectural-invariant) `preview.option.*` refs return `unknownHidden` whenever the underlying observer-projected resolver returns hidden (F#4).
4. (architectural-invariant) Each per-root-option draft state is fully isolated from caller-visible state (Spec 146 contract preserved); a regression test asserts no aliasing across drafts.
5. (architectural-invariant) Profiles with default `preview.inner.chooseNStep: false` produce byte-identical inner-microturn trace as pre-Spec-161 baseline (no-op-by-default).
6. (architectural-invariant) Per-root-option iteration order is deterministic: lexicographic on `chooseNStep:<decisionKey>:add:<JSON(value)>`.
7. (architectural-invariant) Every field declared on `preview.inner` config has a runtime consumer, a compiler diagnostic, or an allowlist entry (structural audit).
8. (golden-trace) FITL canary with `preview.inner.chooseNStep: true` produces byte-identical per-option projected-margin values across runs.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview-inner-choosen-beam.test.ts` (modify) — `architectural-invariant`. Update import path to the new sibling-file location.
2. `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-per-option.test.ts` (new) — `architectural-invariant`. Per-root-option iteration, deterministic ordering, draft-state isolation, evaluated-candidate-count bound.
3. `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-differentiation.test.ts` (new) — `convergence-witness`. Constructed fixture where ADD A and ADD B lead to different `preview.option.delta.victory.currentMargin.self` and the chooseN microturn evaluator picks the higher-delta option. Witness id: `spec-161-choosenstep-differentiation`.
4. `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-hidden-info.test.ts` (new) — `architectural-invariant`. F#4 hidden-info enforcement at chooseNStep continuation.
5. `packages/engine/test/unit/cnl/compile-preview-inner-choosenstep-cost.test.ts` (new) — `architectural-invariant`. Squared-cost formula validation; ARVN-like settings compile; over-budget settings fail.
6. `packages/engine/test/unit/cnl/validate-preview-inner-warning-parity.test.ts` (new) — `architectural-invariant`. Warning fires for both `chooseOne: true` and `chooseNStep: true` cases.
7. `packages/engine/test/determinism/spec-161-choosenstep-inner-preview-replay-identity.test.ts` (new) — `architectural-invariant`. Two-run identity over chooseNStep inner trace. Convention precedent: `packages/engine/test/determinism/spec-160-inner-preview-replay-identity.test.ts`.
8. `packages/engine/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.ts` (new) — `architectural-invariant`. Default-off invariant: pre-Spec-161 baseline trace identical.
9. `packages/engine/test/integration/policy-preview-inner-choosenstep-fitl-canary-golden.test.ts` (new) — `golden-trace`. Pinned FITL chooseNStep canary with opt-in. Modeled on `packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts`.
10. `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-key-parity.test.ts` (new) — `architectural-invariant`. Asserts `frontierDecisionKey(def, decision)`, `chooseNStepStableMoveKey(decision)`, and `scoreContributionsKeyForChooseNStepAdd(request, value)` produce identical strings for the same chooseNStep ADD decision across a fixture of representative decisions. Prevents silent drift if any of the three key-derivation sites is refactored independently.
11. `packages/engine/test/architecture/preview-inner-config-runtime-coverage.test.ts` (new) — `architectural-invariant`. Structural audit; enumerates compiled `preview.inner` fields and asserts each has a runtime consumer, a compiler diagnostic, or an allowlist entry.

### Commands

The engine `test:unit` script is `node --test "dist/test/unit/**/*.test.js"`; it does not accept a Jest-style filter argument. Run a single compiled test file by absolute dist path, or run the whole suite:

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-choosenstep-per-option.test.js`
2. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-choosenstep-differentiation.test.js`
3. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-choosenstep-hidden-info.test.js`
4. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/cnl/compile-preview-inner-choosenstep-cost.test.js`
5. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/cnl/validate-preview-inner-warning-parity.test.js`
6. `pnpm -F @ludoforge/engine test:determinism` (covers replay-identity + no-op-default)
7. `pnpm -F @ludoforge/engine test:integration` (covers FITL canary golden)
8. `pnpm -F @ludoforge/engine build && node --test dist/test/architecture/preview-inner-config-runtime-coverage.test.js`
9. `pnpm turbo schema:artifacts`
10. `pnpm turbo lint typecheck test`
11. `bash campaigns/fitl-arvn-agent-evolution/harness.sh` (manual validation: confirm `previewUsage.mode !== 'disabled'` at chooseNStep microturns and ties broken)

## Follow-On Tickets

Proposed namespace: `161CHOOSNINNPREV` (CHOOSeNstep INNer PREView integration).

Decomposition outline (informational; finalized by `/spec-to-tickets`):

1. Sibling-file extraction: relocate chooseNStep beam types and `runChooseNStepBeamPreview` to `policy-preview-inner-choosenstep.ts`; export `InnerPreviewBaseInput` from `policy-preview-inner.ts`; update the existing beam test's import; verify `policy-preview-inner.ts` drops below 700 lines.
2. `runChooseNStepInnerPreview` driver: per-root-option forced continuation beam; lexicographic iteration; outcome resolution; `evaluatedCandidateCount` bookkeeping; new unit test for per-root-option iteration and draft-state isolation.
3. Common adapter shape: factor `summarizeUsage` and the shared structural `PolicyAgentInnerPreview` interface to cover both chooseOne and chooseNStep adapters.
4. `createPolicyAgentChooseNStepInnerPreview` adapter.
5. `chooseFrontierDecision` dispatch: kind-dispatched `innerPreview` construction; downstream metadata-construction code consumes the common shape. The `chooseStructuralFrontierDecision` parameter type rename lands in ticket 003 as Foundation 14 no-alias fallout; ticket 004 verifies and uses that shared parameter when dispatching chooseNStep preview.
6. Compiler cost-formula update: squared-cost formula when `chooseNStep: true`; new unit test for cost validation.
7. Diagnostic code rename: `CNL_COMPILER_AGENT_PREVIEW_INNER_TRIPLE_PRODUCT_EXCEEDED` → `CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP`; update `compiler-diagnostic-codes.ts:261`, `compile-agents.ts:1020`, and `test/unit/cnl/compile-preview-inner.test.ts:97`. (Bundle with ticket 6 if scope is small enough; split if test-suite migration is non-trivial.)
8. Compile-time warning parity: extend `validateInnerPreviewOptionConsiderations` to chooseNStep; new unit test for warning parity.
9. Hidden-info propagation: per-root-option ref hidden-resolution test (mirrors Spec 160's chooseOne hidden-info test).
10. Differentiation convergence witness: constructed fixture where the chooseN evaluator picks the higher-delta option.
11. Replay-identity test (`spec-161-...-replay-identity`).
12. No-op-default test (`spec-161-...-no-op-default`).
13. FITL chooseNStep canary golden test.
14. Key-parity invariant test: assert `frontierDecisionKey`, `chooseNStepStableMoveKey`, and `scoreContributionsKeyForChooseNStepAdd` produce identical strings for ADD decisions.
15. Structural audit test: `preview-inner-config-runtime-coverage` (introduces new `packages/engine/test/architecture/` directory).
16. Cookbook: chooseNStep worked example.
17. Manual validation: re-run `campaigns/fitl-arvn-agent-evolution/harness.sh` with `chooseNStep: true` and confirm `previewUsage.mode: exactWorld` at chooseNStep microturns; record updated trace evidence in the campaign log.

## MVP Checklist

- [x] Phase A: chooseNStep beam types and driver extracted to sibling file; `runChooseNStepInnerPreview` exists and passes per-root-option iteration tests.
- [ ] Phase B: `createPolicyAgentChooseNStepInnerPreview` exists; `chooseFrontierDecision` dispatches by kind; warning parity lands.
- [ ] Phase C: Squared-cost formula validated at compile time; ARVN-like settings compile; over-budget settings fail.
- [ ] Phase D: All listed tests pass; default-off byte-identical invariant holds; structural audit test passes.
- [ ] Cookbook updated.
- [ ] Manual ARVN harness re-run shows `previewUsage.mode !== 'disabled'` at chooseNStep microturns and ties broken.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-07:

- [`archive/tickets/161CHOOSNINNPREV-001.md`](../archive/tickets/161CHOOSNINNPREV-001.md) — Sibling-file extraction: relocate chooseNStep beam driver (covers Phase A extraction)
- [`archive/tickets/161CHOOSNINNPREV-002.md`](../archive/tickets/161CHOOSNINNPREV-002.md) — `runChooseNStepInnerPreview` per-root-option driver (covers Phase A driver)
- [`archive/tickets/161CHOOSNINNPREV-003.md`](../archive/tickets/161CHOOSNINNPREV-003.md) — Shared `PolicyAgentInnerPreview` interface + chooseNStep adapter (covers Phase B adapter)
- [`tickets/161CHOOSNINNPREV-004.md`](../tickets/161CHOOSNINNPREV-004.md) — `chooseFrontierDecision` kind-dispatch + integration tests (covers Phase B dispatch + differentiation/key-parity)
- [`tickets/161CHOOSNINNPREV-005.md`](../tickets/161CHOOSNINNPREV-005.md) — Compile-time warning parity for `preview.inner.chooseNStep` (covers Phase B warning)
- [`tickets/161CHOOSNINNPREV-006.md`](../tickets/161CHOOSNINNPREV-006.md) — Squared-cost formula + `COST_EXCEEDS_HARD_CAP` diagnostic rename (covers Phase C)
- [`tickets/161CHOOSNINNPREV-007.md`](../tickets/161CHOOSNINNPREV-007.md) — Hidden-info propagation test at chooseNStep continuation (covers Phase D F#4)
- [`tickets/161CHOOSNINNPREV-008.md`](../tickets/161CHOOSNINNPREV-008.md) — chooseNStep inner-preview replay-identity test (covers Phase D F#8)
- [`tickets/161CHOOSNINNPREV-009.md`](../tickets/161CHOOSNINNPREV-009.md) — chooseNStep inner-preview default-off invariant test (covers Phase D no-op-default)
- [`tickets/161CHOOSNINNPREV-010.md`](../tickets/161CHOOSNINNPREV-010.md) — FITL chooseNStep canary golden trace (covers Phase D golden)
- [`tickets/161CHOOSNINNPREV-011.md`](../tickets/161CHOOSNINNPREV-011.md) — `preview.inner` config runtime-coverage structural audit (covers Phase D structural audit + new `architecture/` directory)
- [`tickets/161CHOOSNINNPREV-012.md`](../tickets/161CHOOSNINNPREV-012.md) — Cookbook `chooseNStep` per-option preview worked example (covers Phase D docs)
- [`tickets/161CHOOSNINNPREV-013.md`](../tickets/161CHOOSNINNPREV-013.md) — Manual validation: ARVN harness re-run with `chooseNStep: true` (covers Phase D campaign validation)
