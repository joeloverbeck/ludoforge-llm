# Spec 96: Global State Aggregation Expressions

**Status**: Draft
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 15 (implemented)
**Enhances**: Spec 95 (richer features for completion guidance)
**Estimated effort**: 3-5 days
**Origin**: FITL VC agent evolution campaign -- the agent has only two state features (`selfMargin`, `selfResources`). It cannot reason about zone-level state, piece distribution, or territorial control. Conditional scoring requires richer state awareness.

## Problem Statement

The PolicyAgent's state feature surface is severely limited. The only available state queries are:

- `victory.currentMargin.self` -- net victory margin (a single number)
- `var.player.self.resources` -- resource count (a single number)
- `zoneTokenAgg` -- token aggregation within a SINGLE named zone

These are insufficient for strategic reasoning:

1. **No map-wide aggregation**: "How many VC bases are on the map?" requires summing across all zones. `zoneTokenAgg` queries one zone at a time and requires a hardcoded zone ID.

2. **No conditional macro-strategy**: Without map-wide state, `when` clauses on scoreTerms can only condition on margin and resources. The agent can't say "when I have fewer than 3 bases, prefer Rally over Tax" or "when total opposition exceeds 30, shift to defensive posture."

3. **No threat assessment**: "How many US troops are in zones adjacent to my bases?" is inexpressible. The agent has no awareness of opponent piece distribution.

4. **No territorial decomposition**: The VC victory formula is `Total Opposition + VC Bases > 35`, but the agent can't decompose this: "I have 8 bases and 25 opposition -- I need 2 more opposition, not more bases." This decomposition requires counting bases and opposition separately.

### Empirical Evidence

The FITL campaign's exp-002 (Tax-first) proved that macro-strategy DOES matter -- inverting Rally/Tax priority was catastrophic. But conditional macro-strategy (vary priority based on game state) was impossible to test meaningfully because the only available conditions are margin and resources, which don't capture the strategic dimensions that matter.

## Goals

- Add a `globalTokenAgg` expression kind that aggregates tokens across ALL zones (or filtered subsets)
- Add a `globalZoneAgg` expression kind that aggregates zone-level properties (population, control, opposition/support levels)
- Enable conditional scoreTerms based on map-wide state (piece counts, territorial control, threat levels)
- Maintain engine agnosticism: aggregation expressions are generic, game-specific semantics live in YAML
- Maintain bounded computation: aggregation iterates over finite zone/token collections
- Maintain determinism: aggregation is a pure read-only operation on game state

## Non-Goals

- Spatial queries (adjacency-based aggregation) -- those would require graph traversal
- Token-level filtering by arbitrary properties (beyond type and owner)
- Mutable state or side effects from aggregation
- Zone creation or modification
- Real-time streaming of aggregation results

## Foundation Alignment

| Foundation | Alignment |
|------------|-----------|
| #1 Engine Agnosticism | `globalTokenAgg` and `globalZoneAgg` are generic operators parameterized by token type, owner, zone filter, and aggregation operation. No game-specific logic. |
| #2 Evolution-First | Feature definitions using these expressions live in YAML. Evolution can create new aggregates and conditions by mutating YAML. |
| #5 Determinism | Aggregation is a pure function of game state. Same state = same result. |
| #6 Bounded Computation | Iterates over `Object.entries(state.zones)` -- finite. Each zone's token array is finite. Total cost: `O(zones * maxTokensPerZone)`. For FITL (~90 zone slots, ~5 tokens per slot): ~450 iterations per aggregation. |
| #7 Immutability | Read-only. Aggregation reads state, never modifies it. |

## Proposed Design

### 1. `globalTokenAgg` Expression

Aggregates token properties across all zones, optionally filtered by owner.

```yaml
# YAML authored syntax
stateFeatures:
  totalVCGuerrillas:
    type: number
    expr:
      globalTokenAgg:
        owner: self          # self | active | any | <seatId>
        tokenType: guerrilla # optional: filter by token type name
        aggOp: count         # count | sum | min | max
        prop: null           # required for sum/min/max, null for count
```

Compiled representation in `AgentPolicyExpr`:

```typescript
{
  kind: 'globalTokenAgg',
  owner: 'self' | 'active' | 'any' | string,
  tokenType: string | undefined,  // optional filter
  aggOp: 'count' | 'sum' | 'min' | 'max',
  prop: string | undefined,       // token property name for sum/min/max
}
```

Runtime evaluation in `policy-eval.ts`:

```typescript
private evaluateGlobalTokenAggregate(
  expr: Extract<AgentPolicyExpr, { readonly kind: 'globalTokenAgg' }>,
): PolicyValue {
  const ownerFilter = resolveOwnerFilter(expr.owner, this.input.playerId, this.input.state);
  let count = 0;
  let accumulator: number | undefined;

  for (const [zoneId, tokens] of Object.entries(this.input.state.zones)) {
    if (ownerFilter !== 'any' && !zoneId.endsWith(`:${ownerFilter}`)) continue;
    for (const token of tokens) {
      if (expr.tokenType !== undefined && token.type !== expr.tokenType) continue;
      if (expr.aggOp === 'count') { count++; continue; }
      const val = expr.prop !== undefined ? token.props[expr.prop] : undefined;
      if (typeof val !== 'number') continue;
      // apply sum/min/max
    }
  }
  return expr.aggOp === 'count' ? count : accumulator ?? 0;
}
```

### 2. `globalZoneAgg` Expression

Aggregates zone-level derived metrics (population, control level, support/opposition).

```yaml
stateFeatures:
  totalOpposition:
    type: number
    expr:
      globalZoneAgg:
        owner: any
        zoneVar: opposition    # zone-level variable name
        aggOp: sum
```

This requires zone-level variables to be defined in the game spec. FITL already has these via the `support`/`opposition` per-zone state. The expression iterates over all zones and sums the named variable.

### 3. Filtered Aggregation

Optional zone filter for scoped aggregation:

```yaml
stateFeatures:
  vcBasesInCities:
    type: number
    expr:
      globalTokenAgg:
        owner: self
        tokenType: base
        aggOp: count
        zoneFilter:
          prop: population
          op: gt
          value: 0
```

Zone filters reference zone properties (tags, population, terrain) defined in the game spec. The filter evaluates against zone definitions in `GameDef.zones`, not runtime state.

### 4. Usage in Conditional ScoreTerms

With map-wide state features, conditional scoring becomes powerful:

```yaml
stateFeatures:
  vcBaseCount:
    type: number
    expr:
      globalTokenAgg: { owner: self, tokenType: base, aggOp: count }
  vcGuerrillaCount:
    type: number
    expr:
      globalTokenAgg: { owner: self, tokenType: guerrilla, aggOp: count }

scoreTerms:
  preferRallyWhenFewBases:
    weight: 3
    when:
      lt:
        - { ref: feature.vcBaseCount }
        - 4
    value:
      boolToNumber:
        ref: feature.isRally
  preferTaxWhenManyBases:
    weight: 2
    when:
      gte:
        - { ref: feature.vcBaseCount }
        - 4
    value:
      boolToNumber:
        ref: feature.isTax
```

### Files to Modify

| File | Change |
|------|--------|
| `packages/engine/src/kernel/types-core.ts` | Add `globalTokenAgg` and `globalZoneAgg` to `AgentPolicyExpr` union |
| `packages/engine/src/agents/policy-eval.ts` | Implement `evaluateGlobalTokenAggregate` and `evaluateGlobalZoneAggregate` |
| `packages/engine/src/cnl/compile-agents.ts` | Compile `globalTokenAgg`/`globalZoneAgg` from YAML |
| `packages/engine/src/cnl/validate-agents.ts` | Validate token types and zone variable references |
| `packages/engine/src/cnl/game-spec-doc.ts` | Add authored types for global aggregation |
| `packages/engine/schemas/gamedef.schema.json` | Add `globalTokenAgg`/`globalZoneAgg` to expression schema |

### Performance Considerations

Each `globalTokenAgg` evaluation iterates all zone slots. For FITL:

- ~90 zone slots (43 provinces * 2 owners + special zones)
- ~5 tokens per slot on average
- ~450 iterations per aggregation

At 3-5 state features using global aggregation, called once per decision point: ~2000 iterations. This is negligible compared to the 25,000+ effect evaluations per `legalMoves()` call.

For games with many more zones (hypothetical 500-zone game), aggregation cost grows linearly but remains bounded.

### Testing Strategy

- **Unit**: `globalTokenAgg` count/sum/min/max with known zone state
- **Unit**: Owner filtering (self, active, any, specific seat)
- **Unit**: Token type filtering
- **Unit**: Zone filter by property
- **Integration**: Compile FITL spec with global aggregation features, verify compilation
- **Integration**: Evaluate `vcBaseCount` at known FITL game state, verify correct count
- **Golden**: Updated policy catalog golden with new expression kinds
- **Property**: Aggregation result is consistent with manual zone-by-zone counting
- **Property**: Aggregation over empty state returns 0 (not undefined)
