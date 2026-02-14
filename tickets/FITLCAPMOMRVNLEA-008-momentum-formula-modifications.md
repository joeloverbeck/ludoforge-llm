# FITLCAPMOMRVNLEA-008 - Momentum Formula Modifications

**Status**: Pending
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.4, formula-modifying subset)
**Depends on**: FITLCAPMOMRVNLEA-006, Spec 26/27 (operation/SA profiles exist)

## Goal

Add conditional branches to operation/SA effect resolution for momentum markers that **modify formulas or behavior** (as opposed to outright prohibitions, which are in ticket 007). These momentum markers change HOW an operation resolves, not whether it's legal.

## File list it expects to touch

- `data/games/fire-in-the-lake.md` — Add conditional branches to affected operation/SA profiles
- `test/integration/fitl-momentum-formula-mods.test.ts` (new) — Integration tests

## Out of scope

- Momentum prohibitions (FITLCAPMOMRVNLEA-007 — markers that block operations entirely)
- Momentum definitions (FITLCAPMOMRVNLEA-006)
- Capability branches (FITLCAPMOMRVNLEA-001 through 005)
- RVN Leader effects (FITLCAPMOMRVNLEA-009, 010)
- Event cards that set momentum (Spec 29)
- Momentum expiry at coup Reset (foundation)

## Formula modifications to implement

### Wild Weasels (`mom_wildWeasels`, Card #5, Shaded)
- Air Strike: either Degrades Trail OR may remove just 1 piece (not 1-6)
- Modifies Air Strike resolution options

### ADSID (`mom_adsid`, Card #7, Unshaded)
- -6 NVA Resources at any Trail# change
- Triggers on Trail state change (conditional effect)

### Medevac Unshaded (`mom_medevacUnshaded`, Card #15a)
- During this Commitment phase, all US Troop Casualties become Available
- Modifies Commitment phase casualty handling

### Medevac Shaded (`mom_medevacShaded`, Card #15b)
- Executing Faction remains Eligible (in addition to Air Lift prohibition in ticket 007)
- Modifies eligibility tracking

### Blowtorch Komer (`mom_blowtorchKomer`, Card #16, Unshaded)
- Pacify costs 1 Resource per step or Terror during Coup Round Support Phase (rule 6.3.1)
- Modifies Coup Round pacification cost formula

### Claymores (`mom_claymores`, Card #17, Unshaded)
- Remove 1 Guerrilla from each Marching group that Activates (in addition to Ambush prohibition in ticket 007)
- Modifies March resolution

### 559th Transport Group (`mom_559thTransportGrp`, Card #46, Unshaded)
- Infiltrate max 1 space
- Modifies Infiltrate space limit

### Body Count (`mom_bodyCount`, Card #72, Unshaded)
- Assault and Patrol add +3 Aid per Guerrilla removed and cost 0 Resources
- Modifies Assault/Patrol formulas (cost and aid)

### Typhoon Kate (`mom_typhoonKate`, Card #115)
- All non-prohibited SAs max 1 space (in addition to prohibitions in ticket 007)
- Modifies SA space limits

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm test` — All existing tests pass
- `node --test dist/test/integration/fitl-momentum-formula-mods.test.js`

### Integration test coverage

For each formula modification:
1. When momentum is `0` (inactive): operation resolves with normal formula
2. When momentum is `1` (active): operation resolves with modified formula
3. Verify the specific numeric change (e.g., Body Count: +3 Aid per Guerrilla, cost becomes 0)

Special cases:
- Claymores: test both the March-group activation removal AND Ambush prohibition (cross-reference with ticket 007)
- Medevac: test mutual exclusion (only one side active at a time, enforced by event card structure)
- ADSID: test that -6 NVA Resources triggers on Trail# state change (not just any operation)

### Invariants that must remain true

- Formula modifications are declarative conditional branches in GameSpecDoc YAML
- No game-specific logic in engine/kernel/compiler
- Existing operation behavior unchanged when all momentum gvars are 0
- Tests use `compileProductionSpec()` from `test/helpers/production-spec-helpers.ts`
