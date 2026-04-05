# Agent Policy DSL Cookbook

Quick reference for writing PolicyAgent profiles in GameSpecDoc YAML. All examples are drawn from production FITL and Texas Hold'em game specs.

## Architecture

```
agents:
  parameters:     # tunable knobs (shared across profiles)
  library:
    stateFeatures:        # game-state variables evaluated once per decision
    candidateFeatures:    # per-candidate variables (may use preview)
    candidateAggregates:  # cross-candidate boolean aggregations
    pruningRules:         # eliminate bad candidates before scoring
    considerations:       # score terms (move or completion scope)
    tieBreakers:          # break ties after scoring
  profiles:       # per-seat configurations referencing library items
  bindings:       # seat → profile mapping
```

The library defines reusable building blocks. Profiles select which blocks to use and override parameter values. Bindings map game seats to profiles.

## Reference Paths

### State References (`ref:`)

| Path | Returns | Example |
|------|---------|---------|
| `victory.currentMargin.self` | number | VC's distance from victory threshold |
| `victory.currentMargin.active` | number | active player's margin |
| `victory.currentRank.self` | number | current ranking position |
| `var.global.<id>` | number | global game variable |
| `var.player.self.<id>` | number | own per-player variable (e.g., resources) |
| `var.player.active.<id>` | number | active player's variable |
| `metric.<id>` | number | derived metric defined in observability |
| `turn.round` | number | current turn/round count |
| `turn.phaseId` | string | current game phase ID |
| `seat.self` | string | own seat ID |
| `seat.active` | string | active player's seat ID |
| `feature.<id>` | varies | evaluated state feature from library |

### Candidate References

| Path | Returns | Example |
|------|---------|---------|
| `candidate.actionId` | string | action ID of the move |
| `candidate.tag.<name>` | boolean | whether action has a specific tag |
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

Define tunable numeric knobs in the `parameters:` section. Profiles override with `params:`.

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

Boolean aggregations across all candidates. Used in pruning rule conditions.

```yaml
candidateAggregates:
  hasNonPassAlternative:
    op: any
    of:
      not:
        ref: candidate.tag.pass
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

```yaml
tieBreakers:
  # Lower expression value wins
  preferCheapTargetSpaces:
    kind: lowerExpr
    value:
      ref: feature.targetSpacePopulation

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

**Selection modes:** `argmax` (default — highest score wins), `softmaxSample` (probabilistic selection with temperature).

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

## Debugging Tips

- Set `traceLevel: 'verbose'` on the PolicyAgent to see all candidates with scores and contributions
- `stateFeatures` appear in the agent decision trace at every decision point
- State features are only evaluated if referenced by a consideration in the active profile
- `coalesce` is essential for preview refs and candidate params — they may be undefined
- Token `props` filtering uses the token's actual property values (e.g., `faction: VC`, `type: guerrilla`)
- The `self` keyword in token filters resolves to the acting player's ID, not a literal string
