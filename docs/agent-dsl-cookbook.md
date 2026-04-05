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
| `victory.currentRank.self` | number | own current ranking position (1 = winning) |
| `victory.currentRank.active` | number | active player's ranking |
| `var.global.<id>` | number | global game variable |
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
| `preview.victory.currentMargin.self` | number | projected margin AFTER this move |
| `preview.var.player.self.<id>` | number | projected variable after move |

Preview refs require `preview.mode: tolerateStochastic` (or `exactWorld`) on the profile. They evaluate the game state after applying the candidate move. If preview can't evaluate (stochastic outcome, template move), falls back to `undefined` — always wrap in `coalesce`.

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

**Field name note:** `globalTokenAgg` and `globalZoneAgg` use `aggOp:` for the operation field. `zoneTokenAgg` uses `op:`. This is an inconsistency in the DSL — use the correct field name for each operator.

**Zone scope** (optional): `board` (play area only), `aux` (off-board), `all` (default).

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

### Strategic Conditions

The `strategicConditions` library bucket defines boolean conditions with a proximity metric. Reference via `condition.<id>.satisfied` (boolean) and `condition.<id>.proximity` (0-1 number).

```yaml
strategicConditions:
  nearVictory:
    expr:
      gte:
        - { ref: victory.currentMargin.self }
        - -3
```

Use in `when` clauses: `when: { ref: condition.nearVictory.satisfied }`.

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
| `add` | `add: [a, b]` | number | a + b |
| `sub` | `sub: [a, b]` | number | a - b |
| `mul` | `mul: [a, b]` | number | a * b |
| `div` | `div: [a, b]` | number | a / b (integer division) |
| `neg` | `neg: expr` | number | -expr |
| `abs` | `abs: expr` | number | \|expr\| |
| `min` | `min: [a, b]` | number | min(a, b) |
| `max` | `max: [a, b]` | number | max(a, b) |
| `clamp` | `clamp: { value, min, max }` | number | clamp to range |
| `eq` | `eq: [a, b]` | boolean | a === b |
| `ne` | `ne: [a, b]` | boolean | a !== b |
| `gt` | `gt: [a, b]` | boolean | a > b |
| `gte` | `gte: [a, b]` | boolean | a >= b |
| `lt` | `lt: [a, b]` | boolean | a < b |
| `lte` | `lte: [a, b]` | boolean | a <= b |
| `and` | `and: [a, b, ...]` | boolean | logical AND |
| `or` | `or: [a, b, ...]` | boolean | logical OR |
| `not` | `not: expr` | boolean | logical NOT |
| `if` | `if: { cond, then, else }` | varies | conditional |
| `in` | `in: { value, set: [...] }` | boolean | membership test |
| `coalesce` | `coalesce: [a, b, ...]` | varies | first non-undefined value |
| `boolToNumber` | `boolToNumber: expr` | 0 or 1 | convert boolean to number |
| `globalTokenAgg` | see above | number | count/aggregate tokens globally |
| `globalZoneAgg` | see above | number | count/aggregate zones |
| `zoneTokenAgg` | see above | number | per-zone token aggregation |
| `adjacentTokenAgg` | see above | number | tokens in adjacent zones |
| `zoneProp` | see above | varies | zone attribute/property access |

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
  # Check if unshaded side grants ops to an opponent seat
  unshadedGrantsOpToOpponent:
    type: boolean
    expr:
      coalesce:
        - { ref: activeCard.annotation.unshaded.grantsOperation }
        - false
  # If you're VC, check if unshaded grants to US
  unshadedGrantsToUs:
    type: boolean
    expr:
      coalesce:
        - { ref: activeCard.annotation.unshaded.grantOperationSeats.us }
        - false
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
      cond: { eq: [{ ref: context.kind }, move] }
      then: 5
      else: 2
  value:
    ref: feature.projectedSelfMargin
```

## Debugging Tips

- Set `traceLevel: 'verbose'` on the PolicyAgent to see all candidates with scores and contributions
- `stateFeatures` appear in the agent decision trace at every decision point
- State features are only evaluated if referenced by a consideration in the active profile
- `coalesce` is essential for preview refs and candidate params — they may be undefined
- Token `props` filtering uses the token's actual property values (e.g., `faction: VC`, `type: guerrilla`)
- The `self` keyword in token filters resolves to the acting player's ID, not a literal string
