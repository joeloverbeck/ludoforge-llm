# Agent Policy DSL Cookbook

Current authoring reference for `agents:` YAML after the spec-140 microturn migration.

This document is intentionally narrower than the raw compiler surface. It describes the production-safe subset we should author going forward, based on `docs/FOUNDATIONS.md`, `docs/architecture.md`, and the live shipped profiles in:

- `data/games/fire-in-the-lake/92-agents.md`
- `data/games/texas-holdem/92-agents.md`

## Status

The old cookbook had drifted into teaching pre-microturn patterns as normal authoring, including:

- microturn-scoped inner-frontier scoring
- retired `decision.*` / `option.value` policy refs
- `candidate.param.*` heuristics
- `preview.phase1` multi-step preview

The replacement production contract is `scopes: [microturn]` with `microturn.*` refs. Do not author new profiles around the retired names.

## Mental Model

Under the microturn protocol, the kernel publishes one atomic decision frontier at a time. Policy profiles should therefore be written as:

- move-scoped scoring over the currently published legal actions
- bounded current-state and one-step preview heuristics
- deterministic tie-breaking over already published atomic choices

Do not design new profiles around client-side completion search or multi-step speculative execution. That conflicts with Foundations `#5`, `#10`, `#18`, and `#19`.

## Shape

```yaml
agents:
  parameters:
  library:
    stateFeatures:
    candidateFeatures:
    candidateAggregates:
    pruningRules:
    considerations:
    tieBreakers:
    strategicConditions:
  profiles:
  bindings:
```

Meaning:

- `parameters`: tunable knobs shared across profiles
- `stateFeatures`: expressions evaluated once per published decision point
- `candidateFeatures`: per-action expressions, often using `preview.*`
- `candidateAggregates`: cross-candidate reductions such as `any`, `min`, `max`
- `pruningRules`: boolean filters that can drop bad candidates before scoring
- `considerations`: weighted score terms; use `scopes: [move]` for action-selection candidates and `scopes: [microturn]` for inner `chooseOne` / `chooseNStep` frontiers
- `tieBreakers`: deterministic tiebreak logic after weighted scoring
- `strategicConditions`: reusable boolean/proximity conditions
- `profiles`: seat- or variant-specific parameter and selection config
- `bindings`: seat-to-profile mapping

## Recommended Reference Paths

### Current-State Refs

Use these freely in `stateFeatures`, `candidateFeatures`, `pruningRules`, and move-scoped considerations:

| Ref | Meaning |
| --- | --- |
| `victory.currentMargin.self` | current own margin |
| `victory.currentMargin.<seatName>` | current named-seat margin |
| `victory.currentRank.self` | current own rank |
| `var.global.<id>` | global variable |
| `var.player.self.<id>` | acting seat's per-player variable |
| `var.seat.<seatName>.<id>` | named-seat variable |
| `metric.<id>` | derived metric |
| `globalMarker.<id>` | global marker state |
| `turn.round` | current round counter |
| `turn.phaseId` | current phase id |
| `turn.stepId` | current step id |
| `seat.self` | acting seat id |
| `seat.active` | active seat id |
| `feature.<id>` | library state feature |
| `aggregate.<id>` | library aggregate |
| `condition.<id>.satisfied` | strategic condition boolean |
| `condition.<id>.proximity` | strategic condition proximity |

### Candidate Refs

These remain part of the production-safe move-scoped contract:

| Ref | Meaning |
| --- | --- |
| `candidate.actionId` | candidate action id |
| `candidate.tag.<name>` | whether the candidate has a tag |
| `candidate.tags` | all candidate tags |
| `candidate.stableMoveKey` | deterministic move identity |

For new production authoring, prefer `candidate.tag.*` and state/preview-derived scoring over parameter introspection.

### Preview Refs

Preview remains useful when it stays bounded. Action-selection candidates now use a bounded synthetic-completion driver by default, so `preview.*` refs project through same-seat inner microturns without reviving retired `decision.*`, `option.value`, or `candidate.param.*` authoring.

| Ref | Meaning |
| --- | --- |
| `preview.victory.currentMargin.self` | projected own margin after the candidate |
| `preview.victory.currentRank.self` | projected own rank after the candidate |
| `preview.var.global.<id>` | projected global variable |
| `preview.var.player.self.<id>` | projected acting-seat variable |
| `preview.var.seat.<seatName>.<id>` | projected named-seat variable |
| `preview.metric.<id>` | projected derived metric |
| `preview.globalMarker.<id>` | projected marker state |
| `preview.feature.<id>` | current `stateFeature` re-evaluated on preview state |

Always `coalesce` preview refs because preview can legitimately fail or become unknown:

```yaml
candidateFeatures:
  projectedSelfMargin:
    type: number
    expr:
      coalesce:
        - { ref: preview.victory.currentMargin.self }
        - { ref: feature.selfMargin }
```

When tuning preview, read `previewUsage.utility` and `previewUsage.readyRefStats` in the agent-decision trace to confirm the refs differentiate ready candidates.

## Reading the Preview Trace

Preview trace fields answer three separate questions:

- did preview run for this decision?
- did ready preview candidates produce different projected values?
- why were candidates or synthetic inner choices selected?

### `previewUsage.readyRefStats`

`previewUsage.readyRefStats` is keyed by preview ref id. Each entry summarizes the values produced by candidates whose `previewOutcome` is `ready`:

| Field | Meaning |
| --- | --- |
| `readyCount` | Number of ready candidates that resolved this ref. |
| `distinctValueCount` | Number of distinct resolved values among those candidates. |
| `min` | Lowest resolved integer value, or `null` when no ready value exists. |
| `max` | Highest resolved integer value, or `null` when no ready value exists. |
| `range` | `max - min`, or `null` when no ready value exists. |
| `allReadyValuesEqual` | `true` when every ready value for this ref is identical. |

Healthy preview has at least one important ref with `distinctValueCount > 1`. That means candidates are projecting to meaningfully different states. Degenerate preview often shows high `readyCount` but `allReadyValuesEqual: true` for every requested ref; the synthetic drive completed, but it gave the policy no useful ordering signal.

### `previewUsage.utility`

`previewUsage.utility` classifies the decision-level usefulness of the ready preview set:

| Value | Policy-quality meaning |
| --- | --- |
| `none` | No candidate was ready, so preview did not contribute a projected-value signal. |
| `constant` | Ready candidates projected identical values for every requested ref. Preview fired, but it added no scoring signal. This is the common signature of greedy completion picking state-neutral inner options. |
| `lowInformation` | Some requested refs differentiate and others do not. Preview is partially useful; inspect which refs stayed constant. |
| `differentiating` | At least one requested ref has `distinctValueCount > 1`. Preview is doing real work for this decision. |

Treat `previewOutcome: ready` as a transport status, not as proof of policy value. A decision with `utility: constant` can have many ready candidates and still be blind because every ready candidate scored against the same projected value.

### `previewUsage.completionPolicyFallbackCount`

`previewUsage.completionPolicyFallbackCount` counts how many synthetic inner microturns fell back while evaluating all previewed candidates for the decision. Use it to answer whether `policyGuided` is actually selecting inner options for the profile:

- `0` means no policy-guided fallback fired for the decision
- non-zero means at least one inner microturn could not be selected by the microturn policy evaluator and used the configured fallback path

Pair this aggregate with `candidate.previewDrive.syntheticDecisions[]` entries whose `selectionReason` and `completionPolicy` are both `fallback` to inspect the exact inner microturns that fell back.

### `candidate.selectionReason`

Each action-selection candidate carries `selectionReason`, which explains preview-budget selection at the candidate row:

| Value | Current meaning |
| --- | --- |
| `gated` | Excluded by the preview budget gate; parity-checks against `previewGatedCount`. |
| `prior` | Current placeholder for non-gated candidates until the later budget allocator distinguishes reasons. |
| `coverage` | Reserved for a coverage pass in the later balanced-budget allocator. |
| `widening` | Reserved for a later widen-on-uniform-projection pass. |
| `shallowDelta` | Reserved for a later shallow-preview pass. |
| `cache` | Reserved for future cache-backed selection. |

This field lives on the action-selection candidate. The `selectionReason` inside `previewDrive.syntheticDecisions[]` is a different surface: it explains how the preview driver selected an inner microturn option.

### `candidate.previewDrive.syntheticDecisions[]`

Verbose traces include `candidate.previewDrive.syntheticDecisions[]` for each preview drive. Each entry records one synthetic inner microturn:

| Field | Meaning |
| --- | --- |
| `depth` | One-based depth inside this preview drive. |
| `microturnKind` | Inner frontier kind, currently `chooseOne` or `chooseNStep`. |
| `decisionKey` | Stable key for the inner decision request. |
| `selectedOptionStableKey` | Stable key for the option selected by the driver. |
| `selectionReason` | Inner-selection reason: `greedyAlphabetical` for greedy completion, `microturnPolicy` for policy-guided completion, or `fallback` when policy-guided completion could not select an inner option and the configured fallback fired. |
| `score` | Inner-selection score recorded for the synthetic decision. |
| `scoreContributions` | Term-level contribution breakdown for the synthetic decision. |
| `completionPolicy` | Completion policy used for this inner synthetic decision: `greedy`, `policyGuided`, or `fallback`. `fallback` is a trace value only, not an authorable config value. |

For Gap 3-style diagnosis, inspect the selected option for the inner choice that should change the projected metric. A FITL govern-mode `chooseOne` where `selectedOptionStableKey` points at `aid` and `selectionReason` is `greedyAlphabetical` explains why projected patronage or margin refs may remain constant across otherwise ready candidates.

### Inner-Frontier `scoreContributions[]`

Verbose inner-frontier candidate rows also carry `scoreContributions[]`. Each entry has:

| Field | Meaning |
| --- | --- |
| `termId` | The consideration id that contributed to this candidate's score. |
| `contribution` | The integer contribution from that term. |

Use this when diagnosing `chooseOne` or `chooseNStep` authoring. For example, a FITL-style `preferPatronageMode` inner-choice consideration should show a positive contribution on the patronage candidate row when that microturn-scoped consideration fires.

## Microturn Scope

Use `scopes: [microturn]` when a profile needs to score the options of the currently published inner frontier. A microturn-scoped consideration fires once per `(microturn, option)` pair while the chooser is evaluating `chooseOne` or `chooseNStep`.

| Ref | Meaning |
| --- | --- |
| `microturn.kind` | Published frontier kind, such as `chooseOne` or `chooseNStep`. |
| `microturn.decisionKey` | Stable decision key for the current frontier. |
| `microturn.actorSeat` | Seat currently making the decision when known. |
| `microturn.option.value` | Current option value. |
| `microturn.option.index` | Current option index after legality-precedence filtering. |
| `microturn.option.stableKey` | Stable JSON key for the option value. |
| `microturn.option.tags` | Tags attached to the option; currently empty unless the kernel supplies generic option tags. |
| `microturn.option.targetKind` | Target kind for the current option when known. |
| `microturn.remainingRequiredCount` | Remaining required selections for a `chooseNStep`; `1` for `chooseOne`. |
| `microturn.remainingMaxCount` | Remaining maximum selections for a `chooseNStep`; `1` for `chooseOne`. |

```yaml
preferPatronageMode:
  scopes: [microturn]
  when:
    and:
      - eq: [{ ref: microturn.kind }, chooseOne]
      - eq: [{ ref: microturn.decisionKey }, governMode]
  weight: 10
  value:
    boolToNumber:
      eq:
        - { ref: microturn.option.value }
        - patronage
```

## Inner Preview

Specs 160 and 161 add opt-in preview for inner `chooseOne` and `chooseNStep` microturns. This is the microturn-level analog of action-selection preview: instead of asking "what state would this action-selection candidate reach?", the profile can ask "what state would this currently published option reach?".

This surface exists to keep authored policy data aligned with Foundation 10 and Foundation 19. The driver is bounded, and it scores the same atomic microturn options the kernel publishes.

### `preview.inner` Configuration

`preview.inner` is a profile-level block under `preview`:

```yaml
preview:
  mode: exactWorld
  completion: policyGuided
  fallbackCompletionPolicy: fail
  inner:
    chooseOne: true
    chooseNStep: false
    maxOptions: 8
    chooseNBeamWidth: 1
    depthCap: 4
```

Fields:

| Field | Meaning |
| --- | --- |
| `chooseOne` | Enables one per-option preview drive for each legal `chooseOne` option. Defaults to `false`. |
| `chooseNStep` | Enables bounded beam preview for `chooseNStep` frontiers. Defaults to `false`. |
| `maxOptions` | Maximum options considered at each inner frontier. Defaults to `1` when the block is lowered. |
| `chooseNBeamWidth` | Beam width for `chooseNStep` preview. Defaults to `1`. |
| `depthCap` | Maximum synthetic microturn depth for each per-option drive. Defaults to `1`. |

The compiler enforces `INNER_PREVIEW_HARD_CAP = 256`. For `chooseOne`, cost is bounded by `maxOptions * chooseNBeamWidth * depthCap`. When `chooseNStep: true` is enabled, validation uses the per-root-option forced-continuation bound `maxOptions * (1 + chooseNBeamWidth * maxOptions * max(0, depthCap - 1))`.

When `chooseOne: true` or `chooseNStep: true` is authored but no `scopes: [microturn]` consideration references a `preview.option.*` ref, the compiler emits a warning. The driver would run in that configuration, but it would not contribute a scoring signal.

### `preview.option.*` Refs

Use these from microturn-scoped considerations. They are registered in this order:

| Ref | Meaning |
| --- | --- |
| `preview.option.victory.currentMargin.self` | Projected own victory margin after the option. |
| `preview.option.victory.currentRank.self` | Projected own rank after the option. |
| `preview.option.delta.victory.currentMargin.self` | Projected margin change for this option, computed as post-option minus pre-option. |
| `preview.option.var.global.<id>` | Projected global variable value after the option. |
| `preview.option.var.player.self.<id>` | Projected acting-seat variable value after the option. |
| `preview.option.metric.<id>` | Projected derived metric value after the option. |
| `preview.option.outcome` | Per-option preview outcome, such as `ready`, `hidden`, or `depthCap`. |
| `preview.option.driveDepth` | Synthetic microturn depth reached by the per-option drive. |

Always handle non-ready outcomes explicitly. If a ref would touch a hidden surface for the acting observer, inner preview reports that through the existing hidden preview outcome and increments the hidden outcome breakdown. That preserves Foundation 4: policy data can react to hidden-safe status, but it does not inspect the hidden value.

### Govern-Mode `chooseOne` Example

This diagnostic profile shape opts into per-option preview for an inner govern-mode `chooseOne`. The `preferOptionProjectedMargin` consideration scores each option by its projected margin delta, so the agent can prefer a higher-margin option such as `patronage` over a greedy alphabetical choice such as `aid` when the projection supports it.

```yaml
agents:
  library:
    considerations:
      preferOptionProjectedMargin:
        scopes: [microturn]
        costClass: preview
        weight: 300
        value:
          ref: preview.option.delta.victory.currentMargin.self
        previewFallback:
          onUnavailable: noContribution

  profiles:
    arvn-inner-preview:
      extends: arvn-evolved
      observer: currentPlayer
      preview:
        mode: exactWorld
        completion: policyGuided
        fallbackCompletionPolicy: fail
        inner:
          chooseOne: true
          chooseNStep: false
          maxOptions: 8
          chooseNBeamWidth: 1
          depthCap: 4
      use:
        considerations:
          - preferOptionProjectedMargin
```

Use `previewUsage.readyRefStats['preview.option.delta.victory.currentMargin.self']` to confirm the per-option values differ. In the verbose inner-frontier trace, the selected option should show a positive `scoreContributions[]` entry for `preferOptionProjectedMargin` when this term is the reason the option wins.

### Target-Selection `chooseNStep` Example

For `chooseNStep`, use the same microturn-scoped consideration. Spec 161 makes the per-option projected refs available for each legal ADD option. For shallow chooseNStep frontiers within `depthCap`, the consideration differentiates the currently published add choices the same way it differentiates `chooseOne` options. For deeply nested chooseNStep ladders that exit at `depthCap` before the requested ref can resolve, per-option preview is `unavailable` under Foundation #20. The consideration must declare `previewFallback.onUnavailable` so scoring under that unavailable case is explicit. See [Preview Signal Integrity](#preview-signal-integrity).

```yaml
agents:
  library:
    considerations:
      preferOptionProjectedMargin:
        scopes: [microturn]
        costClass: preview
        weight: 300
        value:
          ref: preview.option.delta.victory.currentMargin.self
        previewFallback:
          onUnavailable: noContribution

  profiles:
    arvn-inner-preview:
      extends: arvn-evolved
      observer: currentPlayer
      preview:
        mode: exactWorld
        completion: policyGuided
        fallbackCompletionPolicy: fail
        inner:
          chooseOne: true
          chooseNStep: true
          maxOptions: 8
          chooseNBeamWidth: 1
          depthCap: 4
      use:
        considerations:
          - preferOptionProjectedMargin
```

At a `chooseNStep` microturn, this scores ADD options only. CONFIRM is not a per-option-scored option; the `min`/`max` cardinality of the chooseN drives set-completion logic. Author considerations for the ADD choices whose `microturn.option.value` is being selected, not for CONFIRM.

The example's `chooseNStep` validation cost is `8 * (1 + 1 * 8 * max(0, 4 - 1)) = 200`, which fits under the 256 hard cap. Use `previewUsage.readyRefStats['preview.option.delta.victory.currentMargin.self']` and inner-frontier `scoreContributions[]` to confirm when projected margin deltas are differentiating the ADD options. When all root-option drives are unavailable, the trace reports `selectionReason: tiebreakAfterPreviewNoSignal`, candidate `unknownPreviewRefs`, and a `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory instead of a silent zero contribution.

### Preview Signal Integrity

Every consideration whose `value` reads a `preview.option.*` ref must declare `previewFallback.onUnavailable`.

Use `noContribution` when an unavailable preview ref should not affect the option score. The consideration is omitted from `scoreContributions[]`, and the trace records the unavailable ref and reason.

```yaml
preferOptionProjectedMargin:
  scopes: [microturn]
  costClass: preview
  weight: 300
  value:
    ref: preview.option.delta.victory.currentMargin.self
  previewFallback:
    onUnavailable: noContribution
```

Use `{ constant: <integer> }` only when the profile intentionally converts an unavailable preview ref into an explicit numeric contribution. The trace records `previewFallbackFired`, and a selected candidate that used an explicit constant fallback reports `selectionReason: fallbackExplicit`.

```yaml
preferOptionProjectedMargin:
  scopes: [microturn]
  costClass: preview
  weight: 300
  value:
    ref: preview.option.delta.victory.currentMargin.self
  previewFallback:
    onUnavailable:
      constant: 0
```

The compiler rejects preview-ref considerations that omit this declaration with `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK`; add `previewFallback.onUnavailable` to fix the profile. The FITL `preferOptionProjectedMargin` recipe in `data/games/fire-in-the-lake/92-agents.md` uses `noContribution`.

### Gap Diagnosis Quick Map

| Symptom | Trace field to inspect |
| --- | --- |
| Too many candidates never previewed | `candidate.selectionReason: 'gated'`, `previewUsage.outcomeBreakdown.unknownGated`, `previewGatedCount` |
| Preview is ready but not useful | `previewUsage.utility: 'constant'`, plus `readyRefStats[*].allReadyValuesEqual` |
| Greedy completion picked the wrong inner option | `candidate.previewDrive.syntheticDecisions[].selectionReason` and `selectedOptionStableKey` |
| Inner `chooseOne` / `chooseNStep` score has no obvious cause | Inner-frontier candidate `scoreContributions[]` |
| Policy-guided completion is falling back | `previewUsage.completionPolicyFallbackCount`, plus synthetic-decision `selectionReason: 'fallback'` and `completionPolicy: 'fallback'` |

## Parameters

Define tunable knobs once, then override them per profile.

```yaml
parameters:
  governWeight:
    type: number
    default: 1
    min: 0
    max: 10
    tunable: true
```

Use them from a consideration:

```yaml
preferGovernWeighted:
  scopes: [move]
  weight:
    param: governWeight
  value:
    boolToNumber:
      ref: candidate.tag.govern
```

## State Features

State features are cached per published decision point. Use them for reusable measurements of the current state.

```yaml
stateFeatures:
  selfResources:
    type: number
    expr:
      ref: var.player.self.resources

  patronage:
    type: number
    expr:
      ref: var.global.patronage

  facingBet:
    type: boolean
    expr:
      gt:
        - { ref: feature.callAmount }
        - 0
```

### Token Aggregation

`globalTokenAgg` and `zoneTokenAgg` remain core tools for authored heuristics.

```yaml
stateFeatures:
  vcGuerrillaCount:
    type: number
    expr:
      globalTokenAgg:
        aggOp: count
        tokenFilter:
          props:
            faction: { eq: VC }
            type: { eq: guerrilla }

  handHighCard:
    type: number
    expr:
      zoneTokenAgg:
        zone: hand
        owner: self
        prop: rank
        op: max
```

Notes:

- `globalTokenAgg` uses `aggOp`
- `zoneTokenAgg` uses `op`
- `self` inside token filters resolves to the acting seat at runtime

## Candidate Features

Candidate features should answer one question: what does this currently published action look like, possibly after one-step preview?

Good examples from the live corpus:

```yaml
candidateFeatures:
  projectedSelfMargin:
    type: number
    expr:
      coalesce:
        - { ref: preview.victory.currentMargin.self }
        - { ref: feature.selfMargin }

  projectedCapabilityGain:
    type: number
    expr:
      coalesce:
        - sub:
            - coalesce:
                - { ref: preview.feature.vcFriendlyCapCount }
                - { ref: feature.vcFriendlyCapCount }
            - { ref: feature.vcFriendlyCapCount }
        - 0
```

Avoid using candidate features as a backdoor to inspect hidden move-template structure. Keep them focused on the published atomic action and visible preview state.

## Candidate Aggregates

Use aggregates for cross-candidate context such as normalization or pass suppression.

```yaml
candidateAggregates:
  hasNonPassAlternative:
    op: any
    of:
      not:
        ref: candidate.tag.pass

  maxMarginScore:
    op: max
    of:
      ref: feature.projectedSelfMargin

  minMarginScore:
    op: min
    of:
      ref: feature.projectedSelfMargin
```

## Pruning Rules

Pruning should eliminate obviously bad choices, not encode the whole policy.

```yaml
pruningRules:
  dropPassWhenOtherMovesExist:
    when:
      and:
        - { ref: candidate.tag.pass }
        - { ref: aggregate.hasNonPassAlternative }
    onEmpty: skipRule
```

Use `onEmpty: skipRule` unless you want the profile to fail hard when pruning removes everything.

## Considerations

For new production authoring, keep considerations move-scoped:

```yaml
considerations:
  preferEvent:
    scopes: [move]
    weight:
      param: eventWeight
    value:
      boolToNumber:
        ref: candidate.tag.event-play

  governWhenPatronageLow:
    scopes: [move]
    when:
      lt:
        - { ref: feature.patronage }
        - 20
    weight: 8
    value:
      boolToNumber:
        ref: candidate.tag.govern
```

When inspecting inner `chooseOne` or `chooseNStep` scoring in verbose traces, use candidate `scoreContributions[]` to see which consideration terms fired. Author inner-frontier preferences with `scopes: [microturn]` and `microturn.*` refs; completion-scoped examples must not be added to new profiles.

### Normalization Pattern

Do normalization in the consideration, not in the candidate feature, because considerations can see both `feature.*` and `aggregate.*`.

```yaml
preferNormalizedMargin:
  scopes: [move]
  weight: 5
  value:
    div:
      - sub:
          - { ref: feature.projectedSelfMargin }
          - { ref: aggregate.minMarginScore }
      - max:
          - 1
          - sub:
              - { ref: aggregate.maxMarginScore }
              - { ref: aggregate.minMarginScore }
```

### Guarded Heuristics

Use `when:` to specialize a term to a situation:

```yaml
foldWhenBadPotOdds:
  scopes: [move]
  weight: 200
  value:
    boolToNumber:
      and:
        - { ref: candidate.tag.fold }
        - { ref: feature.facingBet }
        - not: { ref: feature.potOddsFavorable }
```

## Tie Breakers

Supported tie-breaker kinds:

- `stableMoveKey`
- `higherExpr`
- `lowerExpr`
- `preferredEnumOrder`
- `preferredIdOrder`
- `rng`

The current shipped profiles use `stableMoveKey`, which should remain the default unless you have a clear reason otherwise.

```yaml
tieBreakers:
  stableMoveKey:
    kind: stableMoveKey
```

Use expression tie-breakers only when weighted scoring should intentionally leave some candidates tied until the very end.

## Profile Configuration

### Preview

Supported profile preview modes:

- `exactWorld`
- `tolerateStochastic`
- `disabled`

Examples:

```yaml
preview:
  mode: exactWorld
  completion: policyGuided
  fallbackCompletionPolicy: greedy
  budget:
    strategy: balancedCoverage
    fullCandidateCap: 4
    minPerGroup: 1
```

```yaml
preview:
  mode: tolerateStochastic
  budget:
    strategy: balancedCoverage
    fullCandidateCap: 8
    minPerGroup: 1
```

Guidance:

- use `exactWorld` when you expect preview to stay deterministic enough
- use `tolerateStochastic` when stochastic effects are common and you still want bounded preview
- use `disabled` when the profile is intentionally current-state-only
- use `completion: policyGuided` when synthetic inner microturns should be scored by the profile's microturn-scoped policy considerations
- use `completion: greedy` for fast, non-discriminating alphabetical completion; it is deterministic, useful as a baseline or fallback, and can be adversarial for projected-value signals
- use `fallbackCompletionPolicy: greedy` with `policyGuided` to keep preview ready when the microturn evaluator cannot decide; each firing is recorded in the synthetic-decision trace and counted in `previewUsage.completionPolicyFallbackCount`
- use `fallbackCompletionPolicy: fail` with `policyGuided` when diagnostic profiles should abort preview with `previewOutcome: noPreviewDecision` instead of completing through greedy fallback
- use `budget.strategy: balancedCoverage` to guarantee at least `minPerGroup` previewed candidates per stable action/parameter-shape group before remaining slots are filled by move-only prior score
- migrate an old preview cap `N` to `budget: { strategy: balancedCoverage, fullCandidateCap: N, minPerGroup: 1 }`; the compiler rejects the removed cap field with Spec 157 migration guidance

`completion: policyGuided` scores synthetic inner microturn options with the same policy consideration machinery that scores real decisions, bounded to the currently published inner frontier. `fallbackCompletionPolicy` is meaningful only with `completion: policyGuided`; the compiler rejects it under greedy completion. A `policyGuided` profile needs at least one consideration with `scopes: [microturn]` to select inner options through policy scoring. Without one, the compiler warns and runtime always uses the configured fallback.

Forward-looking widening fields are valid in `preview.budget` for the later widening phase:

```yaml
preview:
  mode: exactWorld
  budget:
    strategy: balancedCoverage
    fullCandidateCap: 4
    minPerGroup: 1
    widenOnUniformProjection: true
    widenCap: 4
    widenStep: 2
```

### Selection

Supported selection modes:

- `argmax`
- `softmaxSample`
- `weightedSample`

Example:

```yaml
selection:
  mode: softmaxSample
  temperature: 0.5
```

Guidance:

- `argmax` for deterministic strongest-score choice
- `softmaxSample` for stochastic exploration with temperature control
- `weightedSample` when you want weights interpreted directly

If you use `softmaxSample`, you must provide `temperature`.

## Full Production-Style Example

```yaml
agents:
  parameters:
    projectedMarginWeight:
      type: number
      default: 1
      min: -10
      max: 10
      tunable: true

  library:
    stateFeatures:
      selfMargin:
        type: number
        expr:
          ref: victory.currentMargin.self

    candidateFeatures:
      projectedSelfMargin:
        type: number
        expr:
          coalesce:
            - { ref: preview.victory.currentMargin.self }
            - { ref: feature.selfMargin }

    candidateAggregates:
      hasNonPassAlternative:
        op: any
        of:
          not:
            ref: candidate.tag.pass

      maxMarginScore:
        op: max
        of:
          ref: feature.projectedSelfMargin

      minMarginScore:
        op: min
        of:
          ref: feature.projectedSelfMargin

    pruningRules:
      dropPassWhenOtherMovesExist:
        when:
          and:
            - { ref: candidate.tag.pass }
            - { ref: aggregate.hasNonPassAlternative }
        onEmpty: skipRule

    considerations:
      preferProjectedSelfMargin:
        scopes: [move]
        weight:
          param: projectedMarginWeight
        value:
          ref: feature.projectedSelfMargin

      preferNormalizedMargin:
        scopes: [move]
        weight: 5
        value:
          div:
            - sub:
                - { ref: feature.projectedSelfMargin }
                - { ref: aggregate.minMarginScore }
            - max:
                - 1
                - sub:
                    - { ref: aggregate.maxMarginScore }
                    - { ref: aggregate.minMarginScore }

    tieBreakers:
      stableMoveKey:
        kind: stableMoveKey

  profiles:
    baseline:
      preview:
        mode: exactWorld
      use:
        pruningRules:
          - dropPassWhenOtherMovesExist
        considerations:
          - preferProjectedSelfMargin
          - preferNormalizedMargin
        tieBreakers:
          - stableMoveKey

  bindings:
    neutral: baseline
```

## Authoring Guidance

- Prefer simple `candidate.tag.*` gating before reaching for more exotic structure.
- Use preview sparingly and always defend it with `coalesce`.
- Use `scopes: [move]` for action candidates and `scopes: [microturn]` only for published inner-frontier options.
- Default to `stableMoveKey` as the final tiebreaker.
- Normalize with aggregates inside considerations, not candidate features.
- If a heuristic seems to require unpublished completion structure, remove or redesign it instead of reintroducing pre-microturn assumptions.

## When You Find Older Patterns

If you encounter existing docs, tests, or archived notes that promote retired completion scoring or param-introspective heuristics:

- do not copy them into new production YAML
- treat them as historical evidence
- rewrite toward move-scoped action heuristics or microturn-scoped option heuristics

That is the current project direction after the microturn overhaul.
