# Spec 96: Global State Aggregation Expressions

**Status**: COMPLETED
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 15 (implemented), Spec 95 (implemented)
**Enhances**: Spec 95 (richer features for completion guidance)
**Estimated effort**: 4-6 days
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

- Add a `globalTokenAgg` expression kind that aggregates tokens across all board zones (or filtered subsets), with generic token property filtering
- Add a `globalZoneAgg` expression kind that aggregates zone-level properties, supporting both static zone attributes and runtime zone variables
- Add an `adjacentTokenAgg` expression kind that aggregates tokens in zones adjacent to a named anchor zone
- Enable conditional scoreTerms based on map-wide state (piece counts, territorial control, threat levels)
- Maintain engine agnosticism: aggregation expressions are generic, game-specific semantics live in YAML
- Maintain bounded computation: aggregation iterates over finite zone/token collections
- Maintain determinism: aggregation is a pure read-only operation on game state

## Non-Goals

- Multi-anchor adjacency queries ("adjacent to any zone containing X") -- follow-up spec
- Graph traversal beyond immediate neighbors (BFS/DFS connected-zone queries)
- Mutable state or side effects from aggregation
- Zone creation or modification
- Real-time streaming of aggregation results

## Foundation Alignment

| Foundation | Alignment |
|------------|-----------|
| #1 Engine Agnosticism | All three expression kinds are generic operators parameterized by token filters, zone filters, and aggregation operations. No game-specific logic. Token ownership is expressed through generic prop filtering (e.g., `props.seat`), not a hardcoded `owner` concept. |
| #2 Evolution-First | Feature definitions using these expressions live in YAML. Evolution can create new aggregates and conditions by mutating YAML. Token filters, zone filters, and aggregation ops are all YAML-expressible. |
| #5 Determinism | Aggregation is a pure function of game state. Same state = same result. |
| #6 Bounded Computation | `globalTokenAgg`/`globalZoneAgg` iterate `Object.entries(state.zones)` -- finite. `adjacentTokenAgg` is bounded by graph degree (typically 3-6 neighbors). Total cost per aggregation: `O(zones * maxTokensPerZone)` for global, `O(degree * maxTokensPerZone)` for adjacent. |
| #7 Immutability | Read-only. Aggregation reads state, never modifies it. |
| #8 Compiler-Kernel Boundary | The compiler validates expression structure, field presence, and reference resolution. The kernel evaluates at runtime with resolved player IDs and zone references. |
| #12 Branded Types | Zone references use `ZoneId` branded type. Player resolution from `'self'`/`'active'` produces `PlayerId`. |

## Proposed Design

### 1. Token Filter Object

A generic filter for selecting tokens within zones. Replaces the original `owner` parameter to maintain engine agnosticism (Foundation #1) -- tokens don't have a standard `owner` field; ownership is a game-level convention encoded in token props.

```yaml
# Full form
tokenFilter:
  type: guerrilla              # optional: match token.type
  props:                       # optional: match token.props
    seat: { eq: self }         # 'self'/'active' resolve to PlayerId at eval time
    flipped: { eq: false }     # literal value comparison

# Minimal form (type-only)
tokenFilter:
  type: base
```

Compiled representation:

```typescript
interface AgentPolicyTokenFilter {
  readonly type?: string;                    // token.type match
  readonly props?: Readonly<Record<string, {
    readonly eq: string | number | boolean;  // 'self'/'active' resolve at eval time
  }>>;
}
```

When `tokenFilter` is omitted, all tokens in matching zones are included.

### 2. Zone Filter Object

A generic filter for selecting which zones to iterate. Supports zone category, static zone attributes, and runtime zone variables.

```yaml
# Filter by category
zoneFilter:
  category: province

# Filter by static attribute
zoneFilter:
  attribute:
    prop: population
    op: gt
    value: 0

# Filter by runtime zone variable
zoneFilter:
  variable:
    prop: opposition
    op: gt
    value: 0

# Compound: category + attribute
zoneFilter:
  category: province
  attribute:
    prop: population
    op: gt
    value: 0
```

Compiled representation:

```typescript
interface AgentPolicyZoneFilter {
  readonly category?: string;
  readonly attribute?: {
    readonly prop: string;
    readonly op: 'eq' | 'gt' | 'gte' | 'lt' | 'lte';
    readonly value: number | string | boolean;
  };
  readonly variable?: {
    readonly prop: string;
    readonly op: 'eq' | 'gt' | 'gte' | 'lt' | 'lte';
    readonly value: number;
  };
}
```

### 3. Zone Scope Default

All three expression kinds default to iterating only zones where `zoneKind === 'board'`. This prevents the common mistake of accidentally counting tokens in hands, decks, available-forces pools, or eliminated boxes.

An explicit `zoneScope: 'all'` overrides this to include auxiliary zones. `zoneScope: 'aux'` restricts to auxiliary zones only.

```yaml
# Default: board zones only (no zoneScope needed)
globalTokenAgg:
  tokenFilter: { type: base }
  aggOp: count

# Override: include all zones
globalTokenAgg:
  tokenFilter: { type: base }
  aggOp: count
  zoneScope: all
```

### 4. `globalTokenAgg` Expression

Aggregates token properties across all board zones (or filtered subsets).

```yaml
# Count all VC guerrillas on the map
stateFeatures:
  vcGuerrillaCount:
    type: number
    expr:
      globalTokenAgg:
        tokenFilter:
          type: guerrilla
          props:
            seat: { eq: self }
        aggOp: count

# Sum troop strength across provinces
stateFeatures:
  totalTroopStrength:
    type: number
    expr:
      globalTokenAgg:
        tokenFilter:
          type: troop
          props:
            seat: { eq: us }
        aggOp: sum
        prop: strength
        zoneFilter:
          category: province
```

Compiled representation in `AgentPolicyExpr`:

```typescript
{
  kind: 'globalTokenAgg',
  tokenFilter?: AgentPolicyTokenFilter,
  aggOp: 'count' | 'sum' | 'min' | 'max',
  prop?: string,           // token property name for sum/min/max
  zoneFilter?: AgentPolicyZoneFilter,
  zoneScope: 'board' | 'aux' | 'all',  // defaults to 'board'
}
```

Runtime evaluation sketch:

```typescript
private evaluateGlobalTokenAggregate(
  expr: Extract<AgentPolicyExpr, { readonly kind: 'globalTokenAgg' }>,
): PolicyValue {
  const resolvedFilter = resolveTokenFilter(expr.tokenFilter, this.input.playerId, this.input.state);
  let count = 0;
  let accumulator: number | undefined;

  for (const zoneDef of this.input.def.zones) {
    if (!matchesZoneScope(zoneDef, expr.zoneScope)) continue;
    if (expr.zoneFilter && !matchesZoneFilter(zoneDef, expr.zoneFilter, this.input.state)) continue;

    const tokens = this.input.state.zones[String(zoneDef.id)] ?? [];
    for (const token of tokens) {
      if (!matchesTokenFilter(token, resolvedFilter)) continue;
      if (expr.aggOp === 'count') { count++; continue; }
      const val = expr.prop !== undefined ? token.props[expr.prop] : undefined;
      if (typeof val !== 'number') continue;
      accumulator = applyAggOp(expr.aggOp, accumulator, val);
    }
  }
  return expr.aggOp === 'count' ? count : accumulator ?? 0;
}
```

### 5. `globalZoneAgg` Expression

Aggregates zone-level data across all board zones (or filtered subsets). Supports two sources:

- **`source: 'variable'`** (default): Reads from `state.zoneVars[zoneId][field]` -- runtime mutable state (support, opposition, control markers).
- **`source: 'attribute'`**: Reads from `GameDef.zones[].attributes[field]` -- static zone metadata (population, terrain values).

```yaml
# Sum opposition across all provinces (runtime zone variable)
stateFeatures:
  totalOpposition:
    type: number
    expr:
      globalZoneAgg:
        source: variable
        field: opposition
        aggOp: sum
        zoneFilter:
          category: province

# Count zones with population > 0 (static zone attribute)
stateFeatures:
  populatedZoneCount:
    type: number
    expr:
      globalZoneAgg:
        source: attribute
        field: population
        aggOp: count
        zoneFilter:
          attribute:
            prop: population
            op: gt
            value: 0
```

Compiled representation:

```typescript
{
  kind: 'globalZoneAgg',
  source: 'variable' | 'attribute',
  field: string,
  aggOp: 'count' | 'sum' | 'min' | 'max',
  zoneFilter?: AgentPolicyZoneFilter,
  zoneScope: 'board' | 'aux' | 'all',  // defaults to 'board'
}
```

**Note on `count` for `globalZoneAgg`**: When `aggOp` is `count`, the result is the number of zones matching the filter (not a sum of field values). The `field` parameter is ignored for `count`.

### 6. `adjacentTokenAgg` Expression

Aggregates tokens in zones adjacent to a named anchor zone. Bounded by graph degree (typically 3-6 neighbors per zone). Reuses `queryAdjacentZones` from `packages/engine/src/kernel/spatial.ts`.

```yaml
# Count US troops near Saigon
stateFeatures:
  usTroopsNearSaigon:
    type: number
    expr:
      adjacentTokenAgg:
        anchorZone: saigon:none
        tokenFilter:
          type: troop
          props:
            seat: { eq: us }
        aggOp: count

# Sum guerrilla count near Hue
stateFeatures:
  guerrillasNearHue:
    type: number
    expr:
      adjacentTokenAgg:
        anchorZone: hue:none
        tokenFilter:
          type: guerrilla
        aggOp: count
```

Compiled representation:

```typescript
{
  kind: 'adjacentTokenAgg',
  anchorZone: string,          // zone ID (resolved to ZoneId at eval time)
  tokenFilter?: AgentPolicyTokenFilter,
  aggOp: 'count' | 'sum' | 'min' | 'max',
  prop?: string,               // token property for sum/min/max
}
```

Runtime: resolves `anchorZone` to a `ZoneId`, calls `queryAdjacentZones(graph, anchorZoneId)` to get neighbor zone IDs, then iterates tokens in those neighbors with the token filter.

**Anchor zone resolution**: The `anchorZone` string supports the same `'self'`/`'active'` owner resolution as zone references elsewhere. E.g., `anchorZone: hand:self` resolves to the current player's hand zone.

### 7. Usage in Conditional ScoreTerms

With map-wide and adjacency state features, conditional scoring becomes powerful:

```yaml
stateFeatures:
  vcBaseCount:
    type: number
    expr:
      globalTokenAgg:
        tokenFilter:
          type: base
          props: { seat: { eq: self } }
        aggOp: count
  totalOpposition:
    type: number
    expr:
      globalZoneAgg:
        source: variable
        field: opposition
        aggOp: sum
        zoneFilter: { category: province }

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
  shiftDefensiveWhenHighOpposition:
    weight: 2
    when:
      gt:
        - { ref: feature.totalOpposition }
        - 30
    value:
      boolToNumber:
        ref: feature.isDefensive
```

### Files to Modify

| File | Change |
|------|--------|
| `packages/engine/src/kernel/types-core.ts` | Add `globalTokenAgg`, `globalZoneAgg`, `adjacentTokenAgg` to `AgentPolicyExpr` union. Add `AgentPolicyTokenFilter` and `AgentPolicyZoneFilter` interfaces. |
| `packages/engine/src/agents/policy-evaluation-core.ts` | Implement `evaluateGlobalTokenAggregate`, `evaluateGlobalZoneAggregate`, `evaluateAdjacentTokenAggregate`. Add `matchesTokenFilter`, `matchesZoneFilter`, `matchesZoneScope` helpers. |
| `packages/engine/src/agents/policy-expr.ts` | Add `analyzeGlobalTokenAgg`, `analyzeGlobalZoneAgg`, `analyzeAdjacentTokenAgg` compilation/analysis functions. Wire into main `analyzePolicyExpr` dispatcher. |
| `packages/engine/src/contracts/policy-contract.ts` | Add constants and validators for token filter ops, zone filter ops, zone scope values, zone agg sources. |
| `packages/engine/src/cnl/compile-agents.ts` | Ensure new expression kinds flow through the existing compilation pipeline (may need minimal wiring if `policy-expr.ts` handles analysis). |
| `packages/engine/src/cnl/game-spec-doc.ts` | No changes needed -- authored types use the existing freeform `GameSpecPolicyExpr` type. |
| `packages/engine/schemas/GameDef.schema.json` | Optional: add expression kind schemas for documentation. Compile-time validation in `policy-expr.ts` is the primary validation path. |

### Performance Considerations

Each `globalTokenAgg`/`globalZoneAgg` evaluation iterates zone definitions. For FITL:

- ~90 zone slots (43 provinces * 2 + special zones)
- ~5 tokens per slot on average
- ~450 iterations per `globalTokenAgg` aggregation

At 3-5 state features using global aggregation, called once per decision point: ~2000 iterations. This is negligible compared to the 25,000+ effect evaluations per `legalMoves()` call.

`adjacentTokenAgg` is cheaper: O(degree * tokensPerZone), typically ~25 iterations per evaluation.

For games with many more zones (hypothetical 500-zone game), aggregation cost grows linearly but remains bounded. The cost class for all three expression kinds is `'state'` (evaluated once per policy evaluation, cached).

### Testing Strategy

**Unit tests**:
- `globalTokenAgg` count/sum/min/max with known zone state
- `globalZoneAgg` with `source: 'variable'` (runtime) and `source: 'attribute'` (static)
- `adjacentTokenAgg` with known adjacency graph and token placement
- Token filter: type matching, prop matching, `'self'`/`'active'` resolution
- Zone filter: category, attribute condition, variable condition, compound
- Zone scope: board-only default, `'all'` override, `'aux'` restriction
- Edge cases: empty state returns 0, no matching tokens returns 0, no matching zones returns 0

**Integration tests**:
- Compile FITL spec with new aggregation features, verify compilation succeeds
- Evaluate `vcBaseCount` at known FITL game state, verify correct count
- Evaluate `totalOpposition` at known state, verify correct sum
- Conditional scoreTerm activates/deactivates based on aggregated threshold

**Golden tests**:
- Updated policy catalog golden with new expression kinds

**Property tests**:
- Aggregation result is consistent with manual zone-by-zone counting
- Aggregation over empty state returns 0 (not undefined or NaN)
- `globalTokenAgg` count with no filter equals total token count across board zones
- `adjacentTokenAgg` result is subset of `globalTokenAgg` result (adjacent zones are a subset of all zones)

## Outcome

- Completion date: 2026-03-30
- What actually changed:
  - Added `globalTokenAgg`, `globalZoneAgg`, and `adjacentTokenAgg` to the policy expression compiler/runtime/schema surface.
  - Added unit coverage for compilation, runtime evaluation, and schema acceptance.
  - Added FITL-derived integration coverage proving authored aggregation expressions compile and evaluate correctly against real FITL-shaped state.
  - Added property-oriented aggregation invariants and verified production policy goldens remain stable.
- Deviations from original plan:
  - Maintained production FITL/Texas agent authoring was not updated to use the new expressions yet, so production goldens remained unchanged.
  - Seat-like ownership matching in FITL integration coverage relies on `self` resolution or runtime player ids, because FITL token props use runtime `PlayerId` values rather than authored seat-id strings.
- Verification:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
  - `pnpm turbo test`
