# Spec 28: FITL Capabilities, Momentum, and RVN Leader

**Status**: Draft
**Priority**: P1
**Complexity**: L
**Dependencies**: Spec 26 (operations), Spec 27 (special activities)
**Estimated effort**: 3–4 days
**Source sections**: Brainstorming Sections 4.2 (items 9–11), 5.1–5.2, 7.3, 11 (Capabilities, Momentum)

## Overview

Implement the 3 persistent modifier systems that alter how operations and special activities resolve: 19 capabilities (permanent), 16 momentum markers (expire at coup Reset), and the RVN Leader bonus. All three are encoded declaratively in the GameSpecDoc — no FITL-specific engine code.

## Scope

### In Scope

- **19 capabilities**: Global boolean vars checked via `ConditionAST` in operation resolution branches. Persist for the rest of the game once granted. (Section 11 authoritative list — supersedes the outdated "14" count from Section 4.2.)
- **16 momentum markers**: `EventCardLastingEffectDef` with `duration: 'coup'`. Some prohibit actions entirely, others modify formulas. Expire at coup Reset phase.
- **RVN Leader** (Open Question #2): Lingering bonuses from the active RVN Leader. Duong Van Minh: "+5 Aid when ARVN Train". Others: Nguyen Khanh, Young Turks, Nguyen Cao Ky.

### Out of Scope

- Event cards that grant capabilities/momentum (Spec 29 encodes the cards)
- Capability/momentum definitions themselves (already exist as global vars and lasting effects)
- Coup round Reset that clears momentum (already implemented in foundation)

## Key Types & Interfaces

### Capabilities

```typescript
// Capabilities are global boolean variables, already supported by GameState vars.
// Example: cap_arcLight: boolean (default false, set true by event card)
//
// Checked in operation effects via existing ConditionAST:
// { op: '==', left: { ref: 'gvar', var: 'cap_arcLight' }, right: true }
//
// No new types needed — just conditional branches in operation/SA fixtures.
```

### Momentum

```typescript
// Momentum markers use existing EventCardLastingEffectDef:
// { id: 'momentum_claymores', duration: 'coup', effects: [...] }
//
// Prohibition momentum: checked as a precondition on the prohibited action.
// Formula-modifying momentum: checked as a condition within effect resolution.
//
// Already supported by turn flow infrastructure (cleared at Reset phase).
```

### RVN Leader

```typescript
// Open Question #2: TriggerDef vs special system
//
// Recommended: TriggerDef on operation resolution
// { trigger: {
//     event: 'operationResolved',
//     condition: { op: 'and', conditions: [
//       { op: '==', left: { ref: 'gvar', var: 'activeLeader' }, right: 'minh' },
//       { op: '==', left: { ref: 'operationType' }, right: 'train' },
//       { op: '==', left: { ref: 'operatingFaction' }, right: 'ARVN' }
//     ]},
//     effects: [{ addVar: { scope: 'global', var: 'aid', delta: 5 } }]
// }}
//
// Alternative: Leader effect lookup table on the Turn Flow.
```

## Implementation Tasks

### Task 28.1: Capability Variable Definitions

Define all 19 capability global boolean vars in the FITL GameSpecDoc:

| # | Capability ID | Affects | Rule |
|---|---|---|---|
| 4 | `cap_topGun` | Air Strike | Enhanced Air Strike accuracy |
| 8 | `cap_arcLight` | Air Strike | B-52 strikes remove 2 pieces |
| 11 | `cap_abrams` | Assault | Improved Assault effectiveness |
| 13 | `cap_cobras` | Sweep/Assault | 1:1 Guerrilla activation in Jungle |
| 14 | `cap_m48Patton` | Assault/Patrol | Armor support |
| 18 | `cap_combinedActionPlatoons` | Train/Sweep | Enhanced training/sweep |
| 19 | `cap_cords` | Train | Improved pacification |
| 20 | `cap_laserGuidedBombs` | Air Strike | Precision strikes |
| 28 | `cap_searchAndDestroy` | Assault | Aggressive search operations |
| 31 | `cap_aaa` | Rally/Air Strike | Anti-aircraft defense |
| 32 | `cap_longRangeGuns` | Bombard | Extended Bombard range |
| 33 | `cap_migs` | NVA Resources/Air Strike | Air defense |
| 34 | `cap_sa2s` | Air Strike Trail/NVA Rally Trail | SAM defense |
| 45 | `cap_pt76` | NVA Attack | Amphibious armor |
| 61 | `cap_armoredCavalry` | ARVN Transport | Armored transport |
| 86 | `cap_mandateOfHeaven` | ARVN Govern | Enhanced governance |
| 101 | `cap_boobyTraps` | Ambush/Sweep | Anti-personnel defense |
| 104 | `cap_mainForceBns` | Insurgent March/VC Ambush | Main force operations |
| 116 | `cap_cadres` | VC Terror/Agitate/Rally | Political infrastructure |

### Task 28.2: Capability Conditional Branches

Add `if` branches to operation/SA effect fixtures checking capability vars. For each affected operation:

1. **Sweep** (cap_cobras, cap_combinedActionPlatoons, cap_boobyTraps):
   - Cobras: 1:1 activation ratio in Jungle (instead of 1:2)
   - Combined Action Platoons: Enhanced activation
   - Booby Traps: Fewer activations

2. **Assault** (cap_abrams, cap_cobras, cap_m48Patton, cap_searchAndDestroy):
   - Abrams: Enhanced damage
   - Cobras: Additional damage in Jungle
   - M-48 Patton: Armor bonus
   - Search and Destroy: More aggressive removal

3. **Air Strike** (cap_topGun, cap_arcLight, cap_laserGuidedBombs, cap_aaa, cap_migs, cap_sa2s):
   - Top Gun/Laser Guided: Accuracy improvements
   - Arc Light: Remove 2 pieces instead of 1
   - AAA/MiGs/SA-2s: Defensive countermeasures

4. **Patrol** (cap_m48Patton): Armor support on patrol

5. **Train** (cap_combinedActionPlatoons, cap_cords): Enhanced training effects

6. **Rally** (cap_aaa, cap_sa2s, cap_cadres): NVA/VC Rally modifications

7. **March** (cap_mainForceBns): Insurgent March modifications

8. **Attack** (cap_pt76): NVA Attack with armor

9. **Bombard** (cap_longRangeGuns): Extended range

10. **Transport** (cap_armoredCavalry): Armored transport benefits

11. **Govern** (cap_mandateOfHeaven): Enhanced governance

12. **Ambush** (cap_boobyTraps, cap_mainForceBns): Ambush modifications

13. **Tax/Terror/Agitate** (cap_cadres): VC political modifications

### Task 28.3: Momentum Marker Definitions

Define all 16 momentum markers as `EventCardLastingEffectDef` with `duration: 'coup'`:

| # | Momentum ID | Side | Effect |
|---|---|---|---|
| 5 | `mom_wildWeasels` | Shaded | Modifies Air Strike |
| 7 | `mom_adsid` | Unshaded | -6 NVA Resources at any Trail change |
| 10 | `mom_rollingThunder` | Shaded | Prohibits Air Strike |
| 15a | `mom_medevacUnshaded` | Unshaded | Affects Commitment Phase |
| 15b | `mom_medevacShaded` | Shaded | Prohibits Air Lift |
| 16 | `mom_blowtorchKomer` | Unshaded | Pacify costs 1 Resource per step |
| 17 | `mom_claymores` | Unshaded | Prohibits Ambush; affects Guerrilla March |
| 22 | `mom_daNang` | Shaded | Prohibits Air Strike |
| 38 | `mom_mcnamaraLine` | Single | Prohibits Infiltrate; prohibits Trail improvement by Rally |
| 39 | `mom_oriskany` | Shaded | Prohibits Trail degrade (Air Strike, Coup, not Events) |
| 41 | `mom_bombingPause` | Single | Prohibits Air Strike |
| 46 | `mom_559thTransportGrp` | Unshaded | Infiltrate max 1 space |
| 72 | `mom_bodyCount` | Unshaded | Affects Assault and Patrol |
| 78 | `mom_generalLansdale` | Shaded | Prohibits Assault |
| 115 | `mom_typhoonKate` | Single | Prohibits Air Lift, Transport, Bombard; all other SAs max 1 space |

### Task 28.4: Momentum Prohibition Checks

Add precondition checks to operations/SAs that are prohibited by active momentum:
- Air Strike: Rolling Thunder, Da Nang, Bombing Pause
- Air Lift: Medevac (shaded), Typhoon Kate
- Assault: General Lansdale
- Ambush: Claymores
- Infiltrate: McNamara Line
- Bombard: Typhoon Kate
- Transport: Typhoon Kate
- Trail improvement via Rally: McNamara Line
- Trail degrade via Air Strike/Coup: Oriskany

### Task 28.5: RVN Leader Implementation

Resolve Open Question #2 and implement RVN Leader bonuses:

**Known leaders and effects**:
- Duong Van Minh: +5 Aid when ARVN performs Train
- Nguyen Khanh: (effects TBD from rulebook)
- Young Turks: (effects TBD from rulebook)
- Nguyen Cao Ky: (effects TBD from rulebook)

**Recommended implementation**: `TriggerDef` that fires on operation resolution, checking the active leader zone and operation type. Leader changes occur at coup cards.

## Open Questions

### Open Question #2: RVN Leader as TriggerDef vs Special System

**Recommendation**: Use `TriggerDef` on operation resolution.

**Rationale**: Leader bonuses are conditional side-effects of operations. A `TriggerDef` checking leader zone + operation type + operating faction is a natural fit. No new kernel primitive needed.

**Risk**: Low. Even if `TriggerDef` proves awkward for some leader effects, the trigger infrastructure already exists and handles the pattern.

## Testing Requirements

### Unit Tests
- Each capability: verify operation behavior changes when capability is active vs inactive
- Each momentum prohibition: verify action is blocked when momentum is active
- Each momentum formula modification: verify formula changes when momentum is active
- Momentum expiry: verify momentum cleared at coup Reset
- RVN Leader: verify bonus applies for correct leader + operation + faction combination

### Integration Tests
- `test/integration/fitl-capabilities.test.ts`: Exercise all 19 capabilities across affected operations
- `test/integration/fitl-momentum.test.ts`: Exercise all 16 momentum markers (prohibitions and formula mods)
- `test/integration/fitl-rvn-leader.test.ts`: Exercise leader bonuses across Train and other leader-affected operations

## Acceptance Criteria

1. All 19 capabilities defined as global boolean vars with conditional branches on affected operations
2. All 16 momentum markers with correct prohibitions and formula modifications
3. Momentum markers expire at coup Reset
4. RVN Leader bonus applies correctly (Minh +5 Aid on ARVN Train verified)
5. Operations correctly check both capability and momentum conditions
6. Build passes (`npm run build`)
7. All existing tests pass (`npm test`)
