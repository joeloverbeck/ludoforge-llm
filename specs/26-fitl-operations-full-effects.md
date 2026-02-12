# Spec 26: FITL Operations Full Effects

**Status**: Draft (prerequisites complete)
**Priority**: P0
**Complexity**: XL
**Dependencies**: Spec 23 (map + pieces), Spec 25 (derived values, stacking, dynamic sourcing, free ops), **Spec 25a (kernel operation primitives — COMPLETED)**
**Estimated effort**: 5–7 days
**Source sections**: Brainstorming Sections 4.2 (items 1, 3–5), 5.3, 7.4, 7.6

## Overview

Replace the 8 stub operation profiles with complete effect resolution. Establish multi-space targeting, piece removal ordering, and the operation/SA interleaving architecture. This is the largest and highest-risk spec in the FITL implementation.

## Kernel Prerequisites (Spec 25a — Completed)

All kernel primitive gaps identified during spec analysis have been implemented:

1. **Compound token filtering** — `filter` on `tokensInZone`/`tokensInAdjacentZones` accepts array of predicates (AND-conjunction)
2. **Binding query** — `{ query: 'binding', name: string }` in `OptionsQuery` enables `forEach` over `chooseN` selections
3. **setTokenProp** — In-place token property mutation (e.g., flip guerrillas underground/active)
4. **rollRandom** — Deterministic random number generation with let-like scoping
5. **Marker lattice** — `setMarker`/`shiftMarker` effects with lattice validation, `markerState` reference, Zobrist hashing
6. **Typed OperationProfileDef** — `legality`, `cost`, `targeting`, `resolution` use typed interfaces instead of Record<string, unknown>
7. **Compound Move** — `Move.compound` field for SA interleaving with `before`/`during`/`after` timing

## Scope

### In Scope

- **4 COIN Operations**: Train (with Pacification sub-action), Patrol, Sweep, Assault
- **4 Insurgent Operations**: Rally, March, Attack, Terror
- **Multi-space operations**: Player selects N spaces → pays cost per space → resolves per space
- **Piece removal ordering**: Troops first, Active Guerrillas next, Bases last (only when no Guerrillas remain). Underground Guerrillas protect Bases. Tunneled Bases require die roll.
- **Operation/SA interleaving** (Rule 4.1): SA "before, during, or after" accompanying Operation (Open Question #6)
- **Cost formulas**: Per-operation resource costs (e.g., Train costs 3 ARVN Resources per space)
- **Effect resolution**: Placement, movement, removal, activation, flipping per operation rules

### Out of Scope

- Capability/momentum modifiers on operations (Spec 28 — adds conditional branches)
- Non-player operation selection logic (Spec 30)
- Special activity effect implementations (Spec 27 — but interleaving architecture is owned here)
- Event-granted free operations (Spec 25 provides the flag; Spec 29 encodes the events)

## Key Types & Interfaces

### Multi-Space Pattern

Already in `EffectAST` — `chooseN` selects spaces, `forEach` resolves per space:

```typescript
// Step 1: Player chooses target spaces
{ chooseN: {
    bind: 'targetSpaces',
    options: { query: 'zones', filter: { /* legality conditions */ } },
    min: 1,
    max: /* operation-specific limit */
}}

// Step 2: Pay cost and resolve per space
{ forEach: {
    bind: 'space',
    over: { query: 'binding', name: 'targetSpaces' },
    effects: [
      // pay resource cost per space
      // resolve operation in space
    ]
}}
```

### Piece Removal Ordering Pattern

Sequential `forEach` with priority and remaining-damage tracking via `let`:

```typescript
// Step 1: Count damage (e.g., US+ARVN pieces for Assault)
{ let: { bind: 'damage', value: { /* damage formula */ } } }

// Step 2: Remove Troops first (decrement damage)
{ forEach: { bind: 'target', over: { query: 'tokensInZone', zone: '$space', filter: { type: 'troops', faction: 'NVA' } },
    effects: [{ if: { when: { op: '>', left: { ref: 'damage' }, right: 0 },
      then: [{ remove: ... }, { setVar: { var: 'damage', delta: -1 } }] }}]
}}

// Step 3: Remove Active Guerrillas (decrement damage)
// Step 4: Remove Bases only if no Guerrillas remain
// Step 5: Tunneled Bases: die roll check
```

### Operation/SA Interleaving (Open Question #6)

**Recommended approach**: Composite Action Model

The operation execution is modeled as a composite with named phases:
1. **Pre-phase**: SA may execute here ("before")
2. **Space selection**: Choose target spaces
3. **Per-space resolution**: For each space, SA may execute here ("during")
4. **Post-phase**: SA may execute here ("after")

The player chooses when to insert their SA. This may require a new `CompositeActionDef` or extension to `OperationProfileDef`:

```typescript
interface OperationProfileDef {
  // ... existing fields ...
  readonly saInsertionPoints?: readonly ('before' | 'during' | 'after')[];
}
```

**Alternative**: Phase-based approach where operations and SAs are separate action phases in a turn's action sequence. Simpler but less flexible.

**Resolved**: Compound Move model with `Move.compound` field. See Spec 25a.

> **Deferred from Spec 25a**: The compound move *execution* infrastructure (`applyMove` handling for `before`/`during`/`after` timing) is complete. However, **compound move variant enumeration in `legal-moves.ts`** was not implemented — `legal-moves.ts` does not yet read `linkedSpecialActivityWindows` to generate compound `Move` objects. This must be implemented as part of Task 26.1 below.

## Implementation Tasks

### Task 26.1: Operation/SA Interleaving — Legal Move Enumeration

**Prerequisite work from Spec 25a is done** (compound Move types, schemas, applyMove execution). This task completes the interleaving model by implementing **compound move generation in `legal-moves.ts`**.

Key work:
- Read `linkedSpecialActivityWindows` from `OperationProfileDef` to discover which SAs pair with which operations
- For each legal operation move, enumerate compound variants combining it with each legal SA move at each valid timing (`before`/`during`/`after`)
- Limited Operations (1 space, no SA) must NOT generate compound variants
- Free operations must NOT have compound SA

Modify:
- `src/kernel/legal-moves.ts` — generate compound move variants from `linkedSpecialActivityWindows`

Tests:
- Legal move generation includes compound variants when SA windows exist
- Free operations cannot have compound SA
- Limited operations do not generate compound variants
- Non-compound moves still generated alongside compound variants

### Task 26.2: COIN Operations — Train

**Rule 3.2.1**: Select any Cities/Provinces (no limit). Per space: place ARVN cubes (City: up to 6, Province: up to 2 from any single piece type) or Rangers (up to 2) from Available. Cost: 3 ARVN Resources per space.

**Pacification sub-action** (Rule 3.2.1 / 6.3.1): In 1 Train space with ARVN Troops+Police and COIN Control, shift Support 1 level toward Active Support. Cost: 3 ARVN Resources per level.

### Task 26.3: COIN Operations — Patrol

**Rule 3.2.2**: Select any LoCs (no limit). Move cubes along adjacent LoCs. Activate Guerrillas in patrolled LoCs if cube count ≥ 2. Cost: 3 ARVN Resources per LoC.

### Task 26.4: COIN Operations — Sweep

**Rule 3.2.3**: Select any spaces (no limit). Move cubes into adjacent spaces. Activate 1 Underground Guerrilla per 2 cubes (Highland/Jungle) or per 1 cube (other terrain). Cost: 3 ARVN Resources per space.

### Task 26.5: COIN Operations — Assault

**Rule 3.2.4**: Select any spaces with COIN forces (no limit). Remove enemy pieces up to the number of Assaulting pieces. **Piece removal ordering** applies. Underground Guerrillas immune. Tunneled Bases: die roll (1–3 nothing, 4–6 remove tunnel marker). Cost: 3 ARVN Resources per space.

### Task 26.6: Insurgent Operations — Rally

**Rule 3.3.1**: Select spaces with faction's Base or 2+ faction's Guerrillas. Place Guerrillas from Available. If space has Base, may also: NVA place Troops, VC flip to Underground. Trail level affects NVA Rally (Trail ≥ 3: may improve Trail by 1). Cost: 1 Resource per space.

### Task 26.7: Insurgent Operations — March

**Rule 3.3.2**: Select Guerrillas/Troops to move into adjacent spaces. Guerrillas that March into spaces with enemy pieces become Active. Cost: 1 Resource per destination space.

### Task 26.8: Insurgent Operations — Attack

**Rule 3.3.3**: Select spaces with Guerrillas. Remove 1 enemy piece per 2 Attacking Guerrillas (rounded down). Attacker loses 1 Guerrilla to Casualties per Attack. **Piece removal ordering** applies. Cost: 1 Resource per space.

### Task 26.9: Insurgent Operations — Terror

**Rule 3.3.4**: Select spaces with Underground Guerrilla. Place Terror marker. Shift Support/Opposition 1 level toward Active Opposition. Flip 1 Guerrilla Active. LoC Terror = Sabotage (affects Econ). Cost: 1 Resource per space.

### Task 26.10: Multi-Space Targeting Validation

Verify that `chooseN` + `forEach` patterns work correctly for all 8 operations:
- Space selection with operation-specific filters
- Per-space cost deduction
- Per-space effect resolution
- Early termination when resources run out

### Task 26.11: Piece Removal Ordering Implementation

Implement the removal ordering pattern for Assault and Attack:
1. NVA Troops first
2. Active NVA Guerrillas, then Active VC Guerrillas
3. Bases only if no Guerrillas remain
4. Underground Guerrillas immune
5. Tunneled Bases: die roll check

Verify the pattern is expressible with existing `forEach` + `let` + `if` + filter semantics. If not, propose minimal kernel extension.

## Open Questions

### Open Question #6: Operation/SA Interleaving Model

**This is the highest-risk architectural decision in the FITL implementation.**

Rule 4.1 states SA may occur "immediately before, during, or immediately after" its accompanying Operation. This creates a mid-operation interruption point.

**Option A: Composite Action Model** (recommended)
- Operation defines named phases with SA insertion points
- Player chooses insertion point when selecting SA
- Phases execute in order with SA slotted in
- Pro: flexible, declarative, matches game rules closely
- Con: new execution model concept needed

**Option B: Phase-Based Turn Sequence**
- Turn consists of separate phases: [pre-SA?, operation-spaces, per-space-resolution, post-SA?]
- Player commits to SA timing before operation begins
- Pro: simpler execution model
- Con: "during" (between per-space resolutions) harder to express

**Option C: Callback/Hook Model**
- Operation effects emit "insertion point" signals
- Turn flow checks if SA should execute at each signal
- Pro: most flexible
- Con: most complex, harder to reason about

## Testing Requirements

### Unit Tests
- Each operation: given valid inputs, produces correct state changes
- Multi-space: cost deducted per space, effects applied per space
- Piece removal ordering: correct priority followed
- Underground Guerrilla immunity in Assault/Attack
- Tunneled Base die roll (deterministic via seeded PRNG)
- Limited Operation: 1 space, no SA allowed

### Integration Tests
- Update existing: `test/integration/fitl-coin-operations.test.ts` — full effects replace stubs
- Update existing: `test/integration/fitl-insurgent-operations.test.ts` — full effects replace stubs
- New: multi-space targeting tests
- New: piece removal ordering tests
- New: operation/SA interleaving tests

## Acceptance Criteria

1. All 8 operations have complete effect implementations — no stubs remain
2. Multi-space targeting works via `chooseN` + `forEach` pattern
3. Piece removal follows ordering constraints for Assault and Attack
4. Operation/SA interleaving model is implemented and documented (including compound variant enumeration in `legal-moves.ts`)
5. Underground Guerrillas immune to Assault/Attack removal
6. Tunneled Base die roll logic correct (deterministic via PRNG)
7. All existing integration tests pass or are updated
8. Build passes (`npm run build`)
