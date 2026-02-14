# Spec 27: FITL Special Activities Full Effects

**Status**: ✅ COMPLETED (Archived on 2026-02-14)
**Priority**: P0
**Complexity**: L
**Dependencies**: Spec 25 (mechanics infrastructure), Spec 26 (interleaving model)
**Estimated effort**: 4-5 days
**Source sections**: Brainstorming Sections 4.2 (item 2), rules 4.0-4.5
**Revision note**: Previous draft had critical rules errors in all 12 SAs. This version cross-referenced against `brainstorming/fire-in-the-lake-game-rules.md` sections 4.1-4.5.

## Overview

Replace the 12 stub special activity profiles with complete effect implementations using the interleaving model from Spec 26. Key rules governing all SAs:

- **Rule 4.1 — Zero cost**: SAs accompany Operations at **no added Resource cost**.
- **Rule 4.1 — Timing**: A Faction may execute its SA at any one time immediately before, during, or immediately after its Operation.
- **Rule 4.1.1 — Accompanying Operations**: Some SAs may only accompany certain types of Operations. If not otherwise specified, SAs may accompany any Operations.
- **Rule 4.1 — Space uniqueness**: Select a given space only once as a location for a given SA (exception: Ambush on LoC, 4.4.3).
- **Sub-decisions**: Several SAs present either/or choices per space (Advise 3 options, Govern 2, Infiltrate 2, Subvert 2), modeled via `chooseOne` inside `forEach`.

## Scope

### In Scope

- **US SAs (3)**: Advise, Air Lift, Air Strike
- **ARVN SAs (3)**: Govern, Transport, Raid
- **NVA SAs (3)**: Infiltrate, Bombard, Ambush
- **VC SAs (3)**: Tax, Subvert, VC Ambush
- Monsoon restrictions on SAs: Air Lift/Air Strike limited to 2 spaces; Advise Sweep option unavailable
- SA-specific targeting, resolution, and piece effects
- Accompanying operation constraints per SA
- Sub-decision modeling (chooseOne within forEach)

### Out of Scope

- Interleaving architecture (Spec 26 owns; this spec uses it)
- Capability/momentum modifiers on SAs (Spec 28)
- Non-player SA selection (Spec 30)

---

## Implementation Tasks

### US Special Activities

#### Task 27.1: Advise (Rule 4.2.1)

**Accompanying Operations**: Train or Patrol ONLY (3.2.1-.2)

**Space selection**: 1-2 spaces NOT selected for Training, never North Vietnam (1.4.2).

**Procedure per space** (`chooseOne`): In each selected space, either:

- **Option A — Sweep**: Sweep within the space with ARVN forces as if an ARVN Sweep there without movement (3.2.3). **NOT available during Monsoon** (2.3.9).
- **Option B — Assault**: Assault there as if ARVN Assault (3.2.4).
- **Option C — Activate-and-remove**: Activate 1 Underground Irregular or Ranger there to remove 2 enemy pieces. Bases may only be removed once no other enemy pieces are there. Tunneled Bases (1.4.4) may not be removed. Underground Guerrillas may be removed.

**Then**: If desired, add +6 Aid total (to max of 75). This is a single global +6, not per-space.

**Monsoon**: Option A (Sweep) is unavailable during Monsoon.

#### Task 27.2: Air Lift (Rule 4.2.2)

**Accompanying Operations**: Any

**Procedure**: Move any US Troops and up to 4 ARVN Troops, Rangers, or Irregulars among any **4 spaces** (not North Vietnam, 1.4.2).
- US Troops: unlimited count
- ARVN pieces (Troops/Rangers/Irregulars): up to 4 total

**Monsoon**: Limited to **2 spaces** (instead of 4).

**Note**: The rules text says "Move" without specifying activity status changes for lifted pieces. The previous draft's claim that "Guerrillas/SF become Active" needs verification against the physical rulebook. If unverified, omit.

#### Task 27.3: Air Strike (Rule 4.2.3)

**Accompanying Operations**: Any

**Space selection**: Up to **6 spaces** (each must have any US or ARVN piece in it).

**Procedure**:
1. Remove a total of up to **6 Active enemy pieces** from among the selected spaces (6 pieces even during Monsoon).
   - Bases only from spaces where no other Insurgent pieces remain.
   - **No Underground Guerrillas**. **No Tunneled Bases**.
2. Shift each selected space **1 level toward Active Opposition** (if a Province or City with at least 1 Population).
3. Then, if desired, degrade the Trail by 1 box (6.7), even if 0 pieces removed.

**Monsoon**: Limited to **2 spaces** (but still up to 6 pieces total).

**No die roll in Air Strike.** The previous draft's "die roll 5-6 = Terror marker" was incorrect.

---

### ARVN Special Activities

#### Task 27.4: Govern (Rule 4.3.1)

**Accompanying Operations**: Train or Patrol ONLY (3.2.1-.2)

**Space selection**: 1-2 COIN-Controlled Provinces or Cities (1.7) with any level of Support (1.6), NOT Saigon, NOT selected for Training.

**Procedure per space** (`chooseOne`): In each space, either:

- **Option A — Aid**: Add **3 x Population** to Aid (to a maximum of 75).
- **Option B — Patronage**: Transfer the space's **Population value** (1x) from Aid to Patronage (max 75). Shift the space 1 level toward Neutral. **Requires more ARVN cubes (Troops + Police) than US cubes (Troops) in the space.**

**Removed**: The previous draft's "Transfer Resources: ARVN may transfer any amount of Resources to US" is not part of Govern.

#### Task 27.5: Transport (Rule 4.3.2)

**Accompanying Operations**: Any

**Procedure**:
1. Select **1 origin space**.
2. Move up to **6 ARVN Troops and/or Rangers** from that space onto 1 or more adjacent LoCs, if desired.
3. They may continue to move along adjacent LoCs or through Cities and then, if desired, into any adjacent destinations (not North Vietnam).
4. **Must stop at any NVA or VC pieces** (blocking rule).
5. **Then flip ALL Rangers anywhere on the map to Underground** (global effect).

**Implementation note**: Transport movement uses `connectedZones` with `via` condition filtering for LoC zones and blocking at enemy-occupied zones. The global Rangers flip is a separate effect after all movement completes.

#### Task 27.6: Raid (Rule 4.3.3)

**Accompanying Operations**: Patrol, Sweep, or Assault ONLY (3.2.2-.4)

**Space selection**: 1-2 spaces.

**Procedure per space**:
1. Move in any adjacent Rangers desired (keeping them either Underground or Active).
2. Then, if desired: Activate 1 Underground Ranger in each space to remove **2 enemy pieces**.
   - Bases may only be removed once no other enemy pieces are there.
   - Tunneled Bases (1.4.4) may not be removed.
   - Underground Guerrillas may be removed.

**Removed**: The previous draft's "+1 Resource for Guerrilla, +3 for Base" resource gains are not part of Raid per the rules.

---

### NVA Special Activities

#### Task 27.7: Infiltrate (Rule 4.4.1)

**Accompanying Operations**: Rally or March ONLY (3.3.1-.2)

**Space selection**: 1-2 spaces that have either an NVA Base OR more NVA pieces than VC pieces.

**Procedure per space** (`chooseOne`): In each space, either:

- **Option A — Build-up** (requires NVA Base(s) in space): Place NVA **Troops** up to (Trail value + number of NVA Bases in space). Then, optionally replace any NVA Guerrillas desired 1-for-1 with added NVA Troops.
- **Option B — Takeover** (requires NVA outnumber VC): Shift any Opposition there by 1 level toward Neutral. Then replace any 1 VC piece desired with its NVA counterpart. If replacing a VC Tunneled Base, flip the Tunnel marker from VC to NVA. In order to remove VC, NVA must have or make Available the NVA counterpart (1.4.1) and place it in the VC's place.

**Removed**: Base-building from Infiltrate (base-building is Rally, not Infiltrate). The previous draft's "NVA Base or Trail >= 2" space selection was incorrect.

#### Task 27.8: Bombard (Rule 4.4.2)

**Accompanying Operations**: Any

**Space selection**: **1-2 spaces** meeting BOTH conditions:
- Contains any combination of at least **3 ARVN and/or US Troops** (Police and Special Forces do NOT count) OR any US or ARVN Base.
- AND the space has in it or is adjacent to a space with at least **3 NVA Troops**.

**Procedure**: Remove **1 US or ARVN Troop cube** from each selected space. If a US Troop, it goes to the **Casualties box** (not Available). **Automatic** — no die roll.

**No die roll in Bombard.** The previous draft's "die roll 4-6 for each piece" was incorrect.

#### Task 27.9: NVA Ambush (Rule 4.4.3)

**Accompanying Operations**: March or Attack (3.3.2-.3)

**Space selection**: **1-2 spaces** selected and paid for as March destinations (0 cost for LoCs) or for Attack by NVA Guerrillas (not yet resolved). At least 1 NVA Guerrilla that Marched into or will Attack in each space must be Underground.

**Note**: Ambush accompanying Attack modifies that Attack in that space rather than adding a second Attack there.

**Procedure per space**: The NVA Attack in each selected location (at no added cost in Resources). Instead of the usual Attack procedure (3.3.3):
- Activate **1** Underground Guerrilla only (not the usual full activation).
- Remove **1 enemy piece** (Bases last) — automatic success, no die roll.
- **Do NOT remove any NVA pieces** even if US Troops removed.

**LoC extension**: If a selected Ambush space is a LoC (1.3.4), NVA may remove the enemy piece from **any adjacent space** instead (Bases last), even where another target was just removed.

**Removed**: The previous draft's "flip back Underground if 2+ Underground present" is not in the rules.

---

### VC Special Activities

#### Task 27.10: Tax (Rule 4.5.1)

**Accompanying Operations**: Any

**Space selection**: Up to **4 spaces** with Underground VC Guerrillas and **no COIN Control** (1.7). Note: There is no COIN Control of LoCs, so VC can Tax there even if outnumbered. VC can Tax Sabotaged LoCs.

**Procedure per space**:
1. Activate 1 Underground VC Guerrilla there.
2. Add the space's **Econ value** (if LoC) or **2 x Population** (if Province/City) to VC Resources.
3. If a Province or City, shift it **1 level toward Active Support**.

#### Task 27.11: Subvert (Rule 4.5.2)

**Accompanying Operations**: Rally, March, or Terror ONLY (3.3.1, -.2, -.4)

**Space selection**: 1-2 spaces with at least 1 Underground VC Guerrilla AND any ARVN cubes.

**Procedure per space** (`chooseOne`): In each space, either:

- **Option A — Remove**: Remove any **2 ARVN cubes**.
- **Option B — Replace**: Replace **1 ARVN cube** with a VC Guerrilla (from Available).

**Then**: Drop Patronage **-1 for every 2 ARVN pieces** removed (or replaced) total across all spaces (rounded down).

**Removed**: The previous draft's "If no ARVN cubes, may remove 1 ARVN Base" is not in the rules. ARVN cubes are a prerequisite for Subvert.

#### Task 27.12: VC Ambush (Rule 4.5.3)

Same as NVA Ambush (Task 27.9) but using **VC Guerrillas** instead of NVA Guerrillas.

All the same corrections apply: 1-2 spaces, LoC extension, no flip-back mechanic, VC immunity (do not remove any VC pieces even if US Troops removed).

---

## Architectural Patterns

### Zero Resource Cost (Rule 4.1)

Per Rule 4.1, SAs have **no added Resource cost**. All 12 SA profiles must have their `costEffects` cleared and `legality` resource-floor checks removed. Existing production stubs that specify resource costs are incorrect.

### Accompanying Operation Constraints (Rule 4.1.1)

Each SA declares which Operations it may accompany. This is enforced at move validation time — an SA paired with a disallowed Operation is rejected.

| SA | Accompanying Operations |
|---|---|
| Advise | Train, Patrol |
| Air Lift | Any |
| Air Strike | Any |
| Govern | Train, Patrol |
| Transport | Any |
| Raid | Patrol, Sweep, Assault |
| Infiltrate | Rally, March |
| Bombard | Any |
| Ambush (NVA) | March, Attack |
| Tax | Any |
| Subvert | Rally, March, Terror |
| Ambush (VC) | March, Attack |

Model via metadata field on each SA profile (e.g., `accompanyingOps: ['train', 'patrol']` or `accompanyingOps: 'any'`). Enforcement integrates with the compound move validation from Spec 26.

### Sub-Decision Model

SAs with per-space either/or choices use `chooseOne` inside `forEach`:

| SA | Options | Description |
|---|---|---|
| Advise | 3 | Sweep, Assault, Activate-and-remove |
| Govern | 2 | Aid or Patronage |
| Infiltrate | 2 | Build-up or Takeover |
| Subvert | 2 | Remove-2 or Replace-1 |

Each option branch produces different effects. The `chooseOne` decision point integrates with the Spec 25b `legalChoices()` model.

### Shared Patterns / Effect Macros

Reusable patterns across SAs:

- **Piece removal with ordering**: Bases last, Tunneled Bases immune. Used by Advise-C, Raid, Ambush. Implement as a shared removal pattern or inline with cascading `let` bindings.
- **Activate-and-act**: Flip Underground to Active, then perform action. Used by Tax, Raid, Ambush, Advise-C.
- **Casualties vs Available routing**: US pieces removed by Bombard/Ambush go to `casualties-US` zone. All other removed pieces go to `available-{faction}`.

If Spec 13a (Effect Macros) is completed, these patterns can be extracted into compile-time macros. Otherwise, inline them per SA.

### Monsoon Handling

Monsoon restrictions are conditional on the monsoon game state variable. Affected SAs:

| SA | Normal | Monsoon |
|---|---|---|
| Air Lift | 4 spaces | 2 spaces |
| Air Strike | 6 spaces | 2 spaces (but still 6 pieces total) |
| Advise | All 3 options | Sweep option (A) unavailable |

Model as conditional `max` on `chooseN` cardinality, reading a `monsoon` game state variable or marker.

---

## Testing Requirements

### Unit Tests per SA

- **Per-SA correctness**: Each SA produces correct state changes per the corrected rules
- **Zero cost**: Verify no resources spent on SA execution
- **Accompanying op constraint**: SA rejected when paired with wrong operation (e.g., Advise + Sweep, Govern + Rally)
- **Sub-decisions**: Each option branch (Advise A/B/C, Govern A/B, Infiltrate A/B, Subvert A/B) produces correct effects
- **Monsoon variants**: Air Lift 4->2 spaces, Air Strike 6->2 spaces (6 pieces), Advise Sweep unavailable
- **Piece removal ordering**: Bases last, Tunneled Bases immune, Underground Guerrillas accessible (for Advise-C, Raid, Ambush)
- **Casualties routing**: US Troops removed by Bombard/Ambush go to `casualties-US`, not `available-US`
- **LoC adjacency**: Ambush on LoC may remove from adjacent space
- **Global effects**: Transport flips ALL Rangers on map to Underground
- **Infiltrate specifics**: Build-up limited by Trail + NVA Bases; Takeover replaces 1 VC piece with NVA counterpart, Tunnel marker flip
- **Tax formula**: Econ (LoC) or 2x Population (Province/City), plus alignment shift toward Active Support
- **Govern constraints**: Patronage option requires ARVN cubes > US cubes; Saigon excluded; Support required
- **Bombard prerequisites**: 3+ US/ARVN Troops (not Police/SF) OR US/ARVN Base; AND 3+ NVA Troops in or adjacent
- **No die rolls**: Air Strike and Bombard are automatic (no die roll mechanics)

### Integration Tests

- Update existing: `test/integration/fitl-us-arvn-special-activities.test.ts` — full effects with corrected rules
- Update existing: `test/integration/fitl-nva-vc-special-activities.test.ts` — full effects with corrected rules
- New: Monsoon-restricted SA tests (Air Lift, Air Strike, Advise)
- New: SA within interleaving model tests (SA before/during/after Operation)
- New: Accompanying operation constraint enforcement tests
- New: Casualties routing tests (US pieces to casualties box)

---

## Acceptance Criteria

1. All 12 SAs have complete effect implementations matching the corrected rules — no stubs remain
2. Zero resource cost enforced for all SAs
3. Accompanying operation constraints enforced per SA (see table above)
4. Sub-decisions work correctly (Advise 3 options, Govern 2, Infiltrate 2, Subvert 2)
5. Monsoon restrictions enforced (Air Lift 4->2, Air Strike 6->2 spaces, Advise-Sweep unavailable)
6. Piece removal ordering: Bases last, Tunneled Bases immune
7. Casualties routing correct (US Troops -> casualties-US via Bombard/Ambush, others -> available)
8. LoC adjacency for Ambush works (remove from adjacent space)
9. Transport global Rangers flip works (all Rangers on map -> Underground)
10. Tax uses 2x Population (not 1x) for Provinces/Cities, plus shift toward Active Support
11. No die rolls for Air Strike or Bombard (automatic effects only)
12. Infiltrate Build-up limited by Trail + NVA Bases; Takeover replaces VC with NVA counterpart
13. Govern Patronage option requires ARVN cubes > US cubes in space
14. Bombard prerequisite: 3+ Troops (not Police/SF) OR Base; AND adjacent 3+ NVA Troops
15. All existing integration tests pass or are updated
16. Build passes (`npm run build`)

---

## Outcome

- Completion date: 2026-02-14
- What was actually changed:
  - The FITL SA coverage described by this spec is implemented and validated by integration suites, including production-data SA tests and fixture-based turn-flow/monsoon/determinism tests.
  - Regression checks for no-die-roll Air Strike/Bombard and LoC-adjacent Ambush are present and passing.
- Deviations from original plan:
  - No additional implementation changes were required during archival; this archival captures completed state rather than introducing new behavior.
- Verification results:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm run test:integration` passed.
  - Targeted suites passed:
    - `node --test dist/test/integration/fitl-us-arvn-special-activities.test.js`
    - `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js`
    - `node --test dist/test/integration/fitl-monsoon-pivotal-windows.test.js`
    - `node --test dist/test/integration/fitl-removal-ordering.test.js`
    - `node --test dist/test/integration/fitl-turn-flow-golden.test.js`
    - `node --test dist/test/integration/fitl-card-flow-determinism.test.js`
