# Spec 51 — Cross-Game Primitive Elevation

**Status**: DRAFT
**Priority**: P1 (architecture quality, spec authoring ergonomics, correctness)
**Complexity**: XL
**Dependencies**: None (all changes extend existing compiler/kernel)
**Affects**: GameSpecDoc format, compiler pipeline, kernel action resolution, kernel draw effect, both game specs (FITL + Texas Hold'em), JSON Schema, tests
**No backwards compatibility**: Clean breaks. Existing game specs must be migrated to new patterns.

## Problem Statement

Both game implementations (Fire in the Lake and Texas Hold'em) exhibit cross-cutting patterns that are expressed ad-hoc — through repetitive YAML, manual macro calls, and runtime workarounds. These patterns are game-agnostic enough to be elevated into first-order primitives, but currently force every game author to reinvent them.

The problems fall into three categories:

### Spec authoring verbosity

| Game | Pattern | Current Cost |
|------|---------|-------------|
| Texas Hold'em | 52 individually defined piece types | ~200 lines of repetitive YAML |
| FITL | 20 identical 3-state capability markers | ~60 lines of repetitive YAML |
| FITL | 13 identical operation counter variables | ~65 lines of repetitive YAML |
| FITL | ~18 identical momentum flag variables | ~54 lines of repetitive YAML |
| FITL | 8 hand-typed per-faction zones | ~40 lines of repetitive YAML |
| Texas Hold'em | 3 near-identical betting street phases | ~60% duplicated phase YAML |

### Runtime correctness / error-proneness

| Game | Pattern | Risk |
|------|---------|------|
| Texas Hold'em | All 5 betting actions end with same 3 cleanup macros | Forgetting a macro = silent bug (betting round doesn't advance) |
| FITL | Operations manually call counter-update/eligibility macros | Forgetting a macro = incorrect operation counts, stale eligibility |
| Texas Hold'em | `handActive && !allIn && !eliminated` repeated in every action's `pre` | Copy-paste drift between actions = inconsistent legality |
| FITL | Eligibility checks repeated across operations | Same risk |

### Conceptual expressiveness

| Game | Pattern | Gap |
|------|---------|-----|
| Both | Manual shuffle → draw → discard zone orchestration | The DSL says "moveToken" when the designer thinks "deal from deck" |
| Texas Hold'em | `zoneExpr: { concat: ['hand:', ...] }` for per-player zones | Runtime string concat where compile-time zone expansion suffices |

## Architecture: Three-Layer Model

Primitives are elevated into the appropriate layer based on their nature:

| Layer | What lives here | Who understands it | Change type |
|-------|----------------|-------------------|-------------|
| **Kernel** | EffectAST, ConditionAST, GameState evaluation, action resolution | The runtime engine | New optional fields on existing types; modified action resolution loop and draw effect handler |
| **Compiler** | Expansion passes, validation, lowering to GameDef | The build pipeline | New `expandTemplates()` orchestrator with 5 expansion passes, inserted before `expandConditionMacros` in `compileGameSpecToGameDef` |
| **GameSpecDoc** | Per-game macros, data assets, rules | Individual game authors | New YAML patterns that trigger compiler expansion |

**Principle**: A pattern belongs at kernel level only when the desired runtime behavior cannot be cleanly composed from existing primitives, or when composition is so error-prone that semantic awareness prevents bugs. All other patterns belong at compiler level and compile away completely — the GameDef has no trace of them.

---

## Part A: Compiler-Level Templates

Five new compiler expansion passes. Each recognizes a YAML pattern in GameSpecDoc and expands it into existing primitive declarations before macro expansion runs.

### A1. Combinatorial Piece Generation

**Problem**: Texas Hold'em defines 52 cards individually. Any card game with a standard deck (or any game with piece types that are a cartesian product of dimensions) faces this.

**GameSpecDoc syntax**:

```yaml
# Inside a pieceCatalog data asset's payload.pieceTypes array
pieceTypes:
  - generate:
      idPattern: "card-{rankName}{suitAbbrev}"
      seat: neutral
      statusDimensions: []
      transitions: []
      dimensions:
        - name: suit
          values: [0, 1, 2, 3]
        - name: rank
          values: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
      derivedProps:
        suitName:
          from: suit
          map: { 0: Spades, 1: Hearts, 2: Diamonds, 3: Clubs }
        suitAbbrev:
          from: suit
          map: { 0: S, 1: H, 2: D, 3: C }
        rankName:
          from: rank
          map: { 11: J, 12: Q, 13: K, 14: A }
          default: "{rank}"
      inventoryPerCombination: 1
```

**Expansion behavior**:

1. Compute the cartesian product of all `dimensions[].values` arrays.
2. For each combination, evaluate `derivedProps`: look up the dimension value in `map`; if not found, use `default` (with `{dimensionName}` template substitution); if no default, use the raw value.
3. Generate a `pieceType` entry with:
   - `id` from `idPattern` with `{dimensionName}` and `{derivedPropName}` substituted
   - `seat`, `statusDimensions`, `transitions` copied from the `generate` block
   - `runtimeProps` containing all dimension values and derived prop values
4. Generate an `inventory` entry per piece type with `total: inventoryPerCombination`.

**Validation**:
- `idPattern` must contain at least one `{...}` placeholder
- All `{...}` placeholders in `idPattern` must reference a dimension name or derived prop name
- `derivedProps[].from` must reference a declared dimension name
- Generated IDs must be unique (error if cartesian product + pattern produces duplicates)
- `dimensions` must have at least 1 entry with at least 1 value

**Example expansion** (first 2 of 52):

```yaml
# Input: generate block above
# Output:
- id: card-2S
  seat: neutral
  statusDimensions: []
  transitions: []
  runtimeProps: { suit: 0, rank: 2, suitName: Spades, suitAbbrev: S, rankName: "2" }
- id: card-3S
  seat: neutral
  statusDimensions: []
  transitions: []
  runtimeProps: { suit: 0, rank: 3, suitName: Spades, suitAbbrev: S, rankName: "3" }
# ... 50 more ...
```

**FITL applicability**: Faction pieces could use this if they follow a regular pattern (e.g., `troops-{faction}` × `{faction: [US, ARVN, NVA, VC]}`). Not required — FITL pieces have per-faction property differences that may make individual declarations clearer.

---

### A2. Batch Marker Declarations

**Problem**: FITL defines 20 capability markers with identical `states` and `defaultState`.

**GameSpecDoc syntax**:

```yaml
globalMarkerLattices:
  # Batch form
  - batch:
      ids: [cap_topGun, cap_arcLight, cap_abrams, cap_cobras, cap_cords, cap_lgbs,
            cap_searchAndDestroy, cap_aaa, cap_longRangeGuns, cap_migs, cap_sa2s,
            cap_pt76, cap_armoredCavalry, cap_mandateOfHeaven, cap_boobyTraps,
            cap_mainForceBns, cap_cadres, cap_medevac, cap_claymores, cap_ironTriangle]
      states: [inactive, unshaded, shaded]
      defaultState: inactive
  # Individual form (still supported)
  - id: activeLeader
    states: [minh, khanh, youngTurks, ky, thieu]
    defaultState: minh
```

**Expansion behavior**: For each `id` in `batch.ids`, emit an individual marker declaration with the shared `states` and `defaultState`.

**Validation**:
- `batch.ids` must be non-empty
- All IDs in `batch.ids` must be unique (and unique across all marker declarations in the spec)
- `batch.defaultState` must be present in `batch.states`

**Scope**: `globalMarkerLattices` only. Space markers (`markerLattices`) live inside `MapPayload` data assets and are not a top-level `GameSpecDoc` field — batch expansion does not apply to them.

---

### A3. Batch Variable Declarations

**Problem**: FITL defines 13 operation counters and ~18 momentum flags with identical type/init/bounds.

**GameSpecDoc syntax**:

```yaml
globalVars:
  # Batch integer counters
  - batch:
      names: [trainCount, patrolCount, sweepCount, assaultCount, rallyCount,
              marchCount, attackCount, infiltrateCount, ambushCount,
              bombardCount, subvertCount, taxCount, raidCount]
      type: int
      init: 0
      min: 0
      max: 20
  # Batch boolean flags
  - batch:
      names: [mom_wildWeasels, mom_adsid, mom_rollingThunder, mom_medevacUnshaded,
              mom_medevacShaded, mom_bodyCount, mom_claymoresUnshaded, mom_claymoresShaded,
              mom_cobrasUnshaded, mom_cobrasShaded, mom_cords, mom_lgbs, mom_aaa,
              mom_longRangeGuns, mom_migs, mom_sa2s, mom_mainForceBns, mom_boobyTraps]
      type: boolean
      init: false
  # Individual form (still supported)
  - name: pot
    type: int
    init: 0
    min: 0
    max: 10000000
```

**Expansion behavior**: For each `name` in `batch.names`, emit an individual variable declaration with the shared type and bounds. For boolean batches, `min`/`max` are omitted (not applicable).

**Validation**:
- `batch.names` must be non-empty
- All names must be unique across all variable declarations
- `batch.type` must be `int` or `boolean`
- For `int` batches: `init` must be within `[min, max]`

**Also applies to**: `perPlayerVars` — same `batch` syntax.

---

### A4. Per-Player Zone Templates

**Problem**: FITL hand-types 8 per-faction zones following a `{prefix}-{seatId}` naming pattern. Texas Hold'em uses runtime `zoneExpr: { concat: [...] }` to reference per-player hand zones.

**GameSpecDoc syntax**:

```yaml
zones:
  # Template form — expands once per seat
  - template:
      idPattern: "available-{seat}"
      perSeat: true
      owner: none
      visibility: public
      ordering: set
  - template:
      idPattern: "out-of-play-{seat}"
      perSeat: true
      owner: none
      visibility: public
      ordering: set
  - template:
      idPattern: "hand-{seat}"
      perSeat: true
      owner: player
      visibility: owner
      ordering: set
  # Individual form (still supported)
  - id: deck
    owner: none
    visibility: hidden
    ordering: stack
```

**Expansion behavior**:

1. Pre-scan `doc.dataAssets` for assets with `kind === 'seatCatalog'` and read `payload.seats[].id` to resolve seat IDs (e.g., `['US', 'ARVN', 'NVA', 'VC']` for FITL, `['0', '1', ..., '9']` for Texas Hold'em). This follows the same resolution pattern as `SeatIdentityContract` (`cnl/seat-identity-contract.ts`). If no `seatCatalog` data asset exists, emit a diagnostic error.
2. For each seat, substitute `{seat}` in `idPattern` to produce a concrete zone ID.
3. Emit an individual zone declaration with the template's properties.
4. If `owner: player`, set the zone's owner to the corresponding seat.

**Validation**:
- `idPattern` must contain `{seat}`
- `perSeat: true` is required (future: could support `perTeam` or other groupings)
- Generated zone IDs must not collide with individually declared zones

**Migration note**: Texas Hold'em's `zoneExpr: { concat: ['hand:', ...] }` references throughout the spec would change to direct zone ID references (e.g., `hand-0`, `hand-1`). This eliminates all runtime string concatenation for zone resolution.

---

### A5. Parameterized Phase Templates

**Problem**: Texas Hold'em's flop, turn, and river phases share ~90% of their `onEnter` logic. FITL's coup sub-phases share reset patterns.

**GameSpecDoc syntax**:

```yaml
phaseTemplates:
  - id: bettingStreet
    params:
      - name: phaseId
      - name: handPhaseValue
      - name: cardCount
    phase:
      id: "{phaseId}"
      onEnter:
        - setVar: { scope: global, var: handPhase, value: "{handPhaseValue}" }
        - macro: deal-community
          args: { count: "{cardCount}" }
        - macro: reset-reopen-state-for-live-seats
        - forEach:
            bind: $player
            over: { query: players }
            effects:
              - if:
                  when:
                    op: and
                    args:
                      - { op: '==', left: { ref: pvar, player: { chosen: '$player' }, var: eliminated }, right: false }
                      - { op: '==', left: { ref: pvar, player: { chosen: '$player' }, var: handActive }, right: true }
                  then:
                    - setVar: { scope: pvar, player: { chosen: '$player' }, var: streetBet, value: 0 }
        - setVar: { scope: global, var: currentBet, value: 0 }
        - setVar: { scope: global, var: bettingClosed, value: false }
        - macro: find-next-to-act
          args: { fromSeat: { ref: gvar, var: dealerSeat } }
        - if:
            when: { op: '==', left: { ref: gvar, var: bettingClosed }, right: true }
            then:
              - macro: advance-after-betting

turnStructure:
  phases:
    - id: hand-setup
      onEnter: [...]
    - id: preflop
      onEnter: [...]
    - fromTemplate: bettingStreet
      args: { phaseId: flop, handPhaseValue: 1, cardCount: 3 }
    - fromTemplate: bettingStreet
      args: { phaseId: turn, handPhaseValue: 2, cardCount: 1 }
    - fromTemplate: bettingStreet
      args: { phaseId: river, handPhaseValue: 3, cardCount: 1 }
    - id: showdown
      onEnter: [...]
    - id: hand-cleanup
      onEnter: [...]
```

**Expansion behavior**:

1. For each `fromTemplate` in the phases array, look up the referenced `phaseTemplates` entry by ID.
2. Substitute each `"{paramName}"` occurrence in the template's `phase` body with the corresponding value from `args`.
3. Parameter substitution is simple string replacement on scalar values — no expression evaluation.
4. Emit the expanded phase definition in place of the `fromTemplate` entry.

**Validation**:
- `fromTemplate` must reference a declared `phaseTemplates` entry
- All `params` declared in the template must be provided in `args`
- No extra `args` keys beyond declared `params`
- Expanded phase IDs must be unique

**FITL applicability**: Coup sub-phases that share reset patterns (resetting markers, clearing counters) could share a template with per-phase parameters.

---

### Compiler Pass Ordering

All five passes run **before `expandConditionMacros`** in `compileGameSpecToGameDef` (`compiler-core.ts`), since condition/effect macros and zone macros may reference entities produced by template expansion.

A new `expandTemplates(doc)` orchestrator function (in a new file `packages/engine/src/cnl/expand-templates.ts`) calls A1-A5 sequentially and returns the expanded `GameSpecDoc`. This is inserted as the first step in `compileGameSpecToGameDef`:

```
compileGameSpecToGameDef(doc)
  → expandTemplates(doc)           ← NEW orchestrator
      → expandPieceGeneration      (A1)
      → expandBatchMarkers         (A2)
      → expandBatchVars            (A3)
      → expandZoneTemplates        (A4) — pre-scans seatCatalog data assets for seat IDs
      → expandPhaseTemplates       (A5)
  → expandConditionMacros          (existing)
  → expandEffectMacros             (existing)
  → expandMacros                   (existing: expandZoneMacros + expandEffectSections)
  → compileExpandedDoc             (existing)
```

Passes A1-A3 have no dependencies on each other and could run in any order. A4 depends on seat IDs being available (pre-scanned from `seatCatalog` data assets). A5 has no dependencies but logically runs last among the new passes (phase templates may reference zones or variables produced by earlier passes). The `expandTemplates` orchestrator collects diagnostics from all five passes and propagates them alongside the existing diagnostic pipeline.

---

## Part B: Kernel-Level Primitives

Two new kernel concepts. Both are additive — games that don't use them see zero behavior change.

### B1. Phase Action Defaults

**Problem**: Both games repeat the same preconditions and post-effects across every action in a phase. Forgetting a cleanup macro call produces silent bugs.

**GameDef type change**:

```typescript
// In PhaseDef (types-core.ts) — showing complete current type with addition
interface PhaseDef {
  readonly id: PhaseId;
  readonly onEnter?: readonly EffectAST[];
  readonly onExit?: readonly EffectAST[];
  // NEW:
  readonly actionDefaults?: {
    readonly pre?: ConditionAST;          // ANDed with each action's own pre
    readonly afterEffects?: readonly EffectAST[];  // Run after each action's effects
  };
}
```

**GameSpecDoc syntax**:

```yaml
turnStructure:
  phases:
    - id: preflop
      actionDefaults:
        pre:
          op: and
          args:
            - { op: '==', left: { ref: pvar, player: actor, var: handActive }, right: true }
            - { op: '==', left: { ref: pvar, player: actor, var: allIn }, right: false }
            - { op: '==', left: { ref: pvar, player: actor, var: eliminated }, right: false }
        afterEffects:
          - macro: mark-preflop-big-blind-acted
          - macro: betting-round-completion
          - macro: advance-after-betting
      onEnter: [...]
```

**Kernel behavior changes**:

#### Legal move enumeration (`legalMoves` / `legal-moves.ts`)

When computing legal moves for actions in a phase:

1. If the phase has `actionDefaults.pre`, evaluate it first (with `actor` bound to the candidate player).
2. If the phase default fails, the action is **immediately illegal** — skip evaluating the action's own `pre`. This is a performance optimization (phase default is a cheaper shared check).
3. If the phase default passes, evaluate the action's own `pre` as usual.
4. An action's `pre` of `null` or `true` means "no additional precondition beyond the phase default."

#### Action resolution (`applyMove` / `apply-move.ts`)

When applying a move:

1. Execute the action's own `effects` as today.
2. If the action's phase has `actionDefaults.afterEffects`, execute them in the resulting state.
3. `afterEffects` run as part of the same state transition — they see the state after the action's effects.
4. Triggers fire after both the action's effects and the phase's `afterEffects` have completed.

#### Edge case: phase transitions in effects

If an action's effects (or `afterEffects`) include `gotoPhaseExact` or `advancePhase`:

- `afterEffects` of the **originating** phase still run to completion. They are logically part of the action resolution, not the phase lifecycle.
- The new phase's `onEnter` runs after the entire action resolution (including `afterEffects`) completes.
- Rationale: `afterEffects` are "cleanup for this action" — they should always run regardless of phase transitions. This matches how Texas Hold'em works: `advance-after-betting` (which may change phases) is always the last step.

#### Interaction with phase templates (A5)

Phase templates can declare `actionDefaults`. When a template is instantiated, the `actionDefaults` are copied into the concrete phase. If multiple betting phases share the same template, they all get the same defaults — which is the desired behavior.

---

### B2. Zone Behaviors (Deck Semantics)

**Problem**: Both games manually orchestrate card lifecycle across separate zones (shuffle, draw-from-top, discard, reshuffle-when-empty). Every card/deck game will reinvent this pattern.

**GameDef type change**:

```typescript
// In ZoneDef (types-core.ts) — showing complete current type with addition
interface ZoneDef {
  readonly id: ZoneId;
  readonly zoneKind?: 'board' | 'aux';
  readonly isInternal?: boolean;
  readonly ownerPlayerIndex?: number;
  readonly owner: 'none' | 'player';
  readonly visibility: 'public' | 'owner' | 'hidden';
  readonly ordering: 'stack' | 'queue' | 'set';
  readonly adjacentTo?: readonly ZoneAdjacency[];
  readonly category?: string;
  readonly attributes?: Readonly<Record<string, AttributeValue>>;
  // NEW:
  readonly behavior?: ZoneBehavior;
  // Future: ZoneBehavior = DeckBehavior | MarketBehavior | ...
}

type ZoneBehavior = DeckBehavior;

interface DeckBehavior {
  readonly type: 'deck';
  readonly drawFrom: 'top' | 'bottom' | 'random';
  readonly reshuffleFrom?: ZoneId;  // Zone ID to recycle from when deck is empty
}
```

**GameSpecDoc syntax**:

```yaml
zones:
  - id: deck
    owner: none
    visibility: hidden
    ordering: stack
    behavior:
      type: deck
      drawFrom: top
      reshuffleFrom: muck  # Optional. Omit for games where empty deck = game event, not reshuffle.
  - id: muck
    owner: none
    visibility: hidden
    ordering: set
```

**Kernel behavior changes**:

#### `draw` effect handler (`effects.ts` or equivalent)

When processing a `draw: { from: zoneRef, to: zoneRef, count: N }` effect:

1. Resolve the source zone.
2. If the source zone has `behavior.type === 'deck'`:
   a. If the zone has fewer than `count` tokens and `reshuffleFrom` is set:
      - Move all tokens from the `reshuffleFrom` zone into the deck zone.
      - Shuffle the deck zone (using the state's RNG).
      - Continue drawing.
   b. Use `drawFrom` to determine extraction order:
      - `top`: take from index 0 (front of array) — current default behavior
      - `bottom`: take from last index
      - `random`: select random indices using state RNG
3. If the source zone has no `behavior` (or a different behavior type), `draw` works exactly as today.

#### `shuffle` effect handler

No change needed. `shuffle` already randomizes a zone's token order. It continues to work independently of zone behaviors.

#### Determinism

Auto-reshuffle uses the GameState's RNG, so determinism is preserved: same seed + same actions = same reshuffle order.

**FITL configuration**: FITL's deck zone would declare `behavior: { type: deck, drawFrom: top }` with **no** `reshuffleFrom` — an empty FITL deck triggers coup resolution, not reshuffle. The absence of `reshuffleFrom` means `draw` on an empty deck draws 0 tokens (existing behavior).

**Texas Hold'em configuration**: `reshuffleFrom: muck` enables multi-hand tournament play where cards cycle through deck → hands/community/burn → muck → back to deck between hands.

**Extensibility**: The `behavior` field is a discriminated union on `type`. Future zone behaviors (e.g., `type: 'market'` for face-up display with automatic refill from a supply) can be added without changing existing behavior types.

**Validation**:
- If `behavior.reshuffleFrom` is set, it must reference a declared zone ID
- `reshuffleFrom` must not reference the zone itself (no self-reshuffle)
- `behavior.type` must be a recognized type (`'deck'` initially)
- A zone with `behavior.type: 'deck'` should have `ordering: 'stack'` (warn if not)

---

## Part C: Migration Impact

### C1. Texas Hold'em Spec Changes

| Area | Before | After | Reduction |
|------|--------|-------|-----------|
| Piece catalog | 52 individual `pieceType` + 52 `inventory` entries | 1 `generate` block (~20 lines) | ~200 lines → ~20 lines |
| Hand zones | `zoneExpr: { concat: ['hand:', ...] }` at every reference | `template: { idPattern: "hand-{seat}", perSeat: true }` + direct zone IDs | Eliminates all runtime concat |
| Betting preconditions | `handActive && !allIn && !eliminated` in 5 actions | `actionDefaults.pre` on betting phases (or shared via phase template) | 15 condition lines → 1 declaration |
| Post-action cleanup | 3 macro calls × 5 actions = 15 macro invocations | `actionDefaults.afterEffects` on betting phases | 15 invocations → 1 declaration |
| Flop/turn/river | 3 near-identical phase definitions | 1 `phaseTemplate` + 3 `fromTemplate` instantiations | ~60% phase YAML reduction |
| Deck zone | Plain zone + manual shuffle logic in `hand-setup` | Zone with `behavior: { type: deck, drawFrom: top, reshuffleFrom: muck }` | Explicit lifecycle semantics |

### C2. FITL Spec Changes

| Area | Before | After | Reduction |
|------|--------|-------|-----------|
| Capability markers | 20 individual 3-state declarations | 1 `batch` block (~5 lines) | ~60 lines → ~5 lines |
| Operation counters | 13 individual int declarations | 1 `batch` block (~5 lines) | ~65 lines → ~5 lines |
| Momentum flags | ~18 individual boolean declarations | 1 `batch` block (~5 lines) | ~54 lines → ~5 lines |
| Per-faction zones | 8 hand-typed zones | 2 `template` blocks (~8 lines) | ~40 lines → ~8 lines |
| Main phase actions | Eligibility checks repeated per operation | `actionDefaults.pre` on `main` phase | Repeated conditions → 1 declaration |
| Post-operation bookkeeping | Counter increments in each operation macro | `actionDefaults.afterEffects` on `main` phase (common bookkeeping) | Repeated macros → 1 declaration |
| Deck zone | Plain zone | Zone with `behavior: { type: deck, drawFrom: top }` (no reshuffle) | Minor: explicit semantics |
| Coup sub-phases | Similar reset logic in sub-phases | Potential `phaseTemplate` for shared coup reset | Moderate reduction |

### C3. What Does NOT Change

- **Kernel DSL primitives**: No new EffectAST or ConditionAST node types. All 34 existing effects and 12 condition operators remain unchanged.
- **Existing macro system**: `effectMacros` and `conditionMacros` work exactly as before. The new templates are orthogonal to macros.
- **GameDef structure**: The compiled output gains new optional fields (`PhaseDef.actionDefaults`, `ZoneDef.behavior`). A GameDef without these fields behaves identically to today.
- **Simulation and trace format**: No changes. The kernel produces the same trace events.
- **Agent interface**: Bot interfaces unchanged. Legal moves are enumerated with the same `Move` type. Phase action defaults are transparent — agents see the combined effect of phase defaults + action preconditions, just as if the preconditions were inlined.

---

## Part D: Implementation Scope

### D1. Compiler Passes

**Orchestrator**: A new `expandTemplates(doc)` function in `packages/engine/src/cnl/expand-templates.ts` calls all five passes sequentially and returns the expanded `GameSpecDoc` with collected diagnostics. It is inserted into `compileGameSpecToGameDef` (`compiler-core.ts`) as the first step, **before `expandConditionMacros`**.

| Pass | New File | Input Pattern | Output | Depends On |
|------|----------|--------------|--------|-----------|
| `expandPieceGeneration` | `packages/engine/src/cnl/expand-piece-generation.ts` | `generate:` in pieceCatalog payload | Individual `pieceType` + `inventory` entries | None |
| `expandBatchMarkers` | `packages/engine/src/cnl/expand-batch-markers.ts` | `batch:` in `globalMarkerLattices` | Individual marker declarations | None |
| `expandBatchVars` | `packages/engine/src/cnl/expand-batch-vars.ts` | `batch:` in globalVars/perPlayerVars | Individual var declarations | None |
| `expandZoneTemplates` | `packages/engine/src/cnl/expand-zone-templates.ts` | `template:` in zones with `perSeat` | Individual zone declarations | Seat IDs pre-scanned from `seatCatalog` data assets |
| `expandPhaseTemplates` | `packages/engine/src/cnl/expand-phase-templates.ts` | `phaseTemplates:` + `fromTemplate:` | Concrete phase definitions | None |

Each pass: ~100-200 lines of implementation + ~100-200 lines of tests.

### D2. Kernel Changes

| Change | Files Affected | Scope |
|--------|---------------|-------|
| Phase action defaults (`actionDefaults.pre`) | `legal-moves.ts` (legal move enumeration) | Merge phase default pre with action pre |
| Phase action defaults (`actionDefaults.afterEffects`) | `apply-move.ts` (action resolution) | Append afterEffects after action effects |
| `PhaseDef` type | `types-core.ts` | Add optional `actionDefaults` field |
| Zone behaviors | `draw` effect handler (in effects files) | Consult zone behavior for draw ordering + auto-reshuffle |
| `ZoneDef` type | `types-core.ts` | Add optional `behavior` field |

### D3. Schema Changes

| Schema | Change |
|--------|--------|
| GameDef JSON Schema (`packages/engine/schemas/`) | Add `actionDefaults` to phase definitions; add `behavior` to zone definitions |
| GameSpecDoc types (`packages/engine/src/cnl/`) | Add `generate`, `batch`, `template`, `phaseTemplates`, `fromTemplate` patterns to spec types |
| Validation (`packages/engine/src/cnl/validate-spec*.ts`) | New validators for each compiler-level pattern |

### D4. Game Spec Migration

| Game | Task |
|------|------|
| Texas Hold'em (`data/games/texas-holdem/*.md`) | Rewrite piece catalog with `generate`; convert hand zones to templates; add `actionDefaults` to betting phases; extract phase template for flop/turn/river; add deck behavior |
| FITL (`data/games/fire-in-the-lake/*.md`) | Convert capability markers to `batch`; convert counters/flags to `batch`; convert per-faction zones to templates; add `actionDefaults` to main phase; add deck behavior; evaluate phase template opportunities for coup sub-phases |

### D5. Test Strategy

| Test Category | What | How |
|---------------|------|-----|
| Compiler pass unit tests | Each expansion pass (A1-A5) | Input YAML → assert expanded output matches expected individual declarations |
| Kernel action defaults | Phase `pre` merging, `afterEffects` execution | New unit tests: action legal when phase default passes, illegal when it fails; afterEffects run after action effects; afterEffects run even when action triggers phase change |
| Kernel zone behaviors | Draw ordering, auto-reshuffle | New unit tests: draw-from-top, draw-from-bottom, draw-from-random; auto-reshuffle triggers when deck empty and reshuffleFrom set; no reshuffle when reshuffleFrom absent; determinism preserved |
| Determinism | Same seed + same moves = same result | Existing determinism test suite runs against games with new features |
| Migration golden tests | Migrated specs compile and produce equivalent simulation behavior | Compile old and new specs, run same seed/move sequence, assert identical final state hash |
| Schema validation | GameDef with new optional fields validates | Update JSON Schema, run existing schema validation tests |

---

## Part E: Suggested Ticket Quartering

For reference when breaking this spec into tickets. Not prescriptive — adjust granularity as needed.

| Ticket | Scope | Dependencies |
|--------|-------|-------------|
| T1: Combinatorial piece generation (A1) | Compiler pass + validation + tests | None |
| T2: Batch markers (A2) | Compiler pass + validation + tests | None |
| T3: Batch variables (A3) | Compiler pass + validation + tests | None |
| T4: Per-player zone templates (A4) | Compiler pass + validation + tests | None |
| T5: Phase templates (A5) | Compiler pass + validation + tests | None |
| T6: Phase action defaults (B1) | Kernel types + legal moves + apply move + tests | None |
| T7: Zone behaviors — deck semantics (B2) | Kernel types + draw effect + tests | None |
| T8: Texas Hold'em spec migration | Rewrite spec using A1, A4, A5, B1, B2 | T1, T4, T5, T6, T7 |
| T9: FITL spec migration | Rewrite spec using A2, A3, A4, B1, B2 | T2, T3, T4, T6, T7 |
| T10: Schema + documentation updates | JSON Schema, spec cross-references | T6, T7 |

Tickets T1-T5 are independent compiler passes and can be implemented in parallel. T6 and T7 are independent kernel changes and can be implemented in parallel. T8 and T9 depend on all prior tickets for their respective features.
