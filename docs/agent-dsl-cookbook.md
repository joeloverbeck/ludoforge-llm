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

Preview remains useful when it stays one-step and bounded.

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
