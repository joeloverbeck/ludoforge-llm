# Spec 28: FITL Capabilities, Momentum, and RVN Leader

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: L
**Dependencies**: Spec 26 (operations), Spec 27 (special activities), Spec 25c (GlobalMarkerLatticeDef)
**Estimated effort**: 3-4 days
**Source sections**: Brainstorming Sections 4.2 (items 9-11), 5.1-5.2, 7.3, 11 (Capabilities, Momentum)

## Overview

Implement the 3 persistent modifier systems that alter how operations and special activities resolve: 19 capabilities (permanent two-sided markers), 15 momentum markers (expire at coup Reset), and the RVN Leader bonus. All three are encoded declaratively in the GameSpecDoc -- no FITL-specific engine code.

**Critical design correction**: Capabilities are NOT simple booleans. Each capability is a physical two-sided token with completely different effects on each side (unshaded vs shaded). An event card grants a capability on a specific side. Card #52 (RAND) can flip a capability to the opposite side. This requires a tri-state model: `inactive` / `unshaded` / `shaded`.

## Scope

### In Scope

- **19 capabilities**: Tri-state global markers (`inactive` | `unshaded` | `shaded`) via `GlobalMarkerLatticeDef`. Each side has a distinct mechanical effect. Persist for the rest of the game once granted. (Section 11 authoritative list.)
- **15 momentum markers**: Boolean global vars with `duration: 'coup'` semantics. Some prohibit actions entirely, others modify formulas. Expire at coup Reset phase.
- **RVN Leader**: Lingering bonuses from the active RVN Leader encoded via `activeLeader` global marker + `leaderBoxCardCount` integer gvar.
- **Kernel dependency**: `GlobalMarkerLatticeDef` (game-wide scope, mirrors `SpaceMarkerLatticeDef`). Specified here; implementation in Spec 25c.

### Out of Scope

- Event cards that grant capabilities/momentum (Spec 29 encodes the cards)
- Coup round Reset that clears momentum (already implemented in foundation)
- GlobalMarkerLatticeDef kernel implementation (Spec 25c)

## Key Types & Interfaces

### Capabilities (GlobalMarkerLatticeDef)

Capabilities use `GlobalMarkerLatticeDef` -- a new kernel primitive that mirrors the existing `SpaceMarkerLatticeDef` but operates at game-wide scope instead of per-space scope.

```yaml
# In GameSpecDoc globalMarkerLattices section:
globalMarkerLattices:
  - id: "cap_cobras"
    states: ["inactive", "unshaded", "shaded"]
    defaultState: "inactive"
  # ... one entry per capability
```

```typescript
// Condition checking capability side in operation effects:
// { op: '==', left: { ref: 'globalMarkerState', marker: 'cap_cobras' }, right: 'unshaded' }
//
// Setting a capability (by event card):
// { setGlobalMarker: { marker: 'cap_cobras', state: { literal: 'unshaded' } } }
//
// Flipping a capability (Card #52 RAND):
// Conditional: if unshaded -> set shaded; if shaded -> set unshaded
```

### Momentum

```typescript
// Momentum markers are boolean global vars (gvars):
// { id: 'mom_claymores', type: 'boolean', default: false }
//
// Set true by event card effects. Cleared to false at coup Reset phase.
//
// Prohibition momentum: checked as a precondition on the prohibited action.
// Formula-modifying momentum: checked as a condition within effect resolution.
```

### RVN Leader

```typescript
// Global marker for active leader:
// globalMarkerLattices:
//   - id: "activeLeader"
//     states: ["minh", "khanh", "youngTurks", "ky", "thieu"]
//     defaultState: "minh"
//
// Integer gvar for leader box card count (for Pivotal Event preconditions):
// { id: 'leaderBoxCardCount', type: 'integer', default: 0 }
//
// Leader lingering effects checked via conditions on activeLeader marker:
// { op: '==', left: { ref: 'globalMarkerState', marker: 'activeLeader' }, right: 'minh' }
```

## Implementation Tasks

### Task 28.1: Capability Definitions (GlobalMarkerLatticeDef)

Define all 19 capability global markers in the FITL GameSpecDoc. Each has three states: `inactive` (default), `unshaded`, `shaded`. The unshaded and shaded effects are completely different per capability.

| # | ID | Faction | Unshaded Effect | Shaded Effect |
|---|---|---|---|---|
| 4 | `cap_topGun` | US | No MiGs. Degrade 2 | Degrade on 4-6 |
| 8 | `cap_arcLight` | US | 1 Air Strike no COIN | Air Strike >1: shift 2 |
| 11 | `cap_abrams` | US | 1 Assault: Base 1st | Assault max 2 spaces |
| 13 | `cap_cobras` | US | 2 Sweep: Remove 1 | Assault 1-3: -1 US Troop |
| 14 | `cap_m48Patton` | US | 2 Assault: -2 extra | Patrol 1-3: -1 moved cube |
| 18 | `cap_caps` | US | Train: +1 Police | Sweep max 2 spaces |
| 19 | `cap_cords` | US | Train: Pacify 2 spaces | Train: Pacify to Passive Support only |
| 20 | `cap_lgbs` | US | Air Strike No shift if -1 piece | Air Strike -4 max |
| 28 | `cap_searchAndDestroy` | US | Assault: -1 Under Guer | Assault: +1 Act Opp |
| 31 | `cap_aaa` | NVA | Rally Trail max 1 space | Air Strike Degrade to 2 only |
| 32 | `cap_longRangeGuns` | NVA | Bombard max 1 | Bombard max 3 |
| 33 | `cap_migs` | NVA | Reset: -6 NVA Resources | Air Strike vs Trail: -1 US Trp |
| 34 | `cap_sa2s` | NVA | Air Strike Trail: -1 NVA | Rally: Improve Trail 2 |
| 45 | `cap_pt76` | NVA | Attack -1 NVA Troop | 1 Attack: -1 enemy /Troop |
| 61 | `cap_armoredCavalry` | ARVN | Transport Assault 1 | Transport Rangers |
| 86 | `cap_mandateOfHeaven` | ARVN | 1 Govern: No shift | Pacify & Gov max 1 |
| 101 | `cap_boobyTraps` | VC | Ambush max 1 | Sweep 1:3: -1 Trp |
| 104 | `cap_mainForceBns` | VC | March: Active > 1 | VC 1 Amb: -2 enemy |
| 116 | `cap_cadres` | VC | VC Terror, Agitate: -2 Guerrillas | Rally: Agitate at 1 Base |

**Capability flip mechanic**: Card #52 (RAND) can flip a capability to its opposite side. The `setGlobalMarker` effect handles this: if currently `'unshaded'`, set to `'shaded'` and vice versa. The event card effect for RAND will use conditional logic to determine the new state.

### Task 28.2: Capability Conditional Branches

Add per-side conditional branches to operation/SA effect fixtures. Each capability check must test the specific side (`unshaded` or `shaded`) since the two sides have completely different effects.

**Example -- Cobras (Card #13)**:

```yaml
# In Sweep operation resolution (unshaded side):
- if:
    when:
      op: '=='
      left: { ref: 'globalMarkerState', marker: 'cap_cobras' }
      right: 'unshaded'
    then:
      # 2 Sweep spaces each remove 1 Active unTunneled enemy
      - comment: "Cobras unshaded: 2 Sweep spaces remove 1 Active enemy each"

# In Assault operation resolution (shaded side):
- if:
    when:
      op: '=='
      left: { ref: 'globalMarkerState', marker: 'cap_cobras' }
      right: 'shaded'
    then:
      # Each Assault space: 1 US Troop to Casualties on roll 1-3
      - comment: "Cobras shaded: Assault 1-3 roll costs 1 US Troop"
```

**Operations affected by capabilities (by side)**:

1. **Sweep**:
   - `cap_cobras` (unshaded): 2 Sweep spaces each remove 1 Active unTunneled enemy
   - `cap_caps` (shaded): Sweep max 2 spaces
   - `cap_boobyTraps` (shaded): Sweep 1:3 ratio costs -1 Troop

2. **Assault**:
   - `cap_abrams` (unshaded): 1 Assault space targets Base first
   - `cap_abrams` (shaded): Assault max 2 spaces
   - `cap_cobras` (shaded): Assault spaces on roll 1-3 cost -1 US Troop
   - `cap_m48Patton` (unshaded): 2 Assault spaces remove 2 extra
   - `cap_searchAndDestroy` (unshaded): Assault removes 1 Underground Guerrilla
   - `cap_searchAndDestroy` (shaded): Assault adds +1 Active Opposition

3. **Air Strike**:
   - `cap_topGun` (unshaded): No MiGs capability active; Degrade 2 levels
   - `cap_topGun` (shaded): Degrade only on die roll 4-6
   - `cap_arcLight` (unshaded): 1 Air Strike space, no COIN pieces affected
   - `cap_arcLight` (shaded): Air Strike >1 space shifts Support/Opposition by 2
   - `cap_lgbs` (unshaded): Air Strike does not shift if removing only 1 piece
   - `cap_lgbs` (shaded): Air Strike removes max 4 pieces
   - `cap_aaa` (shaded): Air Strike Degrade limited to 2 levels only
   - `cap_migs` (shaded): Air Strike vs Trail costs -1 US Troop
   - `cap_sa2s` (unshaded): Air Strike on Trail costs -1 NVA piece

4. **Patrol**:
   - `cap_m48Patton` (shaded): Patrol on roll 1-3 costs -1 moved cube

5. **Train**:
   - `cap_caps` (unshaded): Train places +1 Police
   - `cap_cords` (unshaded): Train Pacify in 2 spaces
   - `cap_cords` (shaded): Train Pacify to Passive Support only

6. **Rally**:
   - `cap_aaa` (unshaded): Rally Trail improvement max 1 space
   - `cap_sa2s` (shaded): Rally improves Trail by 2
   - `cap_cadres` (shaded): Rally allows Agitate at 1 Base

7. **March**:
   - `cap_mainForceBns` (unshaded): March allows Activating more than 1 Guerrilla

8. **Attack**:
   - `cap_pt76` (unshaded): Attack costs -1 NVA Troop
   - `cap_pt76` (shaded): 1 Attack space removes -1 enemy per NVA Troop

9. **Bombard**:
   - `cap_longRangeGuns` (unshaded): Bombard max 1 space
   - `cap_longRangeGuns` (shaded): Bombard max 3 spaces

10. **Transport**:
    - `cap_armoredCavalry` (unshaded): Transport allows Assault in 1 destination space
    - `cap_armoredCavalry` (shaded): Transport can move Rangers

11. **Govern**:
    - `cap_mandateOfHeaven` (unshaded): 1 Govern space does not shift Support/Opposition
    - `cap_mandateOfHeaven` (shaded): Pacify and Govern max 1 space

12. **Ambush**:
    - `cap_boobyTraps` (unshaded): Ambush max 1 space
    - `cap_mainForceBns` (shaded): VC 1 Ambush removes 2 enemy pieces

13. **Terror/Agitate**:
    - `cap_cadres` (unshaded): VC Terror and Agitate cost 2 fewer Guerrillas

14. **Reset (Coup Round)**:
    - `cap_migs` (unshaded): Reset costs -6 NVA Resources

### Task 28.3: Momentum Marker Definitions

Define all 15 momentum markers as boolean global vars. Each is set `true` by an event card and cleared to `false` at coup Reset phase.

| # | Momentum ID | Side | Precise Effect (from card text) |
|---|---|---|---|
| 5 | `mom_wildWeasels` | Shaded | Air Strike either Degrades Trail or may remove just 1 piece (not 1-6) |
| 7 | `mom_adsid` | Unshaded | -6 NVA Resources at any Trail# change |
| 10 | `mom_rollingThunder` | Shaded | No Air Strike until Coup |
| 15a | `mom_medevacUnshaded` | Unshaded | This Commitment, all Troop Casualties Available |
| 15b | `mom_medevacShaded` | Shaded | No Air Lift until Coup. Executing Faction remains Eligible. |
| 16 | `mom_blowtorchKomer` | Unshaded | Pacify costs 1 Resource per step or Terror (during Coup Round Support Phase, rule 6.3.1) |
| 17 | `mom_claymores` | Unshaded | No Ambush; remove 1 Guerrilla each Marching group that Activates |
| 22 | `mom_daNang` | Shaded | No Air Strike until Coup |
| 38 | `mom_mcnamaraLine` | Single | No Infiltrate or Trail Improvement by Rally until Coup |
| 39 | `mom_oriskany` | Shaded | No Degrade of Trail (by Air Strike or Coup, not Events) |
| 41 | `mom_bombingPause` | Single | No Air Strike until Coup |
| 46 | `mom_559thTransportGrp` | Unshaded | Infiltrate max 1 space |
| 72 | `mom_bodyCount` | Unshaded | Assault and Patrol add +3 Aid per Guerrilla removed and cost 0 |
| 78 | `mom_generalLansdale` | Shaded | No US Assault until Coup |
| 115 | `mom_typhoonKate` | Single | No Air Lift, Transport, or Bombard; all other SAs max 1 space |

**Medevac mutual exclusion**: Only ONE side of Medevac (card #15) can be active at a time. The executing faction chooses unshaded or shaded when playing the card. `mom_medevacUnshaded` and `mom_medevacShaded` are separate boolean gvars but the event card effect ensures mutual exclusivity.

**Blowtorch Komer timing (card #16)**: This momentum specifically modifies the Coup Round's Support Phase (rule 6.3.1) pacification cost -- not pacification during regular operations.

### Task 28.4: Momentum Prohibition Checks

Add precondition checks to operations/SAs that are prohibited by active momentum:

- **Air Strike prohibited**: Rolling Thunder (`mom_rollingThunder`), Da Nang (`mom_daNang`), Bombing Pause (`mom_bombingPause`)
- **Air Lift prohibited**: Medevac shaded (`mom_medevacShaded`), Typhoon Kate (`mom_typhoonKate`)
- **US Assault prohibited**: General Lansdale (`mom_generalLansdale`)
- **Ambush prohibited**: Claymores (`mom_claymores`)
- **Infiltrate prohibited**: McNamara Line (`mom_mcnamaraLine`)
- **Bombard prohibited**: Typhoon Kate (`mom_typhoonKate`)
- **Transport prohibited**: Typhoon Kate (`mom_typhoonKate`)
- **Trail improvement via Rally prohibited**: McNamara Line (`mom_mcnamaraLine`)
- **Trail degrade via Air Strike/Coup prohibited**: Oriskany (`mom_oriskany`)
- **All SAs max 1 space**: Typhoon Kate (`mom_typhoonKate`) (except prohibited ones above)

### Task 28.5: RVN Leader Implementation

#### Leader Data

| Card # | Leader | Lingering Effect | Notes |
|---|---|---|---|
| (map) | Duong Van Minh | Each ARVN Train adds +5 bonus Aid | Default leader. Not a card. Does not count in leader box. |
| 125 | Nguyen Khanh | Transport uses max 1 LoC space | |
| 126 | Young Turks | Each ARVN Govern SA adds +2 Patronage | |
| 127 | Nguyen Cao Ky | Pacification costs 4 Resources per Terror or level | Effect starts from that Coup Round (rule 2.4.1) |
| 128 | Nguyen Van Thieu | No effect ("Stabilizer") | |
| 129-130 | Failed Attempt | Immediate: ARVN removes 1 in 3 cubes per space (round down) | Not a leader change. Placed below previous leader cards. |

#### Encoding Model

- `activeLeader` global marker via `GlobalMarkerLatticeDef`:
  ```yaml
  globalMarkerLattices:
    - id: "activeLeader"
      states: ["minh", "khanh", "youngTurks", "ky", "thieu"]
      defaultState: "minh"
  ```

- `leaderBoxCardCount` integer gvar:
  ```yaml
  globalVars:
    - id: "leaderBoxCardCount"
      type: "integer"
      default: 0
  ```

#### Immediate vs Lingering Effects

Two distinct effect types arise from coup cards:

1. **Immediate effects** (happen once when the coup card is revealed):
   - Failed Attempt "Desertion": ARVN removes 1 in 3 of its cubes per space (round down)
   - These are encoded in `EventCardDef.effects` for the coup card

2. **Lingering effects** (persist until a new leader replaces the current one):
   - Leader text (e.g., Khanh's "Transport max 1 LoC") modifies game behavior
   - Encoded via conditional checks on the `activeLeader` global marker in operation/SA effects

#### Key Rule Clarifications (Rule 2.4.1)

- **Duong Van Minh** is printed on the map, not a card. He does not count toward `leaderBoxCardCount`.
- **Failed Attempts** (cards 129-130) cancel only Duong Van Minh's effect. They are placed below any previous RVN Leader cards but do not change `activeLeader` to a new leader. If the current leader is not Minh, the Failed Attempt has no leader effect (only the Desertion immediate effect applies).
- **Failed Attempts increment `leaderBoxCardCount`** (they are cards placed in the leader box) but do not change `activeLeader`.
- **Leader replacement**: When a new leader coup card is revealed (125-128), set `activeLeader` to the new leader and increment `leaderBoxCardCount`.
- **Pivotal Event preconditions**: Some pivotal events check "2+ cards in RVN Leader box" -- this uses `leaderBoxCardCount >= 2`.

#### Leader Effect Conditions in Operations

```yaml
# Minh: +5 Aid on ARVN Train
- if:
    when:
      op: 'and'
      conditions:
        - { op: '==', left: { ref: 'globalMarkerState', marker: 'activeLeader' }, right: 'minh' }
        - { op: '==', left: { ref: 'operatingFaction' }, right: 'ARVN' }
    then:
      - { addVar: { scope: 'global', var: 'aid', delta: 5 } }

# Khanh: Transport max 1 LoC space
- if:
    when:
      op: '=='
      left: { ref: 'globalMarkerState', marker: 'activeLeader' }
      right: 'khanh'
    then:
      # Limit Transport LoC spaces to 1

# Young Turks: Each ARVN Govern SA adds +2 Patronage
- if:
    when:
      op: '=='
      left: { ref: 'globalMarkerState', marker: 'activeLeader' }
      right: 'youngTurks'
    then:
      - { addVar: { scope: 'global', var: 'patronage', delta: 2 } }

# Ky: Pacification costs 4 Resources per Terror or level
- if:
    when:
      op: '=='
      left: { ref: 'globalMarkerState', marker: 'activeLeader' }
      right: 'ky'
    then:
      # Override pacification cost to 4 per step/Terror

# Thieu: No effect (stabilizer)
# No conditional branch needed
```

## Kernel Dependency: GlobalMarkerLatticeDef

Spec 28 depends on a new kernel primitive: `GlobalMarkerLatticeDef`. This mirrors the existing `SpaceMarkerLatticeDef` but operates at game-wide scope. Implementation is deferred to **Spec 25c** (Extended Kernel Primitives).

### Specification

**New types** (`src/kernel/types-core.ts`):
```typescript
export interface GlobalMarkerLatticeDef {
  readonly id: string;
  readonly states: readonly string[];
  readonly defaultState: string;
}
```

Add to `GameDef`:
```typescript
readonly globalMarkerLattices?: readonly GlobalMarkerLatticeDef[];
```

Add to `GameState`:
```typescript
readonly globalMarkers: Readonly<Record<string, string>>;
```

**New AST nodes** (`src/kernel/types-ast.ts`):
```typescript
// Effects:
| { readonly setGlobalMarker: { readonly marker: string; readonly state: ValueExpr } }
| { readonly shiftGlobalMarker: { readonly marker: string; readonly delta: ValueExpr } }

// References (ValueExpr):
| { readonly ref: 'globalMarkerState'; readonly marker: string }
```

**Implementation files to modify** (mirroring space marker pattern):

| File | Change |
|---|---|
| `src/kernel/types-core.ts` | Add `GlobalMarkerLatticeDef`, update `GameDef`, update `GameState` |
| `src/kernel/types-ast.ts` | Add `setGlobalMarker`, `shiftGlobalMarker` effects + `globalMarkerState` ref |
| `src/kernel/effects-choice.ts` | Add `applySetGlobalMarker`, `applyShiftGlobalMarker` (mirror space marker) |
| `src/kernel/resolve-ref.ts` | Add `globalMarkerState` resolution case |
| `src/kernel/effect-dispatch.ts` | Add dispatch cases for new effects |
| `src/kernel/zobrist.ts` | Add `globalMarkerState` Zobrist feature |
| `src/kernel/schemas-ast.ts` | Add JSON Schema for new AST nodes |
| `src/kernel/schemas-core.ts` | Add JSON Schema for `GlobalMarkerLatticeDef` |
| `src/kernel/validate-gamedef-structure.ts` | Add validation for global marker lattices |
| `src/kernel/validate-gamedef-behavior.ts` | Add behavioral validation |
| `src/cnl/compile-effects.ts` | Add compiler support for new effects |
| `src/cnl/compile-conditions.ts` | Add compiler support for `globalMarkerState` reference |
| `src/cnl/compile-data-assets.ts` | Add parser for `globalMarkerLattices` in GameSpecDoc |
| `src/cnl/effect-kind-registry.ts` | Register new effect kinds |
| `src/cnl/binder-surface-registry.ts` | Register new binder surfaces if needed |
| `schemas/gamedef.schema.json` | Add GlobalMarkerLatticeDef schema |

**State initialization** (`src/kernel/state-init.ts` or equivalent):
```typescript
globalMarkers: Object.fromEntries(
  (def.globalMarkerLattices ?? []).map(l => [l.id, l.defaultState])
)
```

## Testing Requirements

### Unit Tests
- Each capability (both sides): verify operation behavior changes when capability is unshaded vs shaded vs inactive
- Each momentum prohibition: verify action is blocked when momentum is active
- Each momentum formula modification: verify formula changes when momentum is active
- Momentum expiry: verify momentum cleared at coup Reset
- RVN Leader: verify bonus applies for correct leader + operation + faction combination
- Leader change: verify `activeLeader` updates correctly and old leader effects stop
- Failed Attempt: verify Desertion immediate effect and that `activeLeader` is unchanged

### Integration Tests
- `test/integration/fitl-capabilities.test.ts`: Exercise all 19 capabilities across affected operations (both sides)
- `test/integration/fitl-momentum.test.ts`: Exercise all 15 momentum markers (prohibitions and formula mods)
- `test/integration/fitl-rvn-leader.test.ts`: Exercise all 5 leaders + Failed Attempt across affected operations

## Acceptance Criteria

1. All 19 capabilities defined as tri-state global markers (`inactive`/`unshaded`/`shaded`) with per-side conditional branches on affected operations
2. All 15 momentum markers with correct prohibitions and formula modifications
3. Momentum markers expire at coup Reset
4. RVN Leader: all 5 leaders + Failed Attempt encoded; `activeLeader` global marker + `leaderBoxCardCount` gvar
5. Capability flip mechanic supported via `setGlobalMarker` conditional logic
6. Operations correctly check both capability side and momentum conditions
7. Immediate vs lingering coup card effects properly distinguished
8. GlobalMarkerLatticeDef kernel dependency documented for Spec 25c
9. Build passes (`npm run build`)
10. All existing tests pass (`npm test`)

## Appendix A: Coup Cards and RVN Leader (Source Text)

Coup!
Card Number: 125
Nguyen Khanh
Corps commanders ascendant: Transport uses max 1 LoC space.
Conduct Coup Round:
Victory? to Reset
Monsoon: If this card next, no Sweep or March, Air Lift & Air Strike max 2.

Coup!
Card Number: 126
Young Turks
Thi, Ky, & Thieu wag the US dog: Each ARVN Govern Special Activity adds +2 Patronage.
Conduct Coup Round:
Victory? to Reset
Monsoon: If this card next, no Sweep or March, Air Lift & Air Strike max 2.

Coup!
Card Number: 127
Nguyen Cao Ky
Brash brass Ky: Pacification costs 4 Resources per Terror or level.
Conduct Coup Round:
Victory? to Reset
Monsoon: If this card next, no Sweep or March, Air Lift & Air Strike max 2.

Coup!
Card Number: 128
Nguyen Van Thieu
Stabilizer: No effect.
Conduct Coup Round:
Victory? to Reset
Monsoon: If this card next, no Sweep or March, Air Lift & Air Strike max 2.

Coup!
Card Number: 129
Failed Attempt
Desertion: ARVN removes 1 in 3 of its cubes per space (round down).
Place below any RVN Leader card.
Conduct Coup Round:
Victory? to Reset.
Monsoon: If this card next, no Sweep or March, Air Lift & Air Strike max 2.

Coup!
Card Number: 130
Failed Attempt
Desertion: ARVN removes 1 in 3 of its cubes per space (round down).
Place below any RVN Leader card.
Conduct Coup Round:
Victory? to Reset
Monsoon: If this card next, no Sweep or March, Air Lift & Air Strike max 2.

RVN Leader (card printed on map)
Duong Van Minh
General pledges democracy.
Each ARVN Train Operation adds +5 bonus aid.

## Appendix B: Capability Token Text (Source)

Name: Top Gun
Unshaded: No MiGs. Degrade 2
Shaded: Degrade on 4-6

Name: Arc Light
Unshaded: 1 Air Strike no COIN
Shaded: Air Strike >1: shift 2

Name: Abrams
Unshaded: 1 Assault: Base 1st
Shaded: Assault max 2 spaces

Name: Cobras
Unshaded: 2 Sweep: Remove 1
Shaded: Assault 1-3: -1 US Troop

Name: M-48 Patton
Unshaded: 2 Assault: -2 extra
Shaded: Patrol 1-3: -1 moved cube

Name: CAPs
Unshaded: Train: +1 Police
Shaded: Sweep max 2 spaces

Name: CORDS
Unshaded: Train: Pacify 2 spaces
Shaded: Train: Pacify to Passive Support only

Name: LGBs
Unshaded: Air Strike No shift if -1 piece
Shaded: Air Strike -4 max

Name: Search & Destroy
Unshaded: Assault: -1 Under Guer
Shaded: Assault: +1 Act Opp

Name: AAA
Unshaded: Rally Trail max 1 space
Shaded: Air Strike Degrade to 2 only

Name: Long Range Guns
Unshaded: Bombard max 1
Shaded: Bombard max 3

Name: MiGs
Unshaded: Reset: -6 NVA Resources
Shaded: Air Strike vs Trail: -1 US Trp

Name: SA-2s
Unshaded: Air Strike Trail: -1 NVA
Shaded: Rally: Improve Trail 2

Name: PT-76
Unshaded: Attack -1 NVA Troop
Shaded: 1 Attack: -1 enemy /Troop

Name: Armor Cav
Unshaded: Transport Assault 1
Shaded: Transport Rangers

Name: Mandate Heaven
Unshaded: 1 Govern: No shift
Shaded: Pacify & Gov max 1

Name: Booby Traps
Unshaded: Ambush max 1
Shaded: Sweep 1:3: -1 Trp

Name: Main Force
Unshaded: March: Active > 1
Shaded: VC 1 Amb: -2 enemy

Name: Cadres
Unshaded: VC Terror, Agitate: -2 Guerrillas
Shaded: Rally: Agitate at 1 Base

## Outcome

- **Completion date**: 2026-02-14
- **What was implemented**:
  - Capabilities: 19 tri-state global marker lattices with side-specific operation/SA branches.
  - Momentum: 15 boolean momentum globals with prohibition and formula-modifier behavior.
  - RVN Leader: `activeLeader` marker + `leaderBoxCardCount` gvar with lingering leader behavior coverage.
  - Cross-system verification: dedicated smoke coverage for capability+momentum, capability+capability, and leader+capability interactions.
  - Determinism hardening: explicit global-marker hash inclusion tests.
- **Deviations from original plan**:
  - During cross-system smoke execution, a generic selector binding edge case surfaced in runtime resolution. It was fixed with strict exact-key lookup in kernel selector resolution (no aliasing), and the FITL Train profile bind declarations were corrected from `space` to `$space` to align with the strict contract.
- **Verification results**:
  - Build, lint, and full unit+integration suites pass, including the new smoke and hash invariant tests.
