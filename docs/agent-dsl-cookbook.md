# Agent Policy DSL Cookbook

Current authoring reference for `agents:` YAML after the spec-140 microturn migration.

This document is intentionally narrower than the raw compiler surface. It describes the production-safe subset we should author going forward, based on `docs/FOUNDATIONS.md`, `docs/architecture.md`, and the live shipped profiles in:

- `data/games/fire-in-the-lake/92-agents.md`
- `data/games/texas-holdem/92-agents.md`

## Status

The old cookbook had drifted into teaching pre-microturn patterns as normal authoring, including:

- completion-scoped scoring
- `decision.*` / `option.value` policy refs
- `candidate.param.*` heuristics
- `preview.phase1` multi-step preview

Those patterns are no longer part of the recommended production contract. Some internal compiler support still exists, but new production profiles should not be authored around those surfaces.

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
- `considerations`: weighted score terms; for new production authoring, keep these `scopes: [move]`
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
| `selectionReason` | Inner-selection reason. Today `greedyAlphabetical` is the populated value; `microturnPolicy` and `fallback` are reserved for later policy-guided completion work. |
| `score` | Inner-selection score recorded for the synthetic decision. |
| `scoreContributions` | Term-level contribution breakdown for the synthetic decision; currently a placeholder for later policy-guided completion work. |
| `completionPolicy` | Completion policy used by the drive, currently `greedy` or `agentGuided`. |

For Gap 3-style diagnosis, inspect the selected option for the inner choice that should change the projected metric. A FITL govern-mode `chooseOne` where `selectedOptionStableKey` points at `aid` and `selectionReason` is `greedyAlphabetical` explains why projected patronage or margin refs may remain constant across otherwise ready candidates.

### Inner-Frontier `scoreContributions[]`

Verbose inner-frontier candidate rows also carry `scoreContributions[]`. Each entry has:

| Field | Meaning |
| --- | --- |
| `termId` | The consideration id that contributed to this candidate's score. |
| `contribution` | The integer contribution from that term. |

Use this when diagnosing `chooseOne` or `chooseNStep` authoring. For example, a historical FITL `preferPatronageMode` inner-choice consideration should show a positive contribution on the patronage candidate row when that consideration fires. That surface is completion-scope in the current Spec 156 implementation; Spec 158 is expected to rename the authoring model to microturn scope, so do not copy `scopes: [completion]` into new production profiles.

### Gap Diagnosis Quick Map

| Symptom | Trace field to inspect |
| --- | --- |
| Too many candidates never previewed | `candidate.selectionReason: 'gated'`, `previewUsage.outcomeBreakdown.unknownGated`, `previewGatedCount` |
| Preview is ready but not useful | `previewUsage.utility: 'constant'`, plus `readyRefStats[*].allReadyValuesEqual` |
| Greedy completion picked the wrong inner option | `candidate.previewDrive.syntheticDecisions[].selectionReason` and `selectedOptionStableKey` |
| Inner `chooseOne` / `chooseNStep` score has no obvious cause | Inner-frontier candidate `scoreContributions[]` |
| Later policy-guided completion silently falls back | Synthetic-decision `selectionReason: 'fallback'` once that later surface lands |

## Retired For New Production Profiles

Do not copy these patterns into new shipped profiles:

- `scopes: [completion]`
- `decision.type`, `decision.name`, `decision.targetKind`, `decision.optionCount`
- `option.value`
- `candidate.param.*`
- `preview.phase1`
- `preview.phase1CompletionsPerAction`

Why:

- They encourage reasoning about unpublished sub-decisions instead of the current atomic frontier.
- They were the exact surfaces that became misleading during the microturn overhaul.
- The shipped FITL and Texas profiles have already been simplified away from them.

If you see them in older tests or exploratory fixtures, treat them as legacy/internal coverage, not as the cookbook baseline.

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

When inspecting inner `chooseOne` or `chooseNStep` scoring in verbose traces, use candidate `scoreContributions[]` to see which consideration terms fired. Do not add completion-scoped examples to new profiles just to produce trace output; that surface is retained only for current internal coverage and pending migration work.

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
```

```yaml
preview:
  mode: tolerateStochastic
```

Guidance:

- use `exactWorld` when you expect preview to stay deterministic enough
- use `tolerateStochastic` when stochastic effects are common and you still want bounded preview
- use `disabled` when the profile is intentionally current-state-only

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
- Keep new production considerations `scopes: [move]`.
- Default to `stableMoveKey` as the final tiebreaker.
- Normalize with aggregates inside considerations, not candidate features.
- If a heuristic seems to require unpublished completion structure, remove or redesign it instead of reintroducing pre-microturn assumptions.

## When You Find Older Patterns

If you encounter existing docs, tests, or archived notes that promote completion scoring or param-introspective heuristics:

- do not copy them into new production YAML
- treat them as historical or internal coverage only
- rewrite toward move-scoped atomic-decision heuristics

That is the current project direction after the microturn overhaul.
