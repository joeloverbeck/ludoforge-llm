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
    selectors:
    strategyModules:
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
- `selectors`: named finite rankings over published candidates, microturn options, or generic collections
- `strategyModules`: named strategic-intent groups that activate under conditions, bind selectors, and contribute grouped score
- `pruningRules`: boolean filters that can drop bad candidates before scoring
- `considerations`: weighted score terms; use `scopes: [move]` for action-selection candidates and `scopes: [microturn]` for inner `chooseOne` / `chooseNStep` frontiers
- `tieBreakers`: deterministic tiebreak logic after weighted scoring
- `strategicConditions`: reusable boolean/proximity conditions
- `profiles`: seat- or variant-specific parameter and selection config
- `bindings`: seat-to-profile mapping

## Authoring a Strategic Module

Use a module when the profile needs to name and trace a strategic intent that would otherwise be scattered across several flat action-tag considerations. A module is still scoring data: it never generates actions, hides actions, or adds game-specific runtime logic.

Activation lives in `when` and should use reusable refs such as `condition.<id>.satisfied`, state features, candidate features, and selector refs. Keep the condition declarative and deterministic.

Selector bindings give the module named roles:

```yaml
selectors:
  - role: primaryTarget
    selectorId: arvnPoliticalTargetOpportunity
```

The role is author-facing trace vocabulary. The `selectorId` must resolve to a `selectors:` entry that already fits the module scope and cost class.

Score groups make the contribution explainable:

```yaml
scoreGroups:
  - id: targetQuality
    summary: sum
    terms:
      - weight: 325
        value: 1
  - id: standing
    summary: sum
    terms:
      - weight: 325
        value: 1
```

Use `summary: sum`, `product`, or `max` to describe how terms combine inside the group. Prefer a few meaningful groups over many tiny terms.

Fallbacks must be explicit:

```yaml
fallback:
  ifInactive: noContribution
  ifSelectorEmpty: noContribution
```

Use `ifInactive: noContribution` for ordinary inactive modules. Use `ifSelectorEmpty: demoteAndTrace` only when an empty selector is itself negative evidence and include `selectorEmptyPenalty`.

Profiles apply module score through an ordinary consideration, keeping dispatch and weighting visible:

```yaml
considerations:
  applyBuildPoliticalEngineModule:
    scopes: [move]
    weight: 1
    value:
      ref: module.buildPoliticalEngine.contribution
```

Worked FITL example:

```yaml
strategyModules:
  buildPoliticalEngine:
    traceLabel: "build political engine"
    when:
      and:
        - { ref: condition.selfPoliticalEngineBehind.satisfied }
        - not: { ref: condition.militaryBoardCollapsing.satisfied }
        - or:
            - gt:
                - { ref: feature.coinControlPop }
                - 20
            - gte:
                - { ref: feature.projectedSelfMargin }
                - -7
    applies:
      scopes: [move]
      actionTags: [train]
    priority:
      tier: 30
    selectors:
      - role: primaryTarget
        selectorId: arvnPoliticalTargetOpportunity
    scoreGroups:
      - id: targetQuality
        summary: sum
        terms:
          - weight: 325
            value: 1
      - id: standing
        summary: sum
        terms:
          - weight: 325
            value: 1
    guardrailIds: []
    fallback:
      ifInactive: noContribution
      ifSelectorEmpty: noContribution
```

## Authoring a Plan Template

Use `planTemplates` when a profile needs to describe an authored compound turn shape, such as a root action followed by a special activity and one or more role-bound target choices. A plan template is still declarative policy data: it does not create legal moves, and it does not add game-specific engine behavior. It names the action tags to recognize, the role selectors that rank candidate targets, the microturn steps that bind those roles, and the bounded caps that keep the plan finite.

The root can match action tags or action ids. Compound metadata describes optional special tags and their timing relative to the root. Each role references an existing `selectors:` entry; constraints can relate one role to another. Each step states the decision kind, target kind, decision path, and optional action tag or stage index that should receive the selected role value.

Worked FITL data example:

```yaml
planTemplates:
  arvn.trainGovern:
    traceLabel: "ARVN Train then Govern"
    root:
      actionTags: [train]
      compound:
        specialTags: [govern]
        timing: after
    roles:
      trainSpace:
        selector: arvn.trainSpaceForControlOrPacification
        required: true
      governSpace:
        selector: arvn.governPatronageSpace
        required: true
        constraints:
          - notEqual: role.trainSpace
    steps:
      - label: train-space
        role: trainSpace
        match:
          decisionKind: chooseNStep
          targetKind: zone
          decisionPath: targetSpaces
          actionTag: train
      - label: govern-space
        role: governSpace
        match:
          decisionKind: chooseNStep
          targetKind: zone
          decisionPath: targetSpaces
          actionTag: govern
    caps:
      capClass: standard256
      maxSteps: 2
    fallback:
      ifRoleTargetUnavailable: primitivePolicy
```

Profiles enable templates through `use.planTemplates`. Doctrine carriers, usually `use.strategyModules`, keep the strategic intent and selector vocabulary visible while the template captures the composed turn shape instead of re-encoding the same target sequence in several flat considerations. If the turn shape needs posture scoring, add `postureHook: <postureEvaluatorId>` and define the evaluator in `postureEvaluators`.

## Authoring a Posture Evaluator

Use `postureEvaluators` when a plan template needs a whole-turn posture check after roles and preview evidence are available. `must` clauses are hard posture requirements that demote or veto a plan when violated. `prefer` clauses add weighted posture score under an optional `when` condition.

Every `prefer` term must declare `fallback.contribution`. This is the Foundation 20 guardrail: unavailable, hidden, capped, stochastic, or otherwise non-ready preview signal must not be silently coerced into a numeric contribution.

Example:

```yaml
postureEvaluators:
  arvn.preserveAidAndMargin:
    traceLabel: "ARVN preserve Aid and projected margin"
    must:
      - id: aid-floor
        condition:
          gte:
            - { ref: preview.var.global.aid }
            - 15
        onViolation: demote
        demotePenalty: -1000
    prefer:
      - id: own-margin
        when:
          ref: condition.selfPoliticalEngineBehind.satisfied
        value:
          ref: preview.victory.currentMargin.self
        weight: 25
        fallback:
          contribution: 0
```

Attach it from a template:

```yaml
planTemplates:
  arvn.trainGovern:
    postureHook: arvn.preserveAidAndMargin
```

`postureEvaluators` are separate from preview budget configuration. The FITL `grantFlowContinuation` preview option can make post-grant or free-operation projection available to posture scoring, while `outcomeGrantContinuation` controls a different post-grant continuation surface. Do not use either preview option as a substitute for explicit posture `fallback.contribution`.

## Authoring Relationships

Use `relationships` to name generic standing between the active profile and another seat or standing role. Relationships are compiled into generic policy refs such as `relationship.nominalAlly.seat` and `relationship.nominalAlly.gainValue`; profile logic can then consume those refs without hardcoding faction-specific branches in the engine.

A relationship must declare exactly one binding target: either `seat` for a direct seat id, or `standingRole` for a generic standing selector. Current standing roles are `currentLeader`, `nearestThreat`, `closestAhead`, and `closestBehind`. Current relationship roles are `nominalAlly`, `sharedEnemy`, `rivalAlly`, `leader`, `nearWin`, `kingmakerRisk`, and `cooperativeUntilThreshold`.

Use `condition` to gate a relationship through an existing `strategicConditions:` id. Use `priority` to make same-role selection deterministic, and `gainValue` when downstream scoring needs a numeric relationship-strength signal.

Example:

```yaml
relationships:
  arvn.usNominalAlly:
    role: nominalAlly
    seat: us
    priority: 10
    gainValue:
      ref: victory.currentMargin.us
  arvn.usRivalWhenNearWin:
    role: kingmakerRisk
    seat: us
    condition: usNearWin
    priority: 20
    gainValue:
      ref: victory.currentMargin.us
  arvn.closestThreat:
    role: nearWin
    standingRole: closestAhead
    priority: 30
```

Prefer relationships when a profile needs ally/rival vocabulary that may flip with state. Keep the flip condition authored in `strategicConditions` and the effect in scoring data; do not add relationship-specific runtime logic.

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
| `candidate.params.<name>` | typed scalar parameter on the published action-selection candidate |

Use `candidate.params.<name>` only for same-action variants whose discriminating value is already published on the candidate, such as an event side or card id. It is action-selection scoped (`scopes: [move]`), state-local, and does not invoke preview.

Retired names remain retired:

- `decision.*` (singular) is invalid; policy profiles do not author decisions directly.
- `option.value` is invalid; use `microturn.option.value` at microturn scope.
- `candidate.param.<name>` (singular) is invalid; use `candidate.params.<name>` (plural) at action-selection scope.
- `microturn.option.*` is current for microturn option scoring.

### Preview Refs

Preview remains useful when it stays bounded. Action-selection candidates now use a bounded synthetic-completion driver by default, so `preview.*` refs project through same-seat inner microturns while the retired ref families above stay invalid.

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

**Per-seat preview refs**: `preview.victory.currentMargin.<seat>` and `preview.victory.currentRank.<seat>` accept any seat token, including opponents. By default (no `outcomeGrantContinuation` opt-in), opponent-margin refs may be uniform across candidates when the action's effects on opponent state live behind `outcomeGrantResolve` frames the bounded drive exits on. See the `outcomeGrantContinuation` opt-in below.

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

### `outcomeGrantContinuation` opt-in

Profiles that need opponent-effect visibility at action-selection scope can opt into a bounded post-grant drive continuation:

```yaml
preview:
  # ... existing fields ...
  outcomeGrantContinuation:
    enabled: true
    extraDepthCap: 4
    capClass: postGrant16
```

When enabled, the drive continues past the first `outcomeGrantResolve` frame up to `extraDepthCap` additional resolution steps. `capClass` is a named bounded-computation tier (Foundation 10); `postGrant16` is the current registered class with a depth budget of 4. The trace surfaces per-decision aggregate exit counts via `previewUsage.outcomeGrantContinuation.exitCounts`.

**Cost**: per-candidate preview cost grows with effect-chain complexity. Profile workloads with measurable wall-time regression should validate the budget on their target workload before enabling this broadly. The trace should show non-zero `previewUsage.outcomeGrantContinuation.exitCounts` before authors rely on post-grant opponent signal. Profiles without an opponent-aware authoring use case should not opt in.

**Partial coverage warning**: When `outcomeGrantContinuation` is opted in but a candidate's post-grant resolution exceeds `extraDepthCap`, the trace reports `previewDrive.kind = 'postGrantCap'` and the opponent-state-dependent preview refs may still be uniform or stale for that candidate. Treat `postGrantCap` as a Foundation 20 unavailable-status equivalent to `depthCap`; author considerations with explicit `previewFallback` when unavailable preview signal must not contribute.

## Action-Selection Candidate Parameter Refs

Use `candidate.params.<name>` when a move-scoped consideration needs to score same-action variants by a typed scalar already present on the published candidate. The read is state-local: it does not preview, it does not walk authoritative state, and it does not parse `candidate.stableMoveKey`.

Good uses:

- Score FITL `event` variants by `side`, where `side` is declared on the `event` action and published in the candidate params.
- Score pivotal events by `eventCardId`, where `pivotalEvent` declares the card id param.
- Give an explicitly declared optional-style param an `onMissing` constant for candidates that omit it.

Do not use `candidate.params.*` from `scopes: [microturn]`. Microturn option scoring uses `microturn.option.*`; state-keyed reads use `lookup`.

| What's being chosen | Ref family | Scope |
| --- | --- | --- |
| Action class | `candidate.tag.<actionId>`, `candidate.actionId` | move |
| Same-action variant by typed scalar param | `candidate.params.<name>` | move |
| Microturn option value | `microturn.option.value`, `microturn.option.tags`, `microturn.option.targetKind` | microturn |
| Projected scalar metric | `preview.victory.*`, `preview.feature.*`, `preview.var.*` | move, preview-derived |
| Projected keyed property | `lookup.surface: previewOptionState` | microturn, preview-derived |
| Current-state keyed property | `lookup.surface: policyState` | move or microturn, state-keyed |

### Required Param With Candidate Fallback

Use `candidateParamFallback` when a `candidate.params.*` ref can be unavailable. `noContribution` omits the term for candidates that do not carry the param or whose param type does not match the declaration.

```yaml
avoidShadedEvent:
  scopes: [move]
  appliesToActions: [event]
  weight: -800
  value:
    boolToNumber:
      eq:
        - { ref: candidate.params.side }
        - shaded
  candidateParamFallback:
    onUnavailable: noContribution
```

### Optional-Style Param With `onMissing`

Use a ref-local `onMissing` constant when the profile wants an omitted param to score as a normal value. This pattern is for an action surface that declares the param in the profile's target fixture or game data; do not use FITL `event.branch` as this example today, because `branch` is intentionally undeclared while branchless event moves remain legal.

```yaml
preferModeAOrAbsent:
  scopes: [move]
  weight: 200
  value:
    boolToNumber:
      eq:
        - ref:
            candidate.params.mode:
              onMissing:
                kind: constant
                value: __absent__
        - A
```

Because every `candidate.params.mode` read in this expression has an `onMissing` constant, no `candidateParamFallback` is required.

### Multi-Card Pivotal Preference

Use `appliesToActions` when a consideration is intentionally limited to an action that declares the param. This makes the declaration check stricter and keeps the profile from scoring unrelated candidates.

```yaml
preferSpecificPivotal:
  scopes: [move]
  appliesToActions: [pivotalEvent]
  weight: 500
  value:
    boolToNumber:
      in:
        - { ref: candidate.params.eventCardId }
        - [card-121, card-122]
  candidateParamFallback:
    onUnavailable: noContribution
```

### Mixed Candidate Param And Lookup Signal

When one expression mixes state sources, declare every fallback channel that can become unavailable. This example reads a candidate param and a current-state lookup, so it declares both `candidateParamFallback` and `lookupFallback`.

```yaml
preferUnshadedOnPopulatedBoard:
  scopes: [move]
  appliesToActions: [event]
  weight: 100
  value:
    add:
      - boolToNumber:
          eq:
            - { ref: candidate.params.side }
            - unshaded
      - lookup:
          surface: policyState
          collection: zones
          keyType: ZoneId
          key: board
          path: [properties, population]
          onMissing: unavailable
  candidateParamFallback:
    onUnavailable: noContribution
  lookupFallback:
    onUnavailable: noContribution
```

Fallback decision tree:

```text
Does any candidate.params.<name> ref in your value expression have onMissing: unavailable, which is the default?
  yes -> declare candidateParamFallback.onUnavailable.
  no, every ref has onMissing: { kind: constant } -> candidateParamFallback is not required for those refs.

Does the same value expression read preview-derived refs?
  yes -> also declare previewFallback.onUnavailable.

Does the same value expression read lookup.surface refs?
  yes -> also declare lookupFallback.onUnavailable for policyState lookups, or previewFallback.onUnavailable for previewOptionState lookups.
```

Diagnostic quick reference:

| Code | When it fires |
| --- | --- |
| `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN` | The param name is not in `candidateParamDefs`. |
| `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_SCOPE_INVALID` | `candidate.params.*` appears in a microturn-scope consideration. |
| `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN_ACTION` | `appliesToActions` names an action that does not exist. |
| `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_TYPE_INCONSISTENT` | The param was declared with inconsistent types across actions. |
| `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_ONMISSING_TYPE_MISMATCH` | The `onMissing` constant does not match the declared param type. |
| `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_REQUIRES_EXPLICIT_FALLBACK` | A default-unavailable `candidate.params.*` ref lacks `candidateParamFallback.onUnavailable`. |

Spec source: `archive/specs/166-candidate-parameter-refs.md`

## Phase And Schedule Refs

Use `phase.*` and `schedule.*` refs when a move- or microturn-scoped consideration needs state-local timing context. These refs read the current kernel schedule state; they do not run preview and they do not inspect hidden deck order unless the game data declares an observer policy.

| Ref | Meaning |
| --- | --- |
| `phase.current.id` | current phase id |
| `phase.next.id` | next phase id in the live phase sequence |
| `schedule.nextBoundary.id` | nearest declared phase boundary id |
| `schedule.distance.toBoundary.<boundaryId>.cards` | card count to the next matching card-draw boundary |
| `schedule.distance.toBoundary.<boundaryId>.microturns` | card distance multiplied by the boundary's `unitRates.microturns` |
| `schedule.distance.toBoundary.<boundaryId>.actions` | card distance multiplied by the boundary's `unitRates.actions` |
| `schedule.distance.toBoundary.<boundaryId>.turns` | card distance multiplied by the boundary's `unitRates.turns` |
| `schedule.distance.toBoundary.<boundaryId>.rounds` | card distance multiplied by the boundary's `unitRates.rounds` |

Use `schedule.distance.*.cards` for card-draw boundaries unless the boundary explicitly declares a unit rate for another unit. When the target deck is hidden and no observer policy is declared, the ref resolves unavailable with reason `hiddenDeck`; the profile must declare `scheduleFallback.onUnavailable`.

### Schedule Fallbacks

Declare the fallback path next to the consideration that reads the schedule ref:

```yaml
scheduleFallback:
  onUnavailable: noContribution
```

`onUnavailable` supports:

| Kind | Effect |
| --- | --- |
| `noContribution` | contribution is zero and the row records the fallback |
| `dropConsideration` | the consideration is removed from the scoring sum |
| `constant` | a declared integer is used as the value |

For a boundary that declares `observerPolicy.kind: topNVisible`, also declare an explicit partial fallback:

```yaml
scheduleFallback:
  onUnavailable: noContribution
  onPartial:
    visiblePrefixExhausted: useLowerBound
```

`onPartial.visiblePrefixExhausted` supports `useLowerBound`, `noContribution`, `dropConsideration`, and `constant`. Use `useLowerBound` only when a lower-bound distance is meaningful for the heuristic. This keeps partial visibility distinct from unavailable hidden information and makes the fallback visible in deterministic trace output.

### Visible Prefix Declaration

Use `phaseBoundaries[].schedule.observerPolicy.topNVisible` when a hidden deck has public face-up slots that expose the current or next cards in order:

```yaml
phaseBoundaries:
  - id: coupEntry
    kind: phaseEntry
    phaseId: coupVictory
    schedule:
      kind: cardDraw
      deckId: fitl-events-initial-card-pack
      cardSelector:
        tags: [coup]
      observerPolicy:
        kind: topNVisible
        visiblePrefix:
          sources:
            - id: played:none
              take: 1
            - id: lookahead:none
              take: 1
```

Each source contributes at most `take` cards from the top of its public zone to the composed visible sequence, in declaration order. The scan bound is `sum(take)`, which is known from the spec. Cards beyond a source's `take` remain public, but they are excluded by policy from this forward schedule horizon; they are not hidden information.

Each source `id` must name a public, deterministically ordered zone. Source ids must be distinct, and none may be the deck's hidden draw zone. Each source must declare `take` as a positive integer. A matching visible card resolves `ready`; an exhausted visible sequence resolves `partial.lowerBound`; a boundary without `observerPolicy` preserves the hidden-deck `unavailable` result.

### FITL Coup Timing Example

```yaml
preferGovernEarlyInCoupCycle:
  scopes: [move]
  costClass: state
  weight: 250
  when:
    ref: candidate.tag.govern
  value:
    ref: schedule.distance.toBoundary.coupEntry.cards
  scheduleFallback:
    onUnavailable: noContribution
    onPartial:
      visiblePrefixExhausted: useLowerBound
```

In Fire in the Lake, `played:none` is the public played pile and `lookahead:none` is the next visible card slot. With the `coupEntry` boundary's `sources` declaration, `played:none` uses `take: 1`, so only the current driving card is extracted from the played pile even when earlier discards remain beneath it. `lookahead:none` also uses `take: 1`, so the composed sequence is `[current card, next card]` regardless of discard depth.

If the current card is a coup card, the ref is ready with distance `0`. If the next card in `lookahead:none` is a coup card, the ref is ready with distance `1` rather than the spurious `partial.lowerBound: 2` produced by the retired aggregate scan. If neither visible card is a coup card, the ref returns `partial.lowerBound: 2`, and `useLowerBound` lets the heuristic score that bounded timing signal without peeking into the hidden deck.

Spec sources: `archive/specs/169-phase-boundary-and-schedule-refs.md`, `archive/specs/170-partial-visibility-observer-policy.md`, `archive/specs/171-visible-sequence-projection.md`

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

### `previewUsage.seatMatrix`

`previewUsage.seatMatrix` appears when a profile requests a preview-derived per-seat ref through `seatAgg`. It records each evaluated candidate's per-seat readiness for the requested standing ref:

```json
{
  "byCandidate": {
    "<stableMoveKey>": {
      "perSeatRefs": {
        "victoryCurrentMargin.currentMargin.$seat": {
          "nva": { "status": "ready", "value": -12 },
          "vc": { "status": "depthCap" }
        }
      }
    }
  }
}
```

Use this matrix when authoring opponent-standing considerations. It distinguishes a real ready value from hidden, stochastic, unresolved, failed, gated, capped, or partial signal. A ready row with the same value for every candidate is a low-information signal; a non-ready row must be paired with an explicit fallback before it can affect scoring.

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

### Static State Lookups at chooseN Frontiers

Use `lookup` when a microturn-scoped consideration needs to read a property from the current observer-projected state by key. Use `preview.option.*` when the consideration needs a projected value after the option is applied. Lookups are static, O(1), and bounded by a map probe plus a path walk; preview refs run the bounded inner-preview driver and are capped by `INNER_PREVIEW_HARD_CAP`.

`lookup` supports four collections:

| Collection | Key type | Visibility source |
| --- | --- | --- |
| `zones` | `ZoneId` | Zone observer projection. |
| `tokens` | `TokenId` | Token visibility inherited through the containing zone projection. |
| `players` | `PlayerId` | Per-player observer projection. |
| `globals` | `string` | Global surface visibility. |

Every consideration whose `value` is a lookup must declare `lookupFallback.onUnavailable`. Use `noContribution` when an unavailable lookup should omit the term from `scoreContributions[]`; use `{ constant: <integer> }` only when the profile intentionally converts unavailable state into an explicit contribution. Hidden state always resolves as `unavailable`; profiles cannot author an `onHidden` override. This keeps lookup refs aligned with Foundation 4 and Foundation 20.

For a target-selection `chooseNStep`, read the current ADD option with `microturn.option.value` and use it as the lookup key. This example scores zone-target options by visible population:

```yaml
preferHighPopulationTarget:
  scopes: [microturn]
  costClass: state
  weight: 50
  value:
    lookup:
      surface: policyState
      collection: zones
      keyType: ZoneId
      key:
        ref: microturn.option.value
      path: [properties, population]
      onMissing: unavailable
  lookupFallback:
    onUnavailable: noContribution
```

Use verbose trace output to confirm the scoring path. Ready lookups appear as normal `scoreContributions[]` entries. Unavailable lookups appear in `unknownLookupRefs`; explicit fallback use appears in `lookupFallbackFired`. The canonical architecture fixture `canonicalCookbookProfile()` in `packages/engine/test/architecture/lookup-refs/lookup-refs-fixture.ts` exercises `zones`, `tokens`, `players`, and `globals` in one profile.

### Projected-State Lookups at chooseN Frontiers

Use `lookup.surface: previewOptionState` when a microturn-scoped consideration needs to score a published option by a keyed property in that option's bounded synthetic-completion endpoint. This closes the authoring gap between current-state keyed lookups and scalar projected refs: the key still comes from the current option, usually `microturn.option.value`, but the path is walked against the option's projected `DriveResult.state`.

Choose the scoring surface by the authoring goal:

| Authoring goal | Choose |
| --- | --- |
| Score by a current-state per-object property. | `lookup.surface: policyState` |
| Score by the projected per-object property at the synthetic-completion endpoint. | `lookup.surface: previewOptionState` |
| Score by a scalar projected-state property such as margin delta, victory rank, or drive depth. | `preview.option.*` |
| Score by the change in a per-object property. | Compose `lookup.previewOptionState.<path>` minus `lookup.policyState.<path>` with `sub`. |

Projected lookups are preview-derived. A consideration whose value contains only `previewOptionState` lookups must declare `previewFallback.onUnavailable`, not `lookupFallback`. A mixed expression that reads both `previewOptionState` and `policyState` lookups must declare both fallback blocks because either state source can be unavailable.

```yaml
preferProjectedTroopBuildup:
  scopes: [microturn]
  costClass: preview
  weight: 100
  value:
    lookup:
      surface: previewOptionState
      collection: zones
      keyType: ZoneId
      key:
        ref: microturn.option.value
      path: [variables, arvnTroopCount]
      onMissing: unavailable
  previewFallback:
    onUnavailable: noContribution
```

Use composition when the useful signal is the projected delta, not the projected endpoint value alone:

```yaml
preferProjectedTroopDelta:
  scopes: [microturn]
  costClass: preview
  weight: 50
  value:
    op: sub
    args:
      - lookup:
          surface: previewOptionState
          collection: zones
          keyType: ZoneId
          key:
            ref: microturn.option.value
          path: [variables, arvnTroopCount]
          onMissing: unavailable
      - lookup:
          surface: policyState
          collection: zones
          keyType: ZoneId
          key:
            ref: microturn.option.value
          path: [variables, arvnTroopCount]
          onMissing: unavailable
  previewFallback:
    onUnavailable: noContribution
  lookupFallback:
    onUnavailable: noContribution
```

`onMissing` and `onHidden` keep the same semantics as current-state lookups. Missing paths follow `onMissing`; hidden paths always return `unavailable`, and `onHidden` cannot be overridden. For stable projected lookup signals, initialize zone, token, player, and global variables to explicit defaults in GameSpecDoc when a profile plans to read them; an absent projected path is legal but fallback-heavy.

Projected lookups participate in continued deepening with the existing triggers. `allRequestedRefsDepthCapped` treats projected lookup refs as preview-derived refs, and `allReadyValuesUniform` evaluates the final numeric contribution after the expression has consumed the lookup value. See Spec 165 §4.1, §4.5, §4.6, and §4.8, and Spec 164's cap-class guidance for bounded deepening.

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

### Continued Deepening

Use `preview.inner.strategy: continuedDeepening` when a broad `chooseNStep`
preview proves that every requested `preview.option.*` ref is depth-capped, or
when all ready values are uniform and a deeper bounded pass may differentiate
the options. This is an opt-in profile setting. It does not change defaults for
profiles that keep the `singlePass` strategy.

```yaml
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
    strategy: continuedDeepening
    capClass: deep1024
    continuedDeepening:
      broad:
        depthCap: 4
      deep:
        depthCap: 16
        trigger:
          - allRequestedRefsDepthCapped
        rootPolicy: allRootsWithinCap
```

Fields:

| Field | Meaning |
| --- | --- |
| `strategy` | `singlePass` keeps the existing one-pass driver. `continuedDeepening` runs a broad pass and conditionally runs an additive deep pass. Defaults to `singlePass`. |
| `capClass` | Named budget tier. Use the cap-class registry in `CAP_CLASS_BUDGETS` rather than duplicating budget literals in profile prose or tooling. Defaults to `standard256`. |
| `continuedDeepening.broad.depthCap` | Broad-pass depth. It must equal the legacy `depthCap` field when `strategy: continuedDeepening` is used. |
| `continuedDeepening.deep.depthCap` | Absolute deep-pass target depth. It must be greater than or equal to the broad depth and fit the selected cap class. |
| `continuedDeepening.deep.trigger` | Non-empty list of deterministic trigger ids. Supported values are `allRequestedRefsDepthCapped` and `allReadyValuesUniform`. |
| `continuedDeepening.deep.rootPolicy` | Currently `allRootsWithinCap`, meaning every root option is eligible for the deep pass within the declared cap class. |

The static cost formula is:

```text
M = maxOptions
B = chooseNBeamWidth
I = maxOptions
Db = continuedDeepening.broad.depthCap
Dd = continuedDeepening.deep.depthCap
R = M

broadCost = M * (1 + B * I * max(0, Db - 1))
incrementalDeepCost = R * B * I * max(0, Dd - Db)
totalCost = broadCost + incrementalDeepCost
```

For the Spec 164 ARVN target row, `M=8`, `B=1`, `Db=4`, and `Dd=16`.
That gives `broadCost = 200`, `incrementalDeepCost = 768`, and
`totalCost = 968`, which fits the `deep1024` cap class. The actual budget
limits are owned by the `CAP_CLASS_BUDGETS` registry in
`packages/engine/src/cnl/compile-agents.ts`.

Triggers are evaluated after the broad pass:

| Trigger | Fires when | Meaning |
| --- | --- | --- |
| `allRequestedRefsDepthCapped` | Every requested `preview.option.*` ref across the broad-driven roots is unavailable because of `depthCap`. | The broad pass proved there is no usable signal at the current depth, so a deeper pass may recover ready values. |
| `allReadyValuesUniform` | Every requested ref is ready, but the ready values are identical across roots. | The broad pass produced signal but not differentiation, so a deeper pass may break the tie. |

Use continued deepening for deeply nested `chooseNStep` ladders where the broad
pass reaches `depthCap` before projected refs can resolve. Do not use it for a
top-level `chooseOne` or shallow `chooseNStep` profile that already produces
differentiating ready signal under the broad pass.

Continued deepening preserves Foundation 20. It is additive signal, not a way
to silence unavailability. A ref that remains unavailable after the deep pass
is still unavailable, still needs an explicit `previewFallback`, and still
appears in trace output as unavailable rather than contributing an implicit
zero. When the deep pass recovers ready values, traces expose the phase
provenance through `previewUsage.coverage.broad` and
`previewUsage.coverage.deep`.

### Preview Signal Integrity

Every consideration whose `value` reads a `preview.option.*` ref, or a preview-derived `seatAgg` with `availability: requireAllReady`, `requireAnyReady`, or `selfAndTargetReady`, must declare `previewFallback.onUnavailable`.

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

For outer-preview standing refs, choose the `seatAgg.availability` mode deliberately:

| Mode | Use when | Fallback posture |
| --- | --- | --- |
| `requireAllReady` | Every selected seat must be ready for the aggregate to contribute. | Declare `previewFallback.onUnavailable`. |
| `requireAnyReady` | Partial ready cells are useful, but skipped seats must remain visible in trace. | Declare `previewFallback.onUnavailable`. |
| `selfAndTargetReady` | A role-selected opponent standing value is meaningful only when both self and the target role resolve. | Declare `previewFallback.onUnavailable`. |
| `skipUnavailable` | Legacy partial-ready behavior is intentional. | No implicit silent zero for all-unavailable preview rows; prefer explicit modes for new authoring. |

Named standing roles are resolved from the game's terminal ranking, not from game-specific engine code:

```yaml
hurtCurrentLeader:
  scopes: [move]
  weight: 200
  value:
    neg:
      seatAgg:
        over: { role: currentLeader }
        expr: { ref: preview.victory.currentMargin.$seat }
        aggOp: sum
        availability: selfAndTargetReady
  previewFallback:
    onUnavailable: noContribution
```

Use `currentLeader` when the policy should react to the best-standing seat, and `nearestThreat` when it should react to the best-standing opponent after excluding self. The same role names are valid in direct refs such as `victory.currentMargin.role:nearestThreat` and in `seatAgg.over: { role: nearestThreat }`.

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

### Selectors

Selectors are the first-class ranking layer introduced by Spec 181. They live
under `agents.library.selectors` and rank a finite source such as zones,
tokens, cards, players, microturn options, candidate params, or a bounded
product. Use selectors when a profile is really ranking a set and a scalar
consideration would hide that ranking inside one utility term.

The first production migration is ARVN's microturn target-option margin term in
`data/games/fire-in-the-lake/92-agents.md`. Before Spec 181, the consideration
scored each published microturn option directly:

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

After the migration, the preview-derived scalar is a named selector component
over the published microturn option frontier. The consideration consumes the
current option's selector quality:

```yaml
agents:
  library:
    selectors:
      arvnMicroturnOptionProjectedMargin:
        scopes: [microturn]
        source:
          kind: microturnOptions
        quality:
          components:
            - id: projectedSelfMargin
              value:
                ref: preview.option.delta.victory.currentMargin.self
              weight: 1
              previewFallback:
                onUnavailable: noContribution
          order: qualityDesc
        result:
          maxItems: 8
          order: [qualityDesc, stableKeyAsc]
          onEmpty: noContribution

    considerations:
      preferOptionProjectedMargin:
        scopes: [microturn]
        costClass: preview
        weight: 300
        value:
          ref: selector.arvnMicroturnOptionProjectedMargin.current.quality
```

Selector result bounds are mandatory (`maxItems`, and `maxPairs` for product
sources), and deterministic result ordering must include a stable-key
tiebreaker. Components that read preview-derived refs must declare an explicit
`previewFallback`. Use `selector.<id>.current.quality` when a microturn
consideration is scoring the currently published option; use `selected.*` refs
when the policy needs the selector's top-ranked result as a separate fact.

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
