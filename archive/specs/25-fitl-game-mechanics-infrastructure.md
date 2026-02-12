# Spec 25: FITL Game Mechanics Infrastructure

**Status**: COMPLETED
**Priority**: P0
**Complexity**: L
**Dependencies**: Spec 23 (map + pieces for testing)
**Estimated effort**: 4–5 days
**Source sections**: Brainstorming Sections 4.2 (items 6–8, 11), 5 (architectural decisions), 7.2, 7.7

## Overview

Implement cross-cutting mechanics that operations, special activities, events, and victory checks all depend on: derived value tracking, stacking enforcement, dynamic piece sourcing, free operations, and joint operation cost constraints. These are game-agnostic kernel/compiler features needed to express FITL rules declaratively.

## Scope

### In Scope

- **Derived value tracking**: Total Support, Total Opposition, COIN Control per space, NVA Control per space, Total Econ, victory markers. (Decision #1: on-demand computation.)
- **Stacking enforcement**: Max 2 Bases per Province/City, no Bases on LoCs, only NVA/VC in North Vietnam. (Decision #5: both compile-time and runtime.)
- **Dynamic piece sourcing** (Rule 1.4.1): Check available zone first, fallback to map. US Troops/Bases cannot be taken from map.
- **Free operations** (Rule 3.1.2): No resources, no eligibility impact. Pacification/Agitation/Trail still cost.
- **Joint operation cost constraint** (Rule 1.8.1): US operations spend ARVN Resources but cannot reduce them below Total Econ.

### Out of Scope

- RVN Leader effects (Spec 28)
- Individual operation/SA effects (Specs 26–27)
- Capabilities and momentum (Spec 28)
- Event card resolution (Spec 29)

## Key Types & Interfaces

### Derived Values

```typescript
// Computed from game state — not stored, computed on demand (Decision #1).
// These are expressible via existing aggregate + condition AST:
// { aggregate: { op: 'count', query: ... }, ... }
// { op: '>', left: ..., right: ... }
```

**Derived value definitions**:

- **COIN Control** (per space): count(US + ARVN pieces) > count(NVA + VC pieces)
- **NVA Control** (per space): count(NVA pieces) > count(all other pieces)
- **Total Support**: sum across all spaces of `population × support_multiplier`
- **Total Opposition**: sum across all spaces of `population × opposition_multiplier`
- **Total Econ**: sum of `MapSpaceDef.econ` for LoC spaces that are COIN-Controlled AND not sabotaged (no Terror marker on LoC). Used in Joint Operations (Task 25.5) and Coup Resource Phase.
- **Victory markers**: compound formulas per faction (see Derived Value Formulas below)

**Population multiplier table** (Rule 1.6.2):

| Marker State | Multiplier |
|---|---|
| Active Support / Active Opposition | 2 × population |
| Passive Support / Passive Opposition | 1 × population |
| Neutral (or opposite alignment) | 0 |

These multipliers apply to both Total Support and Total Opposition victory formulas.

**Sabotage exclusion**: A Terror marker on a LoC = Sabotage. Sabotaged LoCs are excluded from Total Econ computation. This matters because Terror markers can be placed on LoCs by VC Terror operations and some event cards.

### Derived Value Formulas

Concrete kernel AST representations for each derived value:

**COIN Control (per space)**:
```typescript
// condition: count(US+ARVN pieces in space) > count(NVA+VC pieces in space)
{
  op: '>',
  left: { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: spaceId }, /* filter: faction in ['US','ARVN'] */ } },
  right: { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: spaceId }, /* filter: faction in ['NVA','VC'] */ } }
}
```

**NVA Control (per space)**:
```typescript
// condition: count(NVA pieces in space) > count(non-NVA pieces in space)
{
  op: '>',
  left: { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: spaceId }, /* filter: faction == 'NVA' */ } },
  right: { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: spaceId }, /* filter: faction != 'NVA' */ } }
}
```

**Total Support**:
```typescript
// forEach over spaces, accumulate: population × support_multiplier
// Support multiplier = 2 if Active Support, 1 if Passive Support, 0 otherwise
// Expressible via forEach + let + addVar with conditional multiplier
```

**Total Opposition**:
```typescript
// Same pattern as Total Support with opposition marker states
```

**Victory formulas (per faction)**:
- **US Victory**: Total Support + count(tokens in `available:US`)
- **NVA Victory**: total population of NVA-Controlled spaces + count(NVA bases on map)
- **ARVN Victory**: total population of COIN-Controlled spaces + Patronage (global var)
- **VC Victory**: Total Opposition + count(VC bases on map)

**Total Econ**:
```typescript
// forEach over LoC spaces, filter: COIN-Controlled AND no Terror marker
// accumulate: sum of econ values
// Note: requires zone property access (econ) — may need OptionsQuery extension
// for filtering by space properties (spaceType, control status, marker presence)
```

> **Kernel extension note**: The `tokensInZone` query currently returns tokens but does not filter by token properties (e.g., faction). Several derived values above require counting faction-specific pieces. Consider adding a `filter` predicate to `OptionsQuery.tokensInZone` or providing a dedicated `countTokens` aggregate variant. Similarly, iterating over spaces with property filters (spaceType, control, markers) may require a new `OptionsQuery` variant or a `zones` query with extended filter predicates. Flag for implementation.

### Marker Lattice Shift Mechanism

Support/Opposition and Control markers are stored as integer zone variables indexing into `SpaceMarkerLatticeDef.states` (types.ts:592-597). The lattice is ordered: e.g., `['activeOpposition', 'passiveOpposition', 'neutral', 'passiveSupport', 'activeSupport']`.

**Shift mechanism**: An `addVar` effect with delta +1 or -1, clamped to `[0, states.length - 1]`:
- "Shift toward Active Support" = delta +1
- "Shift toward Active Opposition" = delta -1

The existing `addVar` effect (types.ts:102-108) with integer variable bounds clamping handles this naturally. **No new EffectAST type is needed.**

Operations like Pacify ("shift 1 level toward Active Support") and Agitate ("shift 1 level toward Active Opposition") map directly to `addVar` with delta +1/-1 on the space's support/opposition marker variable.

### Stacking Constraints

```typescript
// New type for declarative stacking rules (game-agnostic).
// spaceFilter mirrors the existing SpaceMarkerConstraintDef pattern (types.ts:585-590)
// extended with `country` to match MapSpaceDef.country.
interface StackingConstraint {
  readonly id: string;
  readonly description: string;
  readonly spaceFilter: {
    readonly spaceIds?: readonly string[];      // specific space IDs
    readonly spaceTypes?: readonly string[];    // match MapSpaceDef.spaceType
    readonly country?: readonly string[];       // match MapSpaceDef.country
    readonly populationEquals?: number;         // match MapSpaceDef.population
  };
  readonly pieceFilter: {
    readonly pieceTypeIds?: readonly string[];
    readonly factions?: readonly string[];      // player/faction IDs
  };
  readonly rule: 'maxCount' | 'prohibit';
  readonly maxCount?: number;  // for 'maxCount' rule
}
```

Example FITL stacking constraints:
1. Max 2 Bases per Province or City: `{ spaceFilter: { spaceTypes: ['province', 'city'] }, pieceFilter: { pieceTypeIds: ['base'] }, rule: 'maxCount', maxCount: 2 }`
2. No Bases on LoCs: `{ spaceFilter: { spaceTypes: ['loc'] }, pieceFilter: { pieceTypeIds: ['base'] }, rule: 'prohibit' }`
3. Only NVA/VC in North Vietnam: `{ spaceFilter: { country: ['northVietnam'] }, pieceFilter: { factions: ['US', 'ARVN'] }, rule: 'prohibit' }`

### Free Operation Flag

```typescript
// Extension to EffectContext (src/kernel/effect-context.ts)
interface EffectContext {
  // ... existing fields (def, adjacencyGraph, state, rng, activePlayer, actorPlayer, bindings, moveParams, maxEffectOps) ...
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

**Decision #1 resolved**: On-demand computation (see Decisions section).

**On-demand approach**:
- Derived values are computed by evaluating aggregate conditions against current game state
- No new state storage needed
- Already expressible via `ConditionAST` and `ValueExpr` with `aggregate`
- Performance acceptable for hundreds of queries per turn
- Benchmark post-MVP if computation per turn exceeds 10ms

Implementation: Ensure existing aggregate/condition infrastructure supports the required queries:
- Count pieces by faction in a zone (may require `tokensInZone` filter extension)
- Sum population × support/opposition multiplier across zones
- Compare faction piece counts for control determination
- Sum econ values for COIN-controlled, non-sabotaged LoCs (Total Econ)

### Task 25.2: Stacking Enforcement

**Decision #5 resolved**: Both compile-time and runtime (see Decisions section).
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

**Named Pattern: `sourcePiece`**

Since every placement operation uses the same sourcing logic, define it as a reusable named pattern (compiler macro) that Specs 26–27 reference instead of duplicating:

```
sourcePiece(faction, pieceType, targetZone):
  if count(available:{faction}, {pieceType}) > 0:
    moveToken from available:{faction} to {targetZone}
  else if faction != 'US' || pieceType not in ['troops', 'base']:
    moveToken from map to {targetZone}    // take from any map space (executing player chooses)
  else:
    skip  // US Troops/Bases cannot be taken from map
```

Consider implementing this as a compiler macro expansion so Game Spec authors write `sourcePiece(NVA, guerrilla, targetSpace)` and the compiler expands it to the full `if/then/else` EffectAST tree. This eliminates duplication across all operation and event card effect definitions.

### Task 25.4: Free Operation Flag

Add `freeOperation?: boolean` to `EffectContext` (src/kernel/effect-context.ts).

**Mechanism in `apply-move.ts`**: When `freeOperation: true`:
1. **Skip `costSpend` application** — the `costEffects` (apply-move.ts lines 191-193) are not applied. This is the operation-level resource deduction (e.g., ARVN Resources -= cost).
2. **Skip eligibility state change** — the faction remains eligible for the next card.

**What is NOT affected**: Resolution effects (including Pacify/Agitate shifts and Trail marker costs) execute normally because they are within the `resolutionStages` array, not in the operation-level `costSpend`. The `costSpend` vs `resolutionStages` separation already exists in the `OperationExecutionProfile` (apply-move.ts lines 76-82), so no effect-level tagging is needed.

**Integration**: Events that grant free operations (e.g., certain event cards) set `freeOperation: true` on the `EffectContext` before invoking the operation.

### Task 25.5: Joint Operation Cost Constraint

**Rule 1.8.1**: The US faction does not track its own Resources. When US executes operations, it spends ARVN Resources — but only those exceeding Total Econ. This is a cross-cutting constraint affecting US Train, US Patrol, US Sweep, and US Assault.

**Pre-condition**: `ARVN_Resources - cost >= Total_Econ`

**Implementation**:
- Maps to `costValidation` in `OperationProfileDef` (apply-move.ts:89). The `costValidation` condition evaluates whether `ARVN_Resources - operationCost >= Total_Econ` before allowing cost spend.
- When validation fails and `partialExecution.mode === 'forbid'`, the operation is blocked entirely.
- Spec 26 US operation profiles will define this constraint in their `cost.validate` field.

**Total Econ dependency**: This constraint requires Total Econ to be computable (Task 25.1). Total Econ = sum of `econ` for COIN-controlled, non-sabotaged LoCs.

**Tests**:
- US cannot spend ARVN Resources below Total Econ
- US can spend exactly to Total Econ (ARVN_Resources - cost == Total_Econ passes)
- Non-US factions are not affected by this constraint
- Free operations (Task 25.4) bypass this check along with all cost spending

## Decisions (Formerly Open Questions)

### Decision #1: On-Demand Derived Value Computation ✅

**Decision**: On-demand computation for MVP. Benchmark post-MVP if needed.

**Rationale**: The kernel uses immutable state — every state transition returns a new `GameState` object. Caching derived values would require either (a) mutability in `GameState`, contradicting the immutable architecture, or (b) full recomputation on every state change, which defeats the purpose of caching. On-demand computation is architecturally consistent, simpler, and avoids invalidation bugs. If benchmarks after Milestone C show computation per turn exceeds 10ms for full 130-card games, caching can be added as a pure performance optimization without changing the API.

### Decision #5: Both Compile-Time and Runtime Stacking Enforcement ✅

**Decision**: Both compile-time (scenario validation) and runtime (effect execution).

**Rationale**: Compile-time catches scenario authoring errors early (e.g., initial placement violates stacking). Runtime catches effect bugs during gameplay (e.g., an operation places a 3rd base). Both approaches are viable independently, but together they provide belt-and-suspenders safety with minimal additional code. No remaining debate on this approach.

## Testing Requirements

### Unit Tests
- **COIN Control computation**: Given piece counts, correctly determine COIN vs uncontrolled
- **NVA Control computation**: Given piece counts, correctly determine NVA control
- **Total Support/Opposition**: Given marker states and populations, compute correct totals (using population multiplier table: Active=2x, Passive=1x, Neutral=0)
- **Total Econ**: Sum of econ for COIN-controlled, non-sabotaged LoCs computes correctly
- **Total Econ sabotage**: LoC with Terror marker excluded from Total Econ
- **Victory markers**: All 4 faction victory formulas compute correctly
- **Stacking max 2 bases**: Placement of 3rd base in province/city rejected
- **Stacking no bases on LoC**: Placement of base on LoC rejected
- **Stacking NV restriction**: Placement of US/ARVN piece in North Vietnam rejected
- **Dynamic sourcing available**: Pieces placed from available when available > 0
- **Dynamic sourcing map fallback**: Pieces taken from map when available = 0 (non-US-restricted)
- **Dynamic sourcing US exception**: US Troops/Bases not taken from map
- **Free operation**: Resource cost (`costSpend`) skipped, eligibility unchanged
- **Free operation resolution**: Pacification/Agitation/Trail costs within resolution stages still apply
- **Joint operation cost validation**: US cannot spend ARVN Resources below Total Econ
- **Joint operation boundary**: US can spend exactly to Total Econ (passes)
- **Joint operation non-US**: Non-US factions unaffected by Joint Operations constraint
- **Lattice marker shift**: `addVar` with delta +/-1 correctly shifts marker state, clamped to lattice bounds

### Integration Tests
- `test/integration/fitl-derived-values.test.ts`: Victory metrics for all 4 factions across different board states
- `test/integration/fitl-stacking.test.ts`: Stacking violations detected at compile-time and runtime
- `test/integration/fitl-joint-operations.test.ts`: US operations correctly constrained by Total Econ

### Test Data
Use production FITL data from `data/games/fire-in-the-lake.md` via the `parseGameSpec` pipeline for realistic derived value testing rather than toy fixtures. Reference scenario starting values (e.g., Short scenario: Total Econ 15) as golden test data. Production data is already validated by `test/unit/fitl-production-*.test.ts`.

## Acceptance Criteria

1. Victory metrics compute correctly for all 4 factions against known board states
2. Stacking violations rejected at both compile-time (scenario validation) and runtime (effect execution)
3. Dynamic piece sourcing works: available first, map fallback, US exception honored
4. Free operations don't cost resources or affect eligibility; resolution effects (Pacify/Agitate/Trail) still apply
5. Total Econ computes correctly for known board states (COIN-controlled, non-sabotaged LoCs)
6. Joint Operations cost constraint enforced (US cannot spend ARVN Resources below Total Econ)
7. Lattice marker shift works via `addVar` with clamping to lattice bounds
8. Existing tests pass
9. Build passes (`npm run build`)

## Outcome

- **Completed**: 2026-02-12
- **Changes**: All 7 FITLMECHINF tickets (001–007) implemented: token filter extension, derived value helpers, stacking constraints (compile-time + runtime), free operation flag, joint operation cost constraint, dynamic piece sourcing verification, and lattice shift verification. Tests added across unit and integration suites.
- **Deviations**: Dynamic piece sourcing and lattice shift (Tasks 25.3/marker lattice) confirmed expressible with existing AST — no kernel changes needed. Derived values implemented as on-demand computation per Decision #1.
- **Verification**: `npm run build` and `npm test` pass.
