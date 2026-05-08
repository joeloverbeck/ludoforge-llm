# Architectural Gap: `preview.inner.chooseNStep` Agent Integration Missing

**Date**: 2026-05-07
**Codebase**: LudoForge-LLM (TypeScript engine for LLM-evolved board games)
**Engine state**: post-Spec-160 ("Per-Option Preview at Inner Microturns"), all of Specs 145, 146, 156, 157, 158, 159, 160 merged on `main`
**Trigger**: Campaign `fitl-arvn-agent-evolution` exp-003 — set `preview.inner.chooseNStep: true` on a profile, observed it is a silent no-op
**Goal**: Help an external deep-research LLM (ChatGPT-Pro) propose a clean fix for the missing integration, with full design context (specs, code, prior tickets, traces) so no codebase access is needed.

---

## TL;DR

LudoForge-LLM has a deterministic agent policy framework. Profiles author scoring rules in YAML; the engine evaluates them against a turn-flow kernel. Spec 160 ("Per-Option Preview at Inner Microturns") added an opt-in capability `preview.inner: { chooseOne: bool, chooseNStep: bool, ... }` that is supposed to give the agent per-option projected-margin signal at INNER microturn frontiers.

The implementation landed for `chooseOne` but **NOT** for `chooseNStep`:

- The compiler accepts `preview.inner.chooseNStep: true` and validates the bounded-cost triple product.
- A driver function `runChooseNStepBeamPreview` exists in `packages/engine/src/agents/policy-preview-inner.ts` and has unit-test coverage.
- The agent runtime integration (the call site in `chooseFrontierDecision` that would invoke the driver and surface its results back into the policy evaluator) is **missing**. `runChooseNStepBeamPreview` has zero non-test callers.
- There is no compile-time warning. The cookbook documents the field as supported. An operator who sets the flag gets no warning, no trace evidence, no ARVN/agent behavioral change — total silent no-op.

Adjacent concern: even if the integration were "just wired", there is a real **design ambiguity** about the agent-side semantics for chooseNStep that did not get resolved during Spec 160. The current driver returns the top-N final beam paths' resolved refs, but the chooseOne integration's pattern (per-option scoring at the agent's microturn evaluator) requires per-first-step-option refs. The two shapes are not the same. A faithful integration likely requires either (a) a new driver function that loops `runChooseNStepBeamPreview` over forced first-step options, or (b) a different agent-side semantic where the beam's recommendation is rubber-stamped without per-option microturn scoring.

This report provides the full code-level context, ticket archaeology, trace evidence, and three concrete options for closing the gap, so the deep-research LLM can recommend the right design without hunting through the codebase.

---

## Background: How the LudoForge-LLM agent framework is layered

This section is essential context. An external reviewer needs to understand four concepts to evaluate the gap.

### 1. Game state is published one decision at a time (Foundation 19)

The kernel publishes exactly one **microturn** at a time to the agent. A microturn has one of three kinds:

- `actionSelection` — pick the next ACTION to play (e.g., FITL ARVN's choice between `train`, `govern`, `patrol`, `sweep`, `assault`, etc.)
- `chooseOne` — pick ONE option from a published value list (e.g., govern-mode chooseOne with options `["aid", "patronage"]`)
- `chooseNStep` — pick the next ADD or CONFIRM step in a multi-pick sequence (e.g., `chooseN{min:1, max:8}` of target zones, picked one at a time with confirm)

Each microturn has a `decisionContext` with the legal options the kernel has authorized and a stable identity key. Agents pick one option per microturn until the compound turn retires.

### 2. The PolicyAgent scores options via considerations

A profile's `use.considerations` is a list of authored scoring terms. Each term has a `scopes` field that controls when it fires:

- `scopes: [move]` — fires at `actionSelection` to score action candidates (e.g., "prefer govern-tagged actions with weight 1000")
- `scopes: [microturn]` — fires at `chooseOne` / `chooseNStep` to score inner options (e.g., "prefer the option whose projected margin delta is higher")

### 3. Preview is a synthetic forward simulation that runs DURING evaluation

When the agent is about to score an action-selection candidate, the engine can run a bounded synthetic completion of the candidate's downstream microturns and let the agent inspect the resulting state via `preview.victory.currentMargin.self` and similar refs. This is "outer preview" or "action-selection preview". Spec 145 made this work.

Spec 160 added an analogous capability AT the inner microturn level. The shape is:

- For each candidate at an inner `chooseOne` (e.g., aid vs patronage):
  - Apply the candidate to a draft state (Spec 146 isolation)
  - Continue the rest of the compound turn synthetically (greedy or `policyGuided`)
  - Resolve `preview.option.*` refs against the resulting state
  - Return per-option resolved refs
- Microturn-scope considerations referencing `preview.option.*` then score each option using its own preview-resolved refs

This unblocks "let preview decide" patterns at inner microturns, which is the contribution Spec 160 makes.

### 4. The opt-in config

Profiles opt into `preview.inner` via YAML:

```yaml
preview:
  mode: exactWorld
  completion: policyGuided        # or greedy (default)
  fallbackCompletionPolicy: fail  # only with policyGuided
  inner:
    chooseOne: true               # enables per-option preview at chooseOne
    chooseNStep: true             # supposedly enables beam preview at chooseNStep
    maxOptions: 8
    chooseNBeamWidth: 1
    depthCap: 4
```

The triple product `maxOptions × chooseNBeamWidth × depthCap` is bounded by `INNER_PREVIEW_HARD_CAP = 256` at compile time.

---

## How the gap surfaced: campaign fitl-arvn-agent-evolution exp-001..003

A campaign was running iterative-improvement experiments to evolve an ARVN policy agent for the Fire in the Lake (FITL) test game. The campaign's measurement is `compositeScore = avgMargin + 10 × winRate`. ARVN must maintain `COIN-Controlled Population + Patronage > 50` at the Coup victory checkpoint.

### Baseline trace (seed 1000, tier 1, before any opt-ins)

Before any spec-160 features were enabled on `arvn-evolved`, trace summary at seed 1000:

- 68 ARVN decisions: 25 actionSelection, 32 chooseOne, 11 chooseNStep
- 25/25 actionSelection: `previewUsage.mode: 'exactWorld'`, ready=95, gated=163 (Spec 145 + 157 working)
- All 32 chooseOne: `previewUsage.mode: 'disabled'` (Spec 160 inner preview not opted in)
- All 11 chooseNStep: `previewUsage.mode: 'disabled'`
- **63/68 = 92.6% of ARVN decisions tied** (top-2 candidate score gap < 0.001)
- Tied chooseOne: 32/32 (100%)
- Tied chooseNStep: 5/11
- Tied actionSelection: 17/25
- compositeScore = -9 (avgMargin -9, no win)

### exp-001 — ACCEPTED

Opted `arvn-evolved` into `preview.inner.chooseOne: true` and added a microturn-scope consideration:

```yaml
preferOptionProjectedMargin:
  scopes: [microturn]
  costClass: preview
  weight: 300
  value:
    ref: preview.option.delta.victory.currentMargin.self
```

Trace evidence post-experiment:

- All 24 chooseOne decisions: `previewUsage.mode: 'exactWorld'` (was `disabled`)
- Per-option preview drives produced 316 `ready` outcomes
- chooseOne ties: 32/32 → 20/24 (**12 ties broken**)
- compositeScore: -9 → -8 (avgMargin +1.0)

This experiment confirms the chooseOne integration (Phase A of Spec 160) is correctly wired and delivers the documented behavior.

### exp-002 — NEAR_MISS (stashed)

Set `preview.completion: greedy` → `policyGuided` (with `fallbackCompletionPolicy: fail`). Trace evidence:

- 341 synthetic decisions across preview drives all used `policyGuided` (vs greedy default)
- 33 fallbacks recorded across drives
- The 8/20 actionSelection `utility=constant` count was UNCHANGED — switching greedy→policyGuided did not differentiate any of the constant-projection actionSelections
- compositeScore: same -8

### exp-003 — REJECT, gap discovered

Set `preview.inner.chooseNStep: false` → `true` on `arvn-evolved` (single boolean flip). Re-ran harness. Trace evidence:

- 11 chooseNStep decisions: **ALL still report `previewUsage.mode: 'disabled'`**
- Ties unchanged: chooseNStep still 5/11 tied
- compositeScore: same -8 (no behavior change)

The flag is active in the YAML, the compiler validates it (no errors, no warnings), but the runtime never invokes the chooseNStep beam preview driver from the agent's decision pipeline.

---

## Code-level evidence of the gap

All paths are relative to the `packages/engine/src/` root unless specified otherwise.

### What IS implemented

#### `agents/policy-preview-inner.ts:664` — the driver

```ts
export function runChooseNStepBeamPreview(input: RunChooseNStepBeamPreviewInput): ChooseNStepBeamPreviewRun {
  // ...full beam-search implementation, ~95 lines...
  // Returns: { beam, best, pruned, evaluatedCandidateCount, outcomeBreakdown }
}
```

The function takes:
```ts
interface RunChooseNStepBeamPreviewInput extends InnerPreviewBaseInput {
  readonly microturn: ChooseNStepMicroturn;
  readonly beamWidth?: number;
}
```

And returns:
```ts
interface ChooseNStepBeamPreviewRun {
  readonly beam: readonly ChooseNStepBeamResult[];
  readonly best: ChooseNStepBeamResult | undefined;
  readonly pruned: readonly ChooseNStepBeamPrunedTraceEntry[];
  readonly evaluatedCandidateCount: number;
  readonly outcomeBreakdown: PolicyPreviewOutcomeBreakdownTrace;
}

interface ChooseNStepBeamResult {
  readonly partialSelection: readonly ChooseNStepDecision[];      // full sequence
  readonly partialSelectionStableKeys: readonly string[];
  readonly state: GameState;
  readonly score: number;
  readonly resolvedRefs: ReadonlyMap<string, PolicyValue>;        // refs at end-of-beam state
  readonly outcome: PolicyPreviewTraceOutcome;
}
```

Key observation about the **shape** of the driver's output: each `beam[k]` represents a complete partial selection (length up to `depthCap`). The `resolvedRefs` are evaluated against the END state of that complete sequence, not against a forced-first-step state. The "best" path's first decision is `best.partialSelection[0]` and its refs are joint refs over the whole sequence.

#### `agents/policy-preview-inner.ts:619` — the chooseOne sibling

```ts
export function runChooseOneInnerPreview(input: RunChooseOneInnerPreviewInput): ChooseOneInnerPreviewRun {
  // For each option in the chooseOne, run its own bounded drive...
  // Returns per-option results.
}

interface ChooseOneInnerPreviewRun {
  readonly options: readonly ChooseOneInnerPreviewResult[];   // ONE entry per option
  readonly outcomeBreakdown: PolicyPreviewOutcomeBreakdownTrace;
}

interface ChooseOneInnerPreviewResult {
  readonly decision: Extract<Decision, { readonly kind: 'chooseOne' }>;
  readonly stableMoveKey: string;
  readonly resolvedRefs: ReadonlyMap<string, PolicyValue>;    // refs after applying THIS option
  readonly driveDepth: number;
  readonly outcome: PolicyPreviewTraceOutcome;
  // ...
}
```

The chooseOne output is **per-option**: each entry is keyed by the option's `stableMoveKey` and its `resolvedRefs` reflect the projected end-state under that specific option choice.

The shape difference is the heart of the gap:
- chooseOne: `Map<optionKey, {refs}>` — naturally feeds per-option scoring
- chooseNStep: `[finalPath0, finalPath1, ...]` — does NOT directly feed per-first-step-option scoring

### What WIRES IT INTO the agent (chooseOne only)

#### `agents/policy-agent-inner-preview.ts:147` — the agent-runtime adapter (chooseOne only)

```ts
export function createPolicyAgentChooseOneInnerPreview(
  input: AgentMicroturnDecisionInput,
  resolvedProfile: ResolvedPolicyProfile | null,
): PolicyAgentChooseOneInnerPreview | undefined {
  if (
    resolvedProfile === null
    || input.microturn.kind !== 'chooseOne'                         // EXPLICIT chooseOne gate
    || resolvedProfile.profile.preview.inner?.chooseOne !== true    // EXPLICIT chooseOne flag check
  ) {
    return undefined;
  }
  const refs = collectMicroturnPreviewOptionRefs(resolvedProfile);
  // ...
  const run = runChooseOneInnerPreview({...});
  return {
    run,
    refIds,
    usage: summarizeUsage(resolvedProfile.profile.preview.mode, run, refIds),
    byOptionKey: new Map(run.options.map((option) => [option.stableMoveKey, option])),
    refsByOptionKey: new Map(run.options.map((option) => [option.stableMoveKey, option.resolvedRefs])),
  };
}
```

There is **no parallel `createPolicyAgentChooseNStepInnerPreview`** in this file. The file's `export` list contains only the chooseOne function.

#### `agents/policy-agent.ts:262-324` — the dispatch (only chooseOne fires)

```ts
private chooseFrontierDecision(
  input: AgentMicroturnDecisionInput,
): AgentMicroturnDecisionResult {
  const resolvedProfile = resolveEffectivePolicyProfile(input.def, input.state.activePlayer, this.profileId);
  const innerPreview = createPolicyAgentChooseOneInnerPreview(input, resolvedProfile);   // ONLY chooseOne path
  const innerPreviewByOptionKey = innerPreview?.byOptionKey;
  const innerPreviewRefIds = innerPreview?.refIds ?? [];
  const guidedChoice = this.disableGuidedChooser
    ? null
    : this.matchGuidedCompletionDecision(
        input,
        resolvedProfile,
        innerPreview?.refsByOptionKey,        // chooseOne refs flow downstream
      );
  // ... rest builds metadata using innerPreview.usage, falling back to emptyPreviewUsage('disabled')
}
```

The `chooseFrontierDecision` is the agent's entry point for both `chooseOne` and `chooseNStep` microturns. It calls `createPolicyAgentChooseOneInnerPreview` unconditionally; that function's first guard returns `undefined` for non-`chooseOne` microturns. The call site does **NOT** check whether the microturn is `chooseNStep` and dispatch to a beam-preview adapter.

### What the chooseNStep agent path does (without inner preview)

#### `agents/policy-agent.ts:410-473` — `matchGuidedChooseNStepDecision`

```ts
private matchGuidedChooseNStepDecision(
  input: AgentMicroturnDecisionInput & { ... chooseNStep ... },
  choose: (request: ChoicePendingRequest) => ReturnType<NonNullable<ReturnType<typeof buildMicroturnChooseCallback>>>,
): GuidedChoiceMatch {
  const context = input.microturn.decisionContext as ChooseNStepContext;
  const request: ChoicePendingChooseNRequest = {
    kind: 'pending',
    complete: false,
    decisionKey: context.decisionKey,
    name: String(context.decisionKey),
    options: context.options,
    targetKinds: [],
    type: 'chooseN',
    min: context.cardinality.min,
    max: context.cardinality.max,
    selected: context.selectedSoFar,
    canConfirm: context.stepCommands.includes('confirm'),
  };
  const preferredSelection = choose(request);     // calls the microturn evaluator
  // ... matches the result back to a published next-add or confirm decision
}
```

`buildMicroturnChooseCallback` is the runtime evaluator built from the profile's microturn-scope considerations. It optionally accepts `previewOptionResolvedRefsByOptionKey` to resolve `preview.option.*` refs. The `matchGuidedCompletionDecision` chain at line 326 already passes that map for the chooseOne path; the chooseNStep path receives `choose` already built but the `previewOptionResolvedRefsByOptionKey` parameter is `undefined` when the microturn is `chooseNStep` (since `createPolicyAgentChooseOneInnerPreview` returned `undefined`).

### The compiler accepts the flag without complaint

#### `cnl/compile-agents.ts:976-1054` — preview.inner validation

```ts
// validates types of chooseOne and chooseNStep flags as boolean
if (chooseOne !== undefined && typeof chooseOne !== 'boolean') { /* error */ }
if (chooseNStep !== undefined && typeof chooseNStep !== 'boolean') { /* error */ }

// validates triple product against INNER_PREVIEW_HARD_CAP
const triple = maxOptions * chooseNBeamWidth * depthCap;
if (triple > INNER_PREVIEW_HARD_CAP) { /* error */ }
```

There is no error or warning when `chooseNStep: true` is set without a corresponding runtime integration. The compiler treats the flag as a valid configuration option and lowers it into the compiled profile. The runtime simply never reads it from a meaningful call site.

#### `cnl/validate-agents.ts:170-191` — chooseOne-only warning

```ts
const inner = isRecord(preview) ? preview.inner : undefined;
if (!isRecord(inner) || inner.chooseOne !== true) {     // ONLY chooseOne triggers warning
  return;
}
if (hasPreviewOptionMicroturnConsideration(profileDef.use, library)) {
  return;
}
diagnostics.push({
  code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION,
  path: `${profilePath}.preview.inner.chooseOne`,
  severity: 'warning',
  message: `Profile "${profileId}" has preview.inner.chooseOne enabled but no microturn-scope consideration references preview.option.* refs; ...`,
});
```

The warning ONLY fires for `chooseOne: true`. There is no parallel warning for `chooseNStep: true` — even if there were, it'd warn about a missing consideration when the runtime won't even attempt to use one for chooseNStep.

### What the cookbook documents (operator-facing)

`docs/agent-dsl-cookbook.md:255-282` documents the field as supported:

```yaml
preview:
  mode: exactWorld
  completion: policyGuided
  fallbackCompletionPolicy: fail
  inner:
    chooseOne: true
    chooseNStep: false      # ← documented as a real toggle
    maxOptions: 8
    chooseNBeamWidth: 1
    depthCap: 4
```

> Fields:
>
> | Field | Meaning |
> | --- | --- |
> | `chooseOne` | Enables one per-option preview drive for each legal `chooseOne` option. Defaults to `false`. |
> | `chooseNStep` | Enables bounded beam preview for `chooseNStep` frontiers. Defaults to `false`. |

There is no caveat that `chooseNStep` is non-functional. An operator following the cookbook reasonably expects setting it to `true` to enable beam preview. It does not.

---

## Why this landed: ticket archaeology

Spec 160 was decomposed into 10 tickets, all archived as COMPLETED. The relevant ones:

### `archive/tickets/160PEROPTPREV-006.md` — chooseNStep beam driver

Status: COMPLETED. Touches `agents/policy-preview-inner.ts` only.

Out of Scope explicitly says:
> Trace integration into `chooseFrontierDecision` — ticket 007.

### `archive/tickets/160PEROPTPREV-007.md` — Trace integration, replay, no-op-default

Status: COMPLETED. Touches `agents/policy-agent.ts`, `agents/policy-agent-inner-preview.ts`, `agents/policy-preview-inner.ts`.

What to Change:
> ### 1. Replace hardcoded `emptyPreviewUsage()` in `chooseFrontierDecision`
>
> In `packages/engine/src/agents/policy-agent.ts:266` (and the call at `chooseStructuralFrontierDecision:122`), replace the hardcoded `emptyPreviewUsage()` with conditional population:
>
> - When `compiledProfile.preview.inner?.chooseOne === true` AND `input.microturn.kind === 'chooseOne'`: invoke the chooseOne driver from ticket 005, collect per-option resolved-refs and synthetic-decision trace entries, and populate `previewUsage` with `mode: 'exactWorld'` (or the appropriate mode), ...
> - Otherwise: call `emptyPreviewUsage('disabled')` (the consolidated import from ticket 001).

Out of Scope:
> chooseN beam trace propagation — covered structurally by ticket 006's beam pruning trace; **this ticket integrates only the chooseOne path.** (chooseNStep integration follows the same pattern; ticket 006's pruning trace records propagate via the same mechanism here.)

Outcome (2026-05-07) confirms:
> Landed boundary: `PolicyAgent.chooseFrontierDecision` now runs the **chooseOne** inner-preview driver when `preview.inner.chooseOne` is enabled...

The ticket explicitly carves out "chooseNStep follows the same pattern" but does not actually do that work AND no follow-up ticket landed it. The spec was archived as COMPLETED with this gap unfilled. Tickets 008 (compile-time warning), 009 (FITL canary golden test), and 010 (cookbook docs) all only cover the chooseOne path.

---

## Adjacent concerns surfaced during the audit

### 1. Silent acceptance + cookbook lying

The compiler does not warn when `chooseNStep: true` is set. The cookbook documents the field as functional. An operator authoring against the cookbook gets a silent no-op with no diagnostic surface.

### 2. policyGuided fallback behavior under `fallbackCompletionPolicy: fail`

In exp-002 the profile had `preview.completion: policyGuided` and `fallbackCompletionPolicy: fail`. The trace recorded `completionPolicyFallbackCount: 33` but every drive still produced `ready` outcomes. With "fail" as the fallback policy the expectation would be that policyGuided failures manifest as failed drives (or non-ready outcomes), not silently report `ready`.

I have NOT investigated this deeply enough to be confident it's a bug — it could be that "fail" semantics are correctly implemented and "fallback count" tracks something else. But it's a flag worth checking: if `fallbackCompletionPolicy: fail` is supposed to surface policyGuided failures explicitly, the trace evidence suggests either the fallback semantics are silently degrading or the trace field name is misleading.

Code anchor: `agents/policy-preview.ts:608+` for completion-policy resolution; `cnl/compile-agents.ts:843-869` for the validation that `fallbackCompletionPolicy` only applies under policyGuided.

### 3. utility=constant on 8/20 actionSelections is structural at depth 8

After exp-001's chooseOne integration AND exp-002's policyGuided switch, 8/20 actionSelections still report `previewUsage.utility: 'constant'` — preview is "ready" for all candidates but every candidate projects to the same margin. This persists with policyGuided, indicating that for these 8 actionSelections the action doesn't reach margin-affecting state within the default `completionDepthCap: 8`. This is a depth-of-rollout issue, not a completion-policy issue; not directly part of the chooseNStep gap, but it suggests the depth-bound design of synthetic completion may be under-resourced for some FITL action shapes (e.g., govern with empty target zones). Lower priority than the chooseNStep gap.

### 4. The chooseNStep design ambiguity (the deeper reason this is more than wiring)

This is the architectural question I want the deep-research LLM to weigh in on.

**chooseOne** integration shape:
- For each candidate option `O_i`, run a per-option drive that applies `O_i` and continues completion to `depthCap`
- Each drive produces an independent `resolvedRefs` map
- The agent's microturn evaluator scores each option using its own resolvedRefs
- A consideration like `preferOptionProjectedMargin: { value: { ref: preview.option.delta.victory.currentMargin.self } }` differentiates options because each has its own delta

**chooseNStep** as designed in `runChooseNStepBeamPreview`:
- Run ONE beam search across all candidate sequences up to `depthCap` steps
- Top-N final partial selections are kept
- `best.partialSelection[0]` is the recommended next-step option
- `best.resolvedRefs` are refs at the END state of the best full beam path

The shape of `runChooseNStepBeamPreview`'s output is NOT compatible with per-option scoring at the agent's microturn evaluator. The beam returns final-state refs for full paths, not per-first-step-option refs.

Two interpretations of the spec's intent:

**Interpretation X — Per-first-step-option scoring (chooseOne-analog)**
- For each candidate next-step ADD decision, run a forced-first-step beam (depthCap-1 remaining)
- Each forced-first-step beam returns its `best.resolvedRefs`
- Map each ADD-decision's stableKey → its forced-first-step beam refs
- Microturn-scope considerations score each ADD option using its own refs

This requires a new function `runChooseNStepInnerPreview` that wraps `runChooseNStepBeamPreview` with per-option forcing. Cost per microturn: `maxOptions × maxOptions × beamWidth × (depthCap - 1)` — for arvn's `8 × 1 × 4` settings, that's 8 × 24 = 192 synthetic decisions, just under the 256 hard cap.

This matches Spec 160's broader framing ("per-option preview at inner microturns") and cookbook line 305-337's example, which shows microturn-scope considerations comparing per-option projected margins.

**Interpretation Y — Beam-recommendation rubber-stamp**
- Run ONE beam preview
- Use `best.partialSelection[0]` as the recommended next-step option
- The chooseNStep agent picks that option directly, with no per-option microturn scoring
- The microturn-scope considerations are NOT used for chooseNStep (or are used only as a sanity check)

This matches Spec 160 §3 ("expose per-option refs from beam[0].partialSelection") and is what the existing driver returns. But it diverges from the chooseOne pattern and means microturn-scope considerations have inconsistent semantics across chooseOne (per-option scoring) and chooseNStep (beam rubber-stamp).

The spec did not explicitly choose between X and Y. The implementer of ticket 007 deferred this — and since they only landed the chooseOne path, the choice was never forced.

---

## Reproduction (so the deep-research LLM can verify)

### State after exp-001 (chooseOne working, chooseNStep gap visible)

`data/games/fire-in-the-lake/92-agents.md` profile section:

```yaml
arvn-evolved:
  observer: currentPlayer
  preview:
    mode: exactWorld
    budget:
      strategy: balancedCoverage
      fullCandidateCap: 10
      minPerGroup: 1
    inner:
      chooseOne: true
      chooseNStep: false
      maxOptions: 8
      chooseNBeamWidth: 1
      depthCap: 4
  params:
    projectedMarginWeight: 300
    governWeight: 1000
    trainWeight: 300
  use:
    pruningRules:
      - dropPassWhenOtherMovesExist
    considerations:
      - preferProjectedSelfMargin
      - preferStrongNormalizedMargin
      - preferGovernWeighted
      - preferTrainWeighted
      - governWhenPatronageLow
      - trainWhenControlLow
      - preferOptionProjectedMargin
    tieBreakers:
      - stableMoveKey
```

`preferOptionProjectedMargin` library entry:

```yaml
preferOptionProjectedMargin:
  scopes: [microturn]
  costClass: preview
  weight: 300
  value:
    ref: preview.option.delta.victory.currentMargin.self
```

### exp-003 toggle that exposed the gap

Single line change:
```diff
-      chooseNStep: false
+      chooseNStep: true
```

Then run `bash campaigns/fitl-arvn-agent-evolution/harness.sh`.

### What the trace shows

Decision summary across 55 ARVN decisions on seed 1000:

| Decision kind | Count | previewUsage.mode |
|---|---|---|
| actionSelection | 20 | `exactWorld` for all 20 |
| chooseOne | 24 | `exactWorld` for all 24 |
| chooseNStep | 11 | **`disabled` for all 11** (despite `chooseNStep: true` in YAML) |

The 11 chooseNStep decisions are unchanged in their tied-decision rate (5/11 tied) and zero-effect on compositeScore (still -8). The flag had no observable effect.

---

## Proposed solution

**Recommendation**: pursue Interpretation X (per-first-step-option scoring), because (a) it matches the chooseOne pattern's semantic for microturn-scope considerations, (b) cookbook §"Govern-Mode Example" already promises that microturn-scope considerations comparing `preview.option.*` refs work uniformly across inner microturns, and (c) it's the design that delivers the most operator power.

### Implementation plan

#### Step 1. Add `runChooseNStepInnerPreview` to `agents/policy-preview-inner.ts`

A new exported function that wraps `runChooseNStepBeamPreview` with per-first-step-option forcing:

```ts
interface ChooseNStepInnerPreviewResult {
  readonly decision: ChooseNStepDecision;        // the next-add or confirm decision
  readonly stableMoveKey: string;
  readonly resolvedRefs: ReadonlyMap<string, PolicyValue>;
  readonly driveDepth: number;
  readonly outcome: PolicyPreviewTraceOutcome;
  readonly previewDrive: PolicyPreviewDriveTrace;
  readonly completionPolicyFallbackCount: number;
}

interface ChooseNStepInnerPreviewRun {
  readonly options: readonly ChooseNStepInnerPreviewResult[];
  readonly outcomeBreakdown: PolicyPreviewOutcomeBreakdownTrace;
}

export function runChooseNStepInnerPreview(input: RunChooseNStepInnerPreviewInput): ChooseNStepInnerPreviewRun {
  // For each next-add candidate AND the confirm option:
  //   - Apply the candidate to a draft (Spec 146 isolation)
  //   - Run runChooseNStepBeamPreview on the resulting state for (depthCap-1) more steps
  //   - Take beam.best.resolvedRefs as this option's resolvedRefs
  //   - Record per-option entry
  // Return per-option map.
}
```

Constraints to honor:
- F#10 (Bounded Computation): total cost per microturn ≤ `maxOptions × maxOptions × chooseNBeamWidth × (depthCap-1)`. For the arvn-evolved settings of `8 × 1 × 4`, that's 192. The compiler's existing triple-product cap is `maxOptions × beamWidth × depthCap = 32`. We need a new cap or a tightened `maxOptions` for inner-of-inner preview to stay safely under `INNER_PREVIEW_HARD_CAP = 256`. **Open design question**: split `maxOptions` into `maxOptions` (for chooseOne) and `maxOptionsChooseNStep` (smaller, for inner-of-inner)? Or accept the squared cost and tighten the compile-time cap?
- F#8 (Determinism): per-option iteration order must be stable. Use the `chooseNStepStableMoveKey` already defined at `policy-preview-inner.ts:134` for stable per-option keys.
- F#11 (Immutability): each per-option drive uses its own `createMutableState` draft; partial selections do not alias across options.
- F#4 (Hidden Info): inherits from `runChooseNStepBeamPreview`'s existing hidden-info routing through `surfaceContext`.

#### Step 2. Add `createPolicyAgentChooseNStepInnerPreview` to `agents/policy-agent-inner-preview.ts`

Parallel to `createPolicyAgentChooseOneInnerPreview` (line 147). Same shape — collect `preview.option.*` refs from microturn-scope considerations, dispatch `runChooseNStepInnerPreview`, build the `byOptionKey` and `refsByOptionKey` maps, summarize previewUsage.

#### Step 3. Update `agents/policy-agent.ts:262-324` (`chooseFrontierDecision`)

Dispatch on microturn kind:

```ts
private chooseFrontierDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult {
  const resolvedProfile = resolveEffectivePolicyProfile(input.def, input.state.activePlayer, this.profileId);
  const innerPreview =
    input.microturn.kind === 'chooseOne'
      ? createPolicyAgentChooseOneInnerPreview(input, resolvedProfile)
      : input.microturn.kind === 'chooseNStep'
        ? createPolicyAgentChooseNStepInnerPreview(input, resolvedProfile)
        : undefined;
  // ...same downstream code; both wrappers return a structurally compatible PolicyAgentInnerPreview shape
}
```

The two wrappers should expose a common interface (`{ usage, refIds, byOptionKey, refsByOptionKey }`) so the downstream metadata-construction code at `policy-agent.ts:283-300` works uniformly.

#### Step 4. Compiler-side warning parity (`cnl/validate-agents.ts:170-191`)

Extend the warning to fire for `chooseNStep: true` without a microturn-scope consideration referencing `preview.option.*` refs. Same suggestion text, different path.

#### Step 5. Tests

- Add `packages/engine/test/unit/agents/policy-preview-inner-choosenstep-per-option.test.ts` — invariant: per-option iteration covers every legal next-add decision; per-option drives are independent (no aliasing); deterministic ordering.
- Add `packages/engine/test/determinism/spec-161-choosenstep-inner-preview-replay-identity.test.ts` — replay-identity for the new path (parallel to `spec-160-inner-preview-replay-identity.test.ts`).
- Add `packages/engine/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.ts` — default-off invariant.
- Update `packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts` to also exercise a chooseNStep frontier (or add a sibling canary).

#### Step 6. Re-bless cookbook + emit changelog

`docs/agent-dsl-cookbook.md` already documents the field; no edits needed beyond ensuring the example pattern is referenced.

### Spec authoring

This work is large enough to warrant a proper spec rather than backfilling Spec 160. Suggested spec ID: **161 — chooseNStep agent integration for per-option scoring**. The spec should:

1. Resolve the design ambiguity (Interpretation X vs Y) explicitly. Recommendation: X.
2. Define the cost cap for per-option forced-first-step beam (do we add a new compile-time cap, or split `maxOptions`?).
3. Specify the trace shape parity with chooseOne (per-option drives propagate via the existing `previewDrive.syntheticDecisions` shape).
4. Address `fallbackCompletionPolicy: fail` semantics — the trace evidence in this report (33 fallbacks counted while every drive returned `ready`) suggests there may be a separate issue that should be co-investigated.

---

## Alternatives considered (and why X is preferred)

### Y. Beam rubber-stamp

The beam already finds the best partial sequence. Use `beam.best.partialSelection[0]` as the recommended next-step. No per-option scoring at chooseNStep; microturn-scope considerations only fire at chooseOne.

Pros: Cheaper, matches the existing driver's shape, less new code.

Cons: Inconsistent with chooseOne. Operators authoring `preferOptionProjectedMargin: { scopes: [microturn] }` would see it differentiate options at chooseOne but not at chooseNStep — a non-obvious semantic split. Microturn-scope authoring becomes split-mode. Spec 160's broader framing ("per-option preview at inner microturns") becomes false advertising for chooseNStep.

### Z. Reject the flag at compile time

Change the compiler to error on `preview.inner.chooseNStep: true` and update the cookbook to mark the field reserved. Lowest-effort; honest about the gap; trades feature loss for clarity.

Pros: No engine work; eliminates silent no-op immediately.

Cons: Drops a documented feature for an unbounded period. Operators authoring around it have to wait for a future spec. The driver and unit tests continue to exist as orphan code.

### W. Quick-and-dirty wire-through

Wire `runChooseNStepBeamPreview` into `chooseFrontierDecision` minimally: extract `beam.best.resolvedRefs` and expose them as a single ref map (not per-option-key). Microturn-scope considerations get one common ref-map instead of per-option refs.

Pros: Minimal new code, surfaces SOME signal at chooseNStep.

Cons: `preferOptionProjectedMargin` would not differentiate options because every option sees the same refs (the beam's best path). Defeats the purpose. Worse than not wiring it.

---

## Questions for the deep-research LLM

To be most useful, please advise on:

1. **Interpretation X vs Y** — given the spec text, the existing chooseOne pattern, and the cookbook's framing, which design intent should the integration honor? Is there a third option I haven't considered?

2. **Cost-cap design for per-option forced-first-step beam** — should there be a separate `maxOptionsChooseNStep` parameter (smaller default, e.g., 4), or should the existing triple product cap be tightened, or should the squared-cost shape (`maxOptions²`) just be accepted with the existing 256 cap? Reference: similar bounded-rollout systems in TAG, OpenSpiel, MCTS literature.

3. **`fallbackCompletionPolicy: fail` semantics** — given the trace evidence (`completionPolicyFallbackCount: 33` co-existing with every drive returning `ready` outcomes), is there likely a bug where "fail" is being silently treated as "greedy fallback"? Or is "fallback count" tracking something orthogonal (e.g., depth-cap retreats) that doesn't actually trigger a fallback to greedy completion? If you can analyze the spec/code text I provided here without seeing the codebase, what's your read?

4. **Adjacent gap audit** — given the architecture as described, are there other likely silent-no-op fields or asymmetric integrations that the audit pattern (compiler accepts + driver implemented + agent-runtime missing) might also affect? Suggest greps or file paths to inspect for similar patterns.

5. **Spec 161 scope** — should chooseNStep integration be one spec, or should it be split into (a) the runtime integration plus (b) the design-decision-on-cost-caps as separate specs?

---

## Engine context for the deep-research LLM (no codebase access needed)

### Foundations the engine commits to

- **F#1 Engine-agnostic**: no game-specific identifiers in engine code; all game logic is in YAML game-spec data
- **F#4 Authoritative state and observer views**: hidden-info handling must respect observer mode
- **F#7 Refs are declarative**: no eval, no scripts; refs are static strings resolved against state
- **F#8 Determinism is sacred**: replay-identity is a load-bearing property
- **F#10 Bounded computation**: every loop has a compile-time hard cap
- **F#11 Immutability**: state is never mutated; new states are created
- **F#14 No backwards compatibility**: deprecated surfaces are removed, not deprecated-with-shim
- **F#15 Architectural completeness**: prefer root-cause fixes over tuning
- **F#19 Decision-granularity uniformity**: kernel publishes one atomic decision at a time; inner microturns are first-class

### File-size convention

- 200-400 lines per file is typical
- 800 lines is the hard cap
- Many small files preferred over few large

The relevant files' current sizes (approximate):
- `policy-agent.ts`: 600+ lines
- `policy-preview-inner.ts`: 760+ lines
- `policy-agent-inner-preview.ts`: 180 lines

The integration must respect these caps. Adding a parallel chooseNStep wrapper to `policy-agent-inner-preview.ts` is fine; adding 200 more lines to `policy-preview-inner.ts` would push it close to the cap and may warrant extraction.

### Test classification

Engine tests are classified as one of:
- `architectural-invariant` (default)
- `convergence-witness` (seed/profile-specific guard)
- `golden-trace` (byte-pinned reference)

A new chooseNStep integration should ship at least one architectural-invariant test (per-option iteration covers all legal candidates; deterministic ordering) and one or two golden-trace tests for replay identity.

### How profiles are evaluated end-to-end

1. YAML is parsed by `cnl/` compiler
2. `compile-agents.ts` validates and lowers the agent block
3. `validate-agents.ts` post-validates structural concerns (warnings)
4. Compiled GameDef contains `agents: AgentPolicyCatalog`
5. At runtime, `PolicyAgent` calls `chooseDecision(microturn)` per published microturn
6. `chooseFrontierDecision` is the entry point for `chooseOne` / `chooseNStep` microturns
7. Agent picks an option; kernel applies and republishes the next microturn

### Why I trust this audit

- I directly inspected the source files and grep'd for callers of `runChooseNStepBeamPreview` (zero non-test callers across `packages/engine/src/`)
- I ran an experiment that set `preview.inner.chooseNStep: true` and observed via trace that ALL 11 chooseNStep decisions retained `previewUsage.mode: 'disabled'` and the `decisionBreakdown` was unchanged
- I read tickets 006 and 007 in `archive/tickets/160PEROPTPREV-*.md` and confirmed the chooseNStep agent integration was explicitly deferred and never landed
- The unit test file `packages/engine/test/unit/agents/policy-preview-inner-choosen-beam.test.ts` exists and verifies `runChooseNStepBeamPreview` independently — confirming the driver works correctly in isolation; the gap is purely at the integration boundary

---

## Wrap

The chooseNStep gap is real, observable, and documented. The driver exists, the compiler validates, the cookbook documents — but the agent runtime never invokes it. Proposed fix is feasible within a few hundred LoC plus tests, gated on resolving the per-option vs beam-rubber-stamp design ambiguity. Spec 161 recommended as the proper home for this work.

The campaign that surfaced this gap is being closed. Outcomes from the campaign:

- exp-001 ACCEPT: opt arvn-evolved into `preview.inner.chooseOne: true` with `preferOptionProjectedMargin` microturn-scope consideration. compositeScore -9 → -8 on seed 1000 tier 1. 12 chooseOne ties broken via per-option preview signal.
- exp-002 NEAR_MISS (stashed): switch `preview.completion: greedy → policyGuided`. No metric change; `policyGuided` fired but did not break the 8 utility=constant actionSelections.
- exp-003 REJECT: `preview.inner.chooseNStep: true`. Silent no-op. Surface this report.
- infra commit: dedupe `preferOptionProjectedMargin` in the canary test's profile-extension code (was unconditionally appending a consideration that already exists in the base profile, double-counting).
