# Spec 25: FITL Game Mechanics Infrastructure

**Status**: Draft
**Priority**: P0
**Complexity**: L
**Dependencies**: Spec 23 (map + pieces for testing)
**Estimated effort**: 3–4 days
**Source sections**: Brainstorming Sections 4.2 (items 6–8, 11), 5 (architectural decisions), 7.2, 7.7

## Overview

Implement cross-cutting mechanics that operations, special activities, events, and victory checks all depend on: derived value tracking, stacking enforcement, dynamic piece sourcing, and free operations. These are game-agnostic kernel/compiler features needed to express FITL rules declaratively.

## Scope

### In Scope

- **Derived value tracking**: Total Support, Total Opposition, COIN Control per space, NVA Control per space, Total Econ, victory markers. (Open Question #1: caching vs on-demand.)
- **Stacking enforcement**: Max 2 Bases per Province/City, no Bases on LoCs, only NVA/VC in North Vietnam. (Open Question #5: compile-time vs runtime vs both.)
- **Dynamic piece sourcing** (Rule 1.4.1): Check available zone first, fallback to map. US Troops/Bases cannot be taken from map.
- **Free operations** (Rule 3.1.2): No resources, no eligibility impact. Pacification/Agitation/Trail still cost.

### Out of Scope

- RVN Leader effects (Spec 28)
- Individual operation/SA effects (Specs 26–27)
- Capabilities and momentum (Spec 28)
- Event card resolution (Spec 29)

## Key Types & Interfaces

### Derived Values

```typescript
// Computed from game state — not stored, computed on demand (recommended)
// or cached with invalidation (alternative)

// COIN Control: US + ARVN pieces > NVA + VC pieces in a space
// NVA Control: NVA pieces > all other pieces in a space
// Total Support: sum of population × support multiplier across all spaces
// Total Opposition: sum of population × opposition multiplier across all spaces
// Victory markers: compound formulas per faction (see brainstorming Section 7.2)

// These are expressible via existing aggregate + condition AST:
// { aggregate: { op: 'count', query: ... }, ... }
// { op: '>', left: ..., right: ... }
```

### Stacking Constraints

```typescript
// New type for declarative stacking rules (game-agnostic)
interface StackingConstraint {
  readonly id: string;
  readonly description: string;
  readonly spaceFilter: {
    readonly spaceTypes?: readonly string[];
    readonly countries?: readonly string[];
  };
  readonly pieceFilter: {
    readonly pieceTypeIds?: readonly string[];
    readonly factions?: readonly string[];
  };
  readonly rule: 'maxCount' | 'prohibit';
  readonly maxCount?: number;  // for 'maxCount' rule
}
```

Example FITL stacking constraints:
1. Max 2 Bases per Province or City: `{ spaceFilter: { spaceTypes: ['province', 'city'] }, pieceFilter: { pieceTypeIds: ['base'] }, rule: 'maxCount', maxCount: 2 }`
2. No Bases on LoCs: `{ spaceFilter: { spaceTypes: ['loc'] }, pieceFilter: { pieceTypeIds: ['base'] }, rule: 'prohibit' }`
3. Only NVA/VC in North Vietnam: `{ spaceFilter: { countries: ['northVietnam'] }, pieceFilter: { factions: ['US', 'ARVN'] }, rule: 'prohibit' }`

### Free Operation Flag

```typescript
// Extension to effect execution context
interface EffectExecutionContext {
  // ... existing fields ...
  readonly freeOperation?: boolean;  // true = no resource cost, no eligibility change
}
```

### Dynamic Piece Sourcing Pattern

Already expressible with existing `if/then/else` + `aggregate count` (see brainstorming Section 7.7):

```
if (count tokens in available:FACTION > 0)
  then: place from available
  else: if (faction != 'US' || pieceType not in ['troops', 'base'])
    then: take from map
    else: skip (US Troops/Bases cannot be taken from map)
```

## Implementation Tasks

### Task 25.1: Derived Value Computation

**Decision needed**: On-demand computation (recommended) vs cached with invalidation.

**On-demand approach** (recommended for MVP):
- Derived values are computed by evaluating aggregate conditions against current game state
- No new state storage needed
- Already expressible via `ConditionAST` and `ValueExpr` with `aggregate`
- Performance acceptable for hundreds of queries per turn

**Cached approach** (consider post-MVP if benchmarks warrant):
- Store derived values in `GameState`
- Invalidate and recompute on any piece movement or marker change
- More complex but avoids repeated computation

Implementation: Ensure existing aggregate/condition infrastructure supports the required queries:
- Count pieces by faction in a zone
- Sum population × support multiplier across zones
- Compare faction piece counts for control determination

### Task 25.2: Stacking Enforcement

**Decision needed**: Compile-time (scenario validation), runtime (effect execution), or both.

**Recommended: both**:
1. **Compile-time**: Validate scenario initial placements against stacking constraints during `validateGameSpec`
2. **Runtime**: Check stacking after each piece placement effect; reject or warn on violation

Add `StackingConstraint[]` to `MapPayload` or `GameDef` level. Modify effect interpreter (`src/kernel/effects.ts`) to check placement effects against constraints.

### Task 25.3: Dynamic Piece Sourcing

Verify that the pattern from brainstorming Section 7.7 works with existing `EffectAST`:
- `if` condition checks available zone count
- `then` branch places from available
- `else` branch checks faction exception (US Troops/Bases)
- Nested `if/then/else` for the fallback

If the existing AST supports this nesting, no kernel changes needed — just document the pattern for Specs 26–27 to use. If not, extend `EffectAST.if` to support deeper nesting.

### Task 25.4: Free Operation Flag

Add `freeOperation` flag to the effect execution context:
- When `freeOperation: true`:
  - Resource cost effects are skipped (except Pacification, Agitation, Trail costs)
  - Eligibility is not affected
- Events that grant free operations set this flag before invoking the operation effects

Modify `src/kernel/effects.ts` to respect this flag on `addVar` effects that represent resource costs.

## Open Questions

### Open Question #1: Derived Value Caching vs On-Demand

**Recommendation**: Start with on-demand for MVP. Benchmark after Milestone C (Spec 26–27 complete). If computation per turn exceeds 10ms for full 130-card games, add caching.

**Trade-offs**:
- On-demand: simpler, no invalidation bugs, works with immutable state
- Cached: faster repeated queries, but adds mutable state or recomputation on every state change

### Open Question #5: Stacking Enforcement Timing

**Recommendation**: Both compile-time and runtime.

**Trade-offs**:
- Compile-time only: catches scenario errors but not effect bugs
- Runtime only: catches everything but no early feedback on bad scenarios
- Both: belt and suspenders; slightly more code but safer

## Testing Requirements

### Unit Tests
- **COIN Control computation**: Given piece counts, correctly determine COIN vs uncontrolled
- **NVA Control computation**: Given piece counts, correctly determine NVA control
- **Total Support/Opposition**: Given marker states and populations, compute correct totals
- **Victory markers**: All 4 faction victory formulas compute correctly
- **Stacking max 2 bases**: Placement of 3rd base in province/city rejected
- **Stacking no bases on LoC**: Placement of base on LoC rejected
- **Stacking NV restriction**: Placement of US/ARVN piece in North Vietnam rejected
- **Dynamic sourcing available**: Pieces placed from available when available > 0
- **Dynamic sourcing map fallback**: Pieces taken from map when available = 0 (non-US-restricted)
- **Dynamic sourcing US exception**: US Troops/Bases not taken from map
- **Free operation**: Resource cost skipped, eligibility unchanged
- **Free operation exceptions**: Pacification/Agitation/Trail costs still apply

### Integration Tests
- `test/integration/fitl-derived-values.test.ts`: Victory metrics for all 4 factions across different board states
- `test/integration/fitl-stacking.test.ts`: Stacking violations detected at compile-time and runtime

## Acceptance Criteria

1. Victory metrics compute correctly for all 4 factions against known board states
2. Stacking violations rejected at both compile-time (scenario validation) and runtime (effect execution)
3. Dynamic piece sourcing works: available first, map fallback, US exception honored
4. Free operations don't cost resources or affect eligibility (except Pacification/Agitation/Trail)
5. Existing tests pass
6. Build passes (`npm run build`)
