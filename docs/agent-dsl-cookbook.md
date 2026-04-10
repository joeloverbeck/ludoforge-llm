# Agent Policy DSL Cookbook

Quick reference for writing PolicyAgent profiles in GameSpecDoc YAML. All examples are drawn from production FITL and Texas Hold'em game specs.

## Architecture

```
agents:
  parameters:           # tunable knobs (shared across profiles)
  library:
    stateFeatures:        # game-state variables evaluated once per decision
    candidateFeatures:    # per-candidate variables (may use preview)
    candidateAggregates:  # cross-candidate aggregations (any, all, count, rank)
    pruningRules:         # eliminate bad candidates before scoring
    considerations:       # score terms (move or completion scope)
    tieBreakers:          # break ties after scoring
    strategicConditions:  # boolean conditions with proximity metrics
  profiles:             # per-seat configurations referencing library items
  bindings:             # seat → profile mapping
```

The library defines reusable building blocks. Profiles select which blocks to use and override parameter values. Bindings map game seats to profiles.

## Reference Paths

### State References (`ref:`)

| Path | Returns | Example |
|------|---------|---------|
| `victory.currentMargin.self` | number | own distance from victory threshold |
| `victory.currentMargin.active` | number | active player's margin |
| `victory.currentMargin.<seatName>` | number | specific seat's margin by name (e.g., `victory.currentMargin.us`) |
| `victory.currentRank.self` | number | own current ranking position (1 = winning) |
| `victory.currentRank.active` | number | active player's ranking |
| `victory.currentRank.<seatName>` | number | specific seat's ranking by name |
| `var.global.<id>` | number | global game variable |
| `globalMarker.<id>` | string | current state of a global marker lattice (e.g., `"shaded"`, `"inactive"`) |
| `var.player.self.<id>` | number | own per-player variable (e.g., resources) |
| `var.player.active.<id>` | number | active player's variable |
| `var.seat.<seatName>.<id>` | number | specific seat's variable by seat name (e.g., `var.seat.us.resources`) |
| `metric.<id>` | number | derived metric defined in observability |
| `turn.round` | number | current turn/round count |
| `turn.phaseId` | string | current game phase ID |
| `turn.stepId` | string | step within the current phase |
| `seat.self` | string | own seat ID |
| `seat.active` | string | active player's seat ID |
| `context.kind` | string | `'move'` or `'completion'` — which evaluation scope is active |
| `feature.<id>` | varies | evaluated state feature from library (must be declared in `stateFeatures`) |
| `aggregate.<id>` | varies | evaluated candidate aggregate from library (must be declared in `candidateAggregates`) |
| `condition.<id>.satisfied` | boolean | whether a strategic condition is currently met |
| `condition.<id>.proximity` | number | how close a strategic condition is to being satisfied (0-1) |

### Active Card References

| Path | Returns | Example |
|------|---------|---------|
| `activeCard.id` | string | ID of the currently active event card |
| `activeCard.deckId` | string | which deck the card came from |
| `activeCard.hasTag.<tag>` | boolean | whether the card has a specific tag (e.g., `capability`) |
| `activeCard.metadata.<key>` | varies | card metadata (e.g., `period`, `seatOrder`) |
| `activeCard.annotation.<side>.<metric>` | number | card annotation by side (`shaded`/`unshaded`) and metric name |
| `activeCard.annotation.<side>.<metric>.<seat>` | number | per-seat card annotation |

These are publicly visible (per observability config). Use in state features or `when` clauses to make event card decisions based on card properties.

**Important**: `feature.*` and `aggregate.*` refs resolve to library-declared items. You must define a `stateFeature` or `candidateAggregate` in the library before referencing it. Using `feature.unknownId` without a declaration will cause a compilation error.

### Candidate References

| Path | Returns | Example |
|------|---------|---------|
| `candidate.actionId` | string | action ID of the move |
| `candidate.tag.<name>` | boolean | whether action has a specific tag |
| `candidate.tags` | idList | all tags on the action (use with `in` operator) |
| `candidate.param.<name>` | varies | resolved move parameter value |
| `candidate.paramCount` | number | count of resolved parameters |
| `candidate.stableMoveKey` | string | deterministic move identity |

### Preview References

| Path | Returns | Notes |
|------|---------|-------|
| `preview.victory.currentMargin.self` | number | projected own margin AFTER this move |
| `preview.victory.currentMargin.<seatName>` | number | projected opponent margin AFTER this move (e.g., `preview.victory.currentMargin.us`) |
| `preview.victory.currentRank.self` | number | projected own ranking AFTER this move (1 = winning) |
| `preview.victory.currentRank.<seatName>` | number | projected opponent ranking AFTER this move |
| `preview.var.player.self.<id>` | number | projected variable after move |
| `preview.var.global.<id>` | number | projected global variable after move |
| `preview.var.seat.<seatName>.<id>` | number | projected seat variable after move |
| `preview.globalMarker.<id>` | string | projected global marker state after move |
| `preview.metric.<id>` | number | projected derived metric after move |
| `preview.feature.<id>` | varies | authored state feature evaluated on the preview state |

Preview refs require `preview.mode: tolerateStochastic` (or `exactWorld`) on the profile. They evaluate the game state after applying the candidate move. If preview can't evaluate (stochastic outcome, template move), falls back to `undefined` — always wrap in `coalesce`.

`preview.feature.*` reuses the authored `stateFeatures` library. There is no separate preview-feature namespace to declare. One feature definition can be read in two contexts:
- `feature.<id>` for the current state
- `preview.feature.<id>` for the post-move preview state

Pattern:

```yaml
candidateFeatures:
  projectedVcGuerrillaCount:
    type: number
    expr:
      coalesce:
        - { ref: preview.feature.vcGuerrillaCount }
        - { ref: feature.vcGuerrillaCount }
```

### Completion References (inside `scopes: [completion]`)

| Path | Returns |
|------|---------|
| `decision.type` | `'chooseOne'` or `'chooseN'` |
| `decision.name` | decision bind name (e.g., `$targetSpaces`) |
| `decision.targetKind` | `'zone'`, `'token'`, etc. |
| `decision.optionCount` | number of options available |
| `option.value` | the current option being scored |

## Parameters

Define tunable knobs in the `parameters:` section. Profiles override with `params:`.

**Parameter types**: `number` (float), `integer`, `boolean`, `enum` (string from a fixed set), `idOrder` (ordered list of IDs).

```yaml
parameters:
  rallyWeight:
    type: number
    default: 1
    min: 0
    max: 10
    tunable: true
```

Reference in a consideration: `weight: { param: rallyWeight }`

## State Features

Evaluated once per decision point. Cached. Appear in agent decision traces via `stateFeatures` field.

```yaml
stateFeatures:
  # Simple reference
  selfMargin:
    type: number
    expr:
      ref: victory.currentMargin.self

  # Arithmetic
  callAmount:
    type: number
    expr:
      max:
        - 0
        - sub:
            - { ref: var.global.currentBet }
            - { ref: var.player.self.streetBet }

  # Boolean condition
  facingBet:
    type: boolean
    expr:
      gt:
        - { ref: feature.callAmount }
        - 0
```

### Counting Tokens with `globalTokenAgg`

Count tokens across all zones matching filters. Supports owner filtering via token `props`.

```yaml
stateFeatures:
  # Count VC guerrillas on the board
  vcGuerrillaCount:
    type: number
    expr:
      globalTokenAgg:
        aggOp: count
        tokenFilter:
          props:
            faction: { eq: VC }
            type: { eq: guerrilla }

  # Count VC bases
  vcBaseCount:
    type: number
    expr:
      globalTokenAgg:
        aggOp: count
        tokenFilter:
          props:
            faction: { eq: VC }
            type: { eq: base }

  # Count US troops (opponent forces)
  usTroopCount:
    type: number
    expr:
      globalTokenAgg:
        aggOp: count
        tokenFilter:
          props:
            faction: { eq: US }
            type: { eq: troops }

  # Count ALL own tokens (use 'self' keyword for owner)
  selfTokenCount:
    type: number
    expr:
      globalTokenAgg:
        aggOp: count
        tokenFilter:
          props:
            faction: { eq: self }
```

**Token filter `props` values:** literal strings match exactly. The keywords `self` and `active` resolve to the current/active player's ID at runtime.

**Aggregation ops:** `count` (count matching tokens), `sum` (sum a prop value), `min`, `max`.

**`prop` field** (required for `sum`/`min`/`max`): Specifies which numeric token property to aggregate. Not needed for `count`.

```yaml
stateFeatures:
  # Sum troop strength across all zones
  totalTroopStrength:
    type: number
    expr:
      globalTokenAgg:
        aggOp: sum
        prop: strength
        tokenFilter:
          props:
            faction: { eq: self }
            type: { eq: troops }
```

**Field name note:** `globalTokenAgg` and `globalZoneAgg` use `aggOp:` for the operation field. `zoneTokenAgg` uses `op:`. This is an inconsistency in the DSL — use the correct field name for each operator.

**Zone scope** (optional): `board` (default, play area only), `aux` (off-board), `all` (everything).

**Zone filter** (optional): Restrict which zones are included in the aggregation. Same shape as `globalZoneAgg.zoneFilter` — supports `category`, `attribute`, and `variable` sub-filters. Can be combined with `tokenFilter`.

```yaml
stateFeatures:
  # Count VC guerrillas in province zones only
  vcGuerrillasInProvinces:
    type: number
    expr:
      globalTokenAgg:
        aggOp: count
        tokenFilter:
          props:
            faction: { eq: VC }
            type: { eq: guerrilla }
        zoneFilter:
          category: province
```

### Counting Zones with `globalZoneAgg`

```yaml
stateFeatures:
  # Count zones where opposition > 0 (using zone variables)
  oppositionZoneCount:
    type: number
    expr:
      globalZoneAgg:
        field: opposition
        source: variable
        aggOp: count
        zoneFilter:
          variable:
            opposition: { gt: 0 }

  # Sum population across all province zones
  totalPopulation:
    type: number
    expr:
      globalZoneAgg:
        field: population
        source: attribute
        aggOp: sum
        zoneFilter:
          category: province
```

**Zone filter options:**
- `category: <string>` — zone category (e.g., province, city, loc)
- `attribute: { <name>: { <op>: <value> } }` — static zone attribute
- `variable: { <name>: { <op>: <value> } }` — dynamic zone variable

**Zone filter comparison operators (`<op>`):** `eq`, `gt`, `gte`, `lt`, `lte`.

**Zone scope** (optional): `board` (default), `aux`, `all` — same as `globalTokenAgg`.

### Zone Property Access with `zoneProp`

Read a zone's attribute, variable, or built-in property.

```yaml
candidateFeatures:
  targetSpacePopulation:
    type: number
    expr:
      coalesce:
        - zoneProp:
            zone: { ref: candidate.param.targetSpace }
            prop: population
        - 0
```

**Fields**: `zone` (zone ID string or expression), `prop` (property name).

**Built-in props**: `id` (returns the zone's ID string), `category` (returns the zone's category string, e.g., `province`, `city`, `loc`). All other prop names resolve against the zone's `attributes` map.

### Per-Zone Token Counts with `zoneTokenAgg`

```yaml
stateFeatures:
  # Max card rank in own hand
  handHighCard:
    type: number
    expr:
      zoneTokenAgg:
        zone: hand
        owner: self
        prop: rank
        op: max
```

**Owner values:** `self`, `active`, `none`, or numeric player ID (e.g., `"0"`).

**Note**: `zoneTokenAgg` does NOT support `tokenFilter`. To count specific token types in a zone, use `globalTokenAgg` with a `zoneFilter` targeting the zone category, or use the `prop` field to aggregate a specific token property.

### Adjacent Zone Token Counts with `adjacentTokenAgg`

Count tokens in zones adjacent to an anchor zone.

```yaml
stateFeatures:
  enemyTroopsNearCapital:
    type: number
    expr:
      adjacentTokenAgg:
        anchorZone: saigon:none
        aggOp: count
        tokenFilter:
          props:
            faction: { eq: US }
            type: { eq: troops }
```

Use a dynamic zone expression when the anchor should vary per candidate.

```yaml
candidateFeatures:
  enemyTroopsNearTarget:
    type: number
    expr:
      adjacentTokenAgg:
        anchorZone: { ref: candidate.param.targetSpace }
        aggOp: count
        tokenFilter:
          props:
            faction: { eq: US }
            type: { eq: troops }
```

**Required**: `anchorZone` (zone ID or expression). **Optional**: `tokenFilter`, `prop` (required when aggOp != count).

### Aggregation Across Seats with `seatAgg`

Aggregate a numeric expression across game seats. Uses the `$seat` placeholder inside `expr` to reference each seat being iterated.

```yaml
stateFeatures:
  # Maximum opponent margin (how close is the nearest opponent to winning?)
  maxOpponentMargin:
    type: number
    expr:
      seatAgg:
        over: opponents
        expr: { ref: victory.currentMargin.$seat }
        aggOp: max

  # Sum margins of specific seats
  usNvaMarginSum:
    type: number
    expr:
      seatAgg:
        over: [us, nva]
        expr: { ref: victory.currentMargin.$seat }
        aggOp: sum

  # Count of opponents (useful for normalization)
  opponentCount:
    type: number
    expr:
      seatAgg:
        over: opponents
        expr: 1
        aggOp: count
```

**Required fields**: `over`, `expr`, `aggOp`.

**`over` values**: `opponents` (all seats except self), `all` (every seat), or an explicit array of canonical seat IDs (e.g., `[us, nva]`).

**`aggOp` values**: `sum`, `count`, `min`, `max` (same as zone token agg ops).

**`$seat` placeholder**: Only valid inside `seatAgg.expr`. Resolves to each seat ID during iteration. Using `$seat` outside of `seatAgg` causes a compilation error.

### Strategic Conditions

The `strategicConditions` library bucket defines boolean conditions with a proximity metric. Reference via `condition.<id>.satisfied` (boolean) and `condition.<id>.proximity` (0-1 number).

```yaml
strategicConditions:
  nearVictory:
    target:
      gte:
        - { ref: victory.currentMargin.self }
        - -3
```

Use in `when` clauses: `when: { ref: condition.nearVictory.satisfied }`.

**Proximity metric** (optional): Add a `proximity` sub-object to measure how close the condition is to being satisfied. The result is `current / threshold`, clamped to 0-1.

```yaml
strategicConditions:
  nearVictory:
    target:
      gte:
        - { ref: victory.currentMargin.self }
        - -3
    proximity:
      current: { ref: victory.currentMargin.self }
      threshold: -3
```

Reference via `condition.nearVictory.proximity` (returns 0-1 number). If no `proximity` is defined, referencing `.proximity` causes a compilation error.

## Candidate Features

Evaluated per candidate move. Use for preview-based or parameter-based scoring.

```yaml
candidateFeatures:
  # Projected margin (with fallback when preview unavailable)
  projectedSelfMargin:
    type: number
    expr:
      coalesce:
        - { ref: preview.victory.currentMargin.self }
        - { ref: feature.selfMargin }

  # Zone population of target parameter
  targetSpacePopulation:
    type: number
    expr:
      coalesce:
        - zoneProp:
            zone: { ref: candidate.param.targetSpace }
            prop: population
        - 0
```

Always wrap `preview.*` and `candidate.param.*` refs in `coalesce` — they may be `undefined` for some candidates.

## Candidate Aggregates

Aggregations across all candidates at a decision point. Used in pruning rules and `when` clauses. Reference via `aggregate.<id>`.

**Aggregate ops**: `any` (boolean OR), `all` (boolean AND), `count`, `min`, `max`, `rankDense` (dense ranking), `rankOrdinal` (ordinal ranking).

**Optional `where` clause**: A boolean predicate that filters which candidates are included in the aggregation. Only candidates where `where` evaluates to `true` are counted/ranked/aggregated.

```yaml
candidateAggregates:
  hasNonPassAlternative:
    op: any
    of:
      not:
        ref: candidate.tag.pass

  # Count how many candidates are rally actions
  rallyOptionCount:
    op: count
    of:
      boolToNumber:
        ref: candidate.tag.rally

  # Best margin among non-pass candidates only
  bestNonPassMargin:
    op: max
    of: { ref: feature.projectedSelfMargin }
    where:
      not: { ref: candidate.tag.pass }
```

## Pruning Rules

Eliminate candidates before scoring. Essential: `dropPassWhenOtherMovesExist` prevents infinite pass loops.

```yaml
pruningRules:
  dropPassWhenOtherMovesExist:
    when:
      and:
        - { ref: candidate.tag.pass }
        - { ref: aggregate.hasNonPassAlternative }
    onEmpty: skipRule
```

`onEmpty: skipRule` — if pruning would remove ALL candidates, skip the rule instead of erroring.

**WARNING:** Never remove `dropPassWhenOtherMovesExist`. Without it, pass ties with unscored actions, `stableMoveKey` picks pass alphabetically, and all players pass forever.

## Considerations (Score Terms)

The core scoring mechanism. Each consideration adds `weight * value` to a candidate's score.

### Move-Scoped (action type selection)

```yaml
considerations:
  # Parameterized weight × feature value
  preferProjectedSelfMargin:
    scopes: [move]
    weight:
      param: projectedMarginWeight
    value:
      ref: feature.projectedSelfMargin

  # Fixed weight × boolean tag
  preferRallyAction:
    scopes: [move]
    weight: 3
    value:
      boolToNumber:
        ref: candidate.tag.rally

  # Heavy penalty
  avoidFold:
    scopes: [move]
    weight: -100
    value:
      boolToNumber:
        ref: candidate.tag.fold

  # Conditional scoring with 'when' clause
  rallyWhenBehind:
    scopes: [move]
    when:
      lt:
        - { ref: feature.selfMargin }
        - 0
    weight: 20
    value:
      boolToNumber:
        ref: candidate.tag.rally

  # Complex boolean condition
  foldWhenBadPotOdds:
    scopes: [move]
    weight: 200
    value:
      boolToNumber:
        and:
          - { ref: candidate.tag.fold }
          - { ref: feature.facingBet }
          - not: { ref: feature.potOddsFavorable }

  # Action-specific scoring (restrict by actionId)
  preferCheapAgitateTargets:
    scopes: [move]
    when:
      eq:
        - { ref: candidate.actionId }
        - coupAgitateVC
    weight: -2
    value:
      ref: feature.targetSpacePopulation
```

### Completion-Scoped (within-action target selection)

Scores individual choices within a multi-step action (e.g., which zone to rally in).

```yaml
considerations:
  preferPopulousTargets:
    scopes: [completion]
    when:
      and:
        - eq:
            - { ref: decision.type }
            - chooseN
        - eq:
            - { ref: decision.name }
            - "$targetSpaces"
        - eq:
            - { ref: decision.targetKind }
            - zone
    weight: 2
    value:
      coalesce:
        - zoneProp:
            zone: { ref: option.value }
            prop: population
        - 0
```

The `when` clause restricts which decision types this applies to. Without it, the term fires for ALL completion decisions.

### Consideration-Level `unknownAs` and `clamp`

**`unknownAs`** (number, default 0): Fallback contribution when `weight` or `value` evaluate to non-number (e.g., preview ref returns `undefined`). Prevents NaN cascades without requiring `coalesce` wrappers.

**`clamp`** (`{ min?, max? }`): Bounds the `weight * value` contribution. Different from the `clamp` expression operator — this clamps the final contribution after multiplication.

```yaml
considerations:
  preferProjectedMarginSafe:
    scopes: [move]
    weight: 5
    value:
      ref: feature.projectedSelfMargin
    unknownAs: 0          # if preview fails, contribute 0 instead of NaN
    clamp:
      min: -10            # cap downside contribution
      max: 10             # cap upside contribution
```

## Tie Breakers

Applied after scoring when candidates tie. Evaluated in order; first to break tie wins.

**Tie-breaker kinds**: `lowerExpr` (lower value wins), `higherExpr` (higher value wins), `preferredEnumOrder` (ranked by enum value list), `preferredIdOrder` (ranked by ID list), `rng` (random), `stableMoveKey` (deterministic lexicographic order).

```yaml
tieBreakers:
  # Lower expression value wins
  preferCheapTargetSpaces:
    kind: lowerExpr
    value:
      ref: feature.targetSpacePopulation

  # Higher expression value wins
  preferHighPopulation:
    kind: higherExpr
    value:
      ref: feature.targetSpacePopulation

  # Random tiebreaker (non-deterministic — use with caution)
  randomize:
    kind: rng

  # Deterministic lexicographic order (always last)
  stableMoveKey:
    kind: stableMoveKey
```

## Profiles

Select library items and override parameters per seat.

```yaml
profiles:
  vc-evolved:
    observer: currentPlayer
    preview:
      mode: tolerateStochastic    # enable projected-state preview
    params:
      projectedMarginWeight: 5
      rallyWeight: 3
    use:
      pruningRules:
        - dropPassWhenOtherMovesExist
      considerations:
        - preferProjectedSelfMargin
        - preferRallyWeighted
        - preferPopulousTargets
      tieBreakers:
        - preferCheapTargetSpaces
        - stableMoveKey

  # Stochastic selection (poker)
  poker-baseline:
    selection:
      mode: softmaxSample
      temperature: 0.5
    preview:
      mode: disabled
    use:
      considerations:
        - avoidFold
        - preferCall
      tieBreakers:
        - stableMoveKey
```

**Preview modes:** `disabled` (no preview), `tolerateStochastic` (evaluate even with randomness), `exactWorld` (only deterministic outcomes).

**Selection modes:** `argmax` (default — highest score wins), `softmaxSample` (probabilistic selection with temperature), `weightedSample` (sample proportional to scores).

## Expression Operators Reference

| Operator | Syntax | Returns | Notes |
|----------|--------|---------|-------|
| `ref` | `{ ref: path }` | varies | reference a state/feature/candidate value |
| `const` | `{ const: 5 }` | literal | constant value |
| `param` | `{ param: name }` | number | profile parameter |
| `add` | `add: [a, b, ...]` | number | sum of 2+ operands |
| `sub` | `sub: [a, b]` | number | a - b (exactly 2) |
| `mul` | `mul: [a, b, ...]` | number | product of 2+ operands |
| `div` | `div: [a, b]` | number | a / b (float division, exactly 2) |
| `neg` | `neg: expr` | number | -expr |
| `abs` | `abs: expr` | number | \|expr\| |
| `min` | `min: [a, b, ...]` | number | min of 2+ operands |
| `max` | `max: [a, b, ...]` | number | max of 2+ operands |
| `clamp` | `clamp: [value, min, max]` | number | clamp to range |
| `eq` | `eq: [a, b]` | boolean | a === b |
| `ne` | `ne: [a, b]` | boolean | a !== b |
| `gt` | `gt: [a, b]` | boolean | a > b |
| `gte` | `gte: [a, b]` | boolean | a >= b |
| `lt` | `lt: [a, b]` | boolean | a < b |
| `lte` | `lte: [a, b]` | boolean | a <= b |
| `and` | `and: [a, b, ...]` | boolean | logical AND |
| `or` | `or: [a, b, ...]` | boolean | logical OR |
| `not` | `not: expr` | boolean | logical NOT |
| `if` | `if: [cond, then, else]` | varies | conditional (3-element array) |
| `in` | `in: [value, idList]` | boolean | membership test (id in idList) |
| `coalesce` | `coalesce: [a, b, ...]` | varies | first non-undefined value |
| `boolToNumber` | `boolToNumber: expr` | 0 or 1 | convert boolean to number |
| `globalTokenAgg` | see above | number | count/aggregate tokens globally |
| `globalZoneAgg` | see above | number | count/aggregate zones |
| `zoneTokenAgg` | see above | number | per-zone token aggregation |
| `adjacentTokenAgg` | see above | number | tokens in adjacent zones |
| `seatAgg` | see above | number | aggregate expression across seats |
| `zoneProp` | see above | varies | zone attribute/property access |

## Signal Normalization

### Why normalize?

Scoring uses a linear weighted sum: `totalScore = Σ (weight × value)`. When signals operate on different scales, the larger-scale signal dominates regardless of weights:

| Signal | Raw range | Weight 5 contribution |
|--------|-----------|----------------------|
| Projected margin | -40 to +10 | -200 to +50 |
| Capability gain | 0 or 1 | 0 or 5 |

A capability bonus of +5 can never compete with a margin difference of ±50. **This is a mathematical property, not a tuning problem.**

### The fix: normalize to [0,1] using min/max aggregates

Use `candidateAggregates` to compute the range across all candidates, then normalize in the consideration's `value` expression:

```yaml
candidateAggregates:
  maxMarginScore:
    op: max
    of: { ref: feature.projectedSelfMargin }
  minMarginScore:
    op: min
    of: { ref: feature.projectedSelfMargin }

considerations:
  preferNormalizedMargin:
    scopes: [move]
    weight: 5
    value:
      div:
        - sub:
            - { ref: feature.projectedSelfMargin }
            - { ref: aggregate.minMarginScore }
        - max:
            - 1    # prevent division by zero when all candidates score equally
            - sub:
                - { ref: aggregate.maxMarginScore }
                - { ref: aggregate.minMarginScore }
```

Now margin contributes 0-5 points. A capability gain at weight 3 contributes 0-3 points. The signals compete fairly.

### When to normalize

- **Required**: when mixing preview margin with any secondary signal (capabilities, resource features, card annotations, board-state heuristics)
- **Not needed**: when using only one signal type (pure margin scoring, or pure action-tag scoring)

### Important: normalize in considerations, not candidateFeatures

`candidateFeatures` cannot reference `aggregate.*` (dependency ordering constraint). Put the normalization formula in the consideration's `value` expression, which CAN reference both candidate features and aggregates.

### Worked example

Without normalization (prior campaign ceiling):
```
Terror:     5 × (-4 margin) + 3 × 1 (rally=no) + 0 (no capability) = -17
Capability: 5 × (-8 margin) + 3 × 0             + 5 × 1           = -35
→ Terror always wins (20-point gap)
```

With normalization (margin range [-8, -4]):
```
Terror:     5 × 1.0 (best margin) + 3 × 0 + 0 = 5.0
Capability: 5 × 0.0 (worst margin) + 3 × 0 + 3 × 1 (capability gain) = 3.0
→ Terror still wins, but only by 2 points — secondary signals CAN compete
```

If the capability is highly valuable (weight 6+), it can overtake:
```
Capability: 5 × 0.0 + 6 × 1 = 6.0 > Terror: 5 × 1.0 = 5.0
```

This is the correct behavior: the agent trades a small margin advantage for a large strategic gain, just like a human player would.

## Common Patterns

### "Prefer action X when condition Y"
```yaml
scoreTerm:
  scopes: [move]
  when:
    lt: [{ ref: feature.selfMargin }, 0]
  weight: 10
  value:
    boolToNumber: { ref: candidate.tag.rally }
```

### "Count own pieces for state awareness"
```yaml
stateFeature:
  type: number
  expr:
    globalTokenAgg:
      aggOp: count
      tokenFilter:
        props:
          faction: { eq: self }
          type: { eq: guerrilla }
```

### "Score completion targets by zone quality"
```yaml
scoreTerm:
  scopes: [completion]
  when:
    eq: [{ ref: decision.targetKind }, zone]
  weight: 2
  value:
    coalesce:
      - zoneProp:
          zone: { ref: option.value }
          prop: population
      - 0
```

### "Evaluate threat near target zone"
```yaml
candidateFeature:
  type: number
  expr:
    adjacentTokenAgg:
      anchorZone: { ref: candidate.param.targetSpace }
      aggOp: count
      tokenFilter:
        props:
          faction: { eq: US }
```

### "Restrict scoring to a specific action"
```yaml
scoreTerm:
  scopes: [move]
  when:
    eq: [{ ref: candidate.actionId }, coupAgitateVC]
  weight: -2
  value:
    ref: feature.targetSpacePopulation
```

### "Check if action is in a set of IDs"
```yaml
scoreTerm:
  scopes: [move]
  weight: 5
  value:
    boolToNumber:
      in:
        - { ref: candidate.actionId }
        - [rally, march, attack]
```

### "Aggregate opponent state across seats"
```yaml
stateFeature:
  type: number
  expr:
    seatAgg:
      over: opponents
      expr: { ref: victory.currentMargin.$seat }
      aggOp: max
```

### "Clamp a value to a safe range"
```yaml
candidateFeature:
  type: number
  expr:
    clamp:
      - { ref: feature.projectedSelfMargin }
      - -10
      - 10
```

### "React to the active event card"

Event cards are often the most strategically important decisions in a game. The preview now captures immediate state changes and can automatically simulate one granted follow-up operation for the evaluating seat, but it still cannot capture every longer-horizon effect from:
- **Capability cards** — events that permanently modify game rules
- **Resource transfers** — events that shift economic balance

Use card annotations to supplement preview scoring. They remain especially useful for effects whose value is spread across later turns or does not show up as an immediate projected-margin change. Annotations are compiled from the event's effect AST and provide a numeric feature vector per card side.

#### Available annotation metrics

| Metric | Type | Meaning |
|--------|------|---------|
| `markerModifications` | number | count of zone marker changes (opposition/support shifts) |
| `globalMarkerModifications` | number | count of global marker changes (capabilities, leader effects) |
| `grantsOperation` | boolean | whether the event gives a player a free operation |
| `grantOperationSeats` | varies | which seats get the granted operation (`self`, seat IDs) |
| `hasLastingEffect` | boolean | whether the event has effects beyond the immediate resolution |
| `hasDecisionPoints` | boolean | whether the event requires player choices |
| `effectNodeCount` | number | complexity of the event's effect tree |
| `globalVarModifications` | number | count of global variable changes |
| `perPlayerVarModifications` | number | count of per-player variable changes (e.g., resources) |
| `tokenPlacements` | record | token placement counts by type |
| `tokenRemovals` | record | token removal counts by type |

Access via `activeCard.annotation.<side>.<metric>` (e.g., `activeCard.annotation.shaded.grantsOperation`).

#### Pattern: Prefer events that grant operations

Events that grant a free operation now benefit from automatic multi-step preview: if the evaluating seat is the grantee, preview simulates the event and then the best follow-up operation chosen by the same policy profile. Annotation bonuses are still useful when you want to weight the structural importance of the event beyond what the bounded preview can see.

**Note**: Annotation refs and tag refs compile to `number` (0/1), not `boolean`. Use `type: number` for features, `gt: [ref, 0]` for `when` clauses, and `coalesce` with `0` (not `false`).

```yaml
stateFeatures:
  # Does the shaded side grant a free operation? (0 or 1)
  shadedGrantsOp:
    type: number
    expr:
      coalesce:
        - { ref: activeCard.annotation.shaded.grantsOperation }
        - 0
  # Does the unshaded side grant a free operation? (0 or 1)
  unshadedGrantsOp:
    type: number
    expr:
      coalesce:
        - { ref: activeCard.annotation.unshaded.grantsOperation }
        - 0

considerations:
  # Strongly prefer playing events that grant free operations
  preferGrantingEvents:
    scopes: [move]
    when:
      gt:
        - add:
            - { ref: feature.shadedGrantsOp }
            - { ref: feature.unshadedGrantsOp }
        - 0
    weight: 3
    value:
      boolToNumber:
        or:
          - { ref: candidate.tag.event-play }
          - { ref: candidate.tag.pivotal-event }
```

#### Pattern: Prefer capability cards (long-term rule changes)

Capability cards modify game rules permanently (e.g., making sweeps risky, limiting ambushes). Their value is spread across all future turns — impossible to capture with any depth of preview.

```yaml
stateFeatures:
  isCapabilityCard:
    type: number    # hasTag compiles to number (0/1), not boolean
    expr:
      ref: activeCard.hasTag.capability

considerations:
  preferCapabilityEvents:
    scopes: [move]
    when:
      gt: [{ ref: feature.isCapabilityCard }, 0]
    weight: 3
    value:
      boolToNumber:
        or:
          - { ref: candidate.tag.event-play }
          - { ref: candidate.tag.pivotal-event }
```

#### Pattern: Value a specific capability state directly

`globalMarker.*` returns the marker's current lattice state as a string. Compare it with `eq`, then convert the result with `boolToNumber` when you want a numeric feature for scoring.

```yaml
stateFeatures:
  boobyTrapsActive:
    type: number
    expr:
      boolToNumber:
        eq:
          - { ref: globalMarker.cap_boobyTraps }
          - "shaded"

considerations:
  valueCapabilities:
    scopes: [move]
    weight: { param: capabilityWeight }
    value:
      ref: feature.boobyTrapsActive
```

#### Pattern: Score events by marker impact

Events with more marker modifications directly affect victory-relevant zone states (opposition, support, control). Higher `markerModifications` correlates with higher immediate strategic impact.

```yaml
stateFeatures:
  shadedMarkerImpact:
    type: number
    expr:
      coalesce:
        - { ref: activeCard.annotation.shaded.markerModifications }
        - 0
  unshadedMarkerImpact:
    type: number
    expr:
      coalesce:
        - { ref: activeCard.annotation.unshaded.markerModifications }
        - 0
```

These can be used in `when` clauses to conditionally boost events with high marker impact, or as values in considerations to weight events proportionally to their effect.

#### Pattern: Avoid events that help opponents

Events that grant operations to opponent seats are strategically dangerous. Use per-seat annotation variants to detect this.

```yaml
stateFeatures:
  # Check if unshaded side grants ops (0 or 1)
  unshadedGrantsOpToOpponent:
    type: number
    expr:
      coalesce:
        - { ref: activeCard.annotation.unshaded.grantsOperation }
        - 0
  # If you're VC, check if unshaded grants to US (0 or 1)
  unshadedGrantsToUs:
    type: number
    expr:
      coalesce:
        - { ref: activeCard.annotation.unshaded.grantOperationSeats.us }
        - 0
```

**Important**: The exact field paths for per-seat grant detection depend on how `grantOperationSeats` is indexed. Check the compiled annotation structure for your game.

#### Why preview alone isn't enough for events

The preview system evaluates the immediate game state after applying the event. This works well for:
- Events that directly move tokens or shift markers (preview sees the margin change)
- Events with simple, immediate effects

But preview can still **undervalue** or **miss**:
- **Granted operations with longer-term value** — preview only simulates one bounded follow-up action
- **Capability effects** — setting a global marker has zero immediate margin impact
- **Resource transfers** — changing resources doesn't affect the current margin
- **Lasting effects** — modifying future game rules is invisible to 1-move lookahead

Use annotation-based considerations alongside preview to capture these multi-turn effects. The annotations provide the "what does this card do?" signal that preview can't compute.

### "Distinguish move vs completion evaluation context"
```yaml
scoreTerm:
  scopes: [move, completion]
  weight:
    if:
      - { eq: [{ ref: context.kind }, move] }
      - 5
      - 2
  value:
    ref: feature.projectedSelfMargin
```

## Opponent Awareness

The policy DSL supports reading opponent state through seat-specific refs. This enables **reactive defensive play** — choosing actions that degrade an opponent's position — without multi-turn search. The agent reacts to observable game state, not simulated futures.

### Opponent margin monitoring

Track how close opponents are to their victory thresholds:

```yaml
stateFeatures:
  usMargin:
    type: number
    expr:
      ref: victory.currentMargin.us
  nvaMargin:
    type: number
    expr:
      ref: victory.currentMargin.nva
```

### Prefer actions that reduce opponent projected margin

Use `preview.victory.currentMargin.<seat>` to evaluate whether a candidate action worsens an opponent's position:

```yaml
candidateFeatures:
  projectedUsMargin:
    type: number
    expr:
      coalesce:
        - { ref: preview.victory.currentMargin.us }
        - { ref: feature.usMargin }

considerations:
  # Prefer actions that reduce US margin (lower US margin = better for non-US)
  reduceUsMargin:
    scopes: [move]
    weight: 2
    value:
      neg:
        ref: feature.projectedUsMargin
```

### Defensive play when opponent is near victory

```yaml
strategicConditions:
  usNearVictory:
    target:
      gte:
        - { ref: victory.currentMargin.us }
        - -3

considerations:
  # When US is close to winning, prefer actions that hurt US
  defensiveAgainstUs:
    scopes: [move]
    when: { ref: condition.usNearVictory.satisfied }
    weight: 5
    value:
      sub:
        - { ref: feature.usMargin }
        - coalesce:
            - { ref: preview.victory.currentMargin.us }
            - { ref: feature.usMargin }
```

**Important**: Opponent refs are subject to observability visibility. If `victory.currentMargin` is configured as `public` in the observer profile, opponent margins are accessible. If `seatVisible` or `private`, only own-seat margin is available.

## Rank-Based Normalization

### Problem: min-max normalization instability

`preferNormalizedMargin` uses `(value - min) / (max - min)` normalization. When most candidates produce similar margins, `max - min` approaches 0, compressing all values to near-equal scores. This makes secondary signals (Rally bonus, capability gain) dominate, regardless of their actual importance.

### Alternative: rank-based scoring with `rankDense`

Use `candidateAggregates` with `rankDense` to rank candidates by projected margin. The rank is bounded (1 to N candidates) and preserves ordering without the instability of min-max normalization.

```yaml
candidateAggregates:
  marginRank:
    op: rankDense
    of: { ref: feature.projectedSelfMargin }

considerations:
  # Higher rank = better margin. rankDense gives 1 to best, N to worst.
  # Negate so higher margin gets higher score.
  preferHighMarginRank:
    scopes: [move]
    weight: 3
    value:
      neg:
        ref: aggregate.marginRank
```

### When to use which normalization

| Approach | Best when | Risk |
|----------|-----------|------|
| Min-max (`preferNormalizedMargin`) | Candidates have diverse margins; want Rally bonus to compete fairly | Instability when margins cluster |
| Raw (`preferProjectedSelfMargin`) | Single dominant signal; no secondary bonuses needed | Unbounded range drowns secondary signals |
| Rank-based (`rankDense`) | Mixed signals; want stable relative ordering | Loses magnitude information (rank 1 vs 2 could be 1-point or 10-point gap) |

## Debugging Tips

- Set `traceLevel: 'verbose'` on the PolicyAgent to see all candidates with scores and contributions
- `stateFeatures` appear in the agent decision trace at every decision point
- State features are only evaluated if referenced by a consideration in the active profile
- `coalesce` is essential for preview refs and candidate params — they may be undefined
- Token `props` filtering uses the token's actual property values (e.g., `faction: VC`, `type: guerrilla`)
- The `self` keyword in token filters resolves to the acting player's ID, not a literal string
- Opponent margin refs (e.g., `victory.currentMargin.us`) resolve literal seat names — the engine looks up the seat ID directly
