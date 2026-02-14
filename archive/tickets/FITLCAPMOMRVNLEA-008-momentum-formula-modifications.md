# FITLCAPMOMRVNLEA-008 - Momentum Formula Modifications

**Status**: ✅ COMPLETED
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.3 marker semantics; complements Task 28.4 prohibitions)
**Depends on**: FITLCAPMOMRVNLEA-006, Spec 26/27 (operation/SA profiles exist)

## Goal

Add conditional branches to operation/SA effect resolution for momentum markers that **modify formulas or behavior** (as opposed to outright prohibitions, which are in ticket 007). These momentum markers change HOW an operation resolves, not whether it's legal.

## Reassessed assumptions (2026-02-14)

- Momentum globals are first-class booleans (`true`/`false`), not `0/1` integer flags.
- Existing production prohibitions and SA-space caps are already implemented in `archive/tickets/FITLCAPMOMRVNLEA-007-momentum-prohibition-checks.md`; this ticket must not duplicate those behaviors.
- Current production FITL GameSpecDoc does not yet encode full production coup-round `commitment`/`support` action pipelines; related momentum effects that require those pipelines cannot be implemented faithfully here without introducing placeholder logic.
- `mom_medevacShaded` "executing faction remains eligible" is event/turn-flow behavior, not operation/SA formula behavior. It belongs with event-card encoding/eligibility wiring, not this ticket.
- Trail modifications are currently implemented in multiple operation/SA branches. To keep architecture robust and avoid drift, this ticket should centralize ADSID-style follow-up logic using reusable YAML macros rather than duplicating ad hoc `if` blocks.

## Architecture rationale

- **Do now**: implement formula modifiers that map cleanly to existing operation/SA profiles and selectors.
- **Defer explicitly**: phase-specific or event-sequencing effects that need production coup/event wiring.
- **Prefer reusable macros** for repeated "resource-on-trail-change" and "aid/cost override" behaviors, so future capability/momentum additions remain declarative and maintainable.

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
- `mom_medevacUnshaded` commitment-phase casualty transfer (requires production commitment-phase behavior modeling)
- `mom_blowtorchKomer` coup support-phase pacification cost override (requires production support-phase modeling)
- `mom_medevacShaded` remain-eligible effect (event/turn-flow concern; prohibition already covered in ticket 007)

## Formula modifications to implement

### Wild Weasels (`mom_wildWeasels`, Card #5, Shaded)
- Air Strike: either Degrades Trail OR may remove just 1 piece (not 1-6)
- Modifies Air Strike resolution options

### ADSID (`mom_adsid`, Card #7, Unshaded)
- -6 NVA Resources at any Trail# change
- Triggers when operation/SA branches change Trail in production GameSpecDoc scope

### Medevac Unshaded (`mom_medevacUnshaded`, Card #15a)
- During this Commitment phase, all US Troop Casualties become Available
- **Deferred in this ticket** (production commitment phase not yet modeled)

### Medevac Shaded (`mom_medevacShaded`, Card #15b)
- Executing Faction remains Eligible (in addition to Air Lift prohibition in ticket 007)
- **Deferred in this ticket** (event/turn-flow handling, not operation/SA formula)

### Blowtorch Komer (`mom_blowtorchKomer`, Card #16, Unshaded)
- Pacify costs 1 Resource per step or Terror during Coup Round Support Phase (rule 6.3.1)
- **Deferred in this ticket** (production coup support phase not yet modeled)

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
- Already implemented in ticket 007; out of scope for code changes in this ticket

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm test` — All existing tests pass
- `node --test dist/test/integration/fitl-momentum-formula-mods.test.js`

### Integration test coverage

For each formula modification:
1. When momentum is `false` (inactive): operation resolves with normal formula
2. When momentum is `true` (active): operation resolves with modified formula
3. Verify the specific numeric change (e.g., Body Count: +3 Aid per Guerrilla, cost becomes 0)

Special cases:
- Claymores: test March-group activation removal only (Ambush prohibition is covered by ticket 007 tests)
- ADSID: test `-6` NVA Resources triggers specifically on Trail changes in covered operation/SA branches
- 559th: test Infiltrate space cap under active momentum alongside existing Typhoon cap behavior
- Deferred effects (Medevac/Blowtorch): add structural assertions or explicit defer notes; no placeholder runtime behavior

### Invariants that must remain true

- Formula modifications are declarative conditional branches in GameSpecDoc YAML
- No game-specific logic in engine/kernel/compiler
- Existing operation behavior unchanged when all momentum gvars are `false`
- Tests use `compileProductionSpec()` from `test/helpers/production-spec-helpers.ts`

## Outcome

- **Completion date**: 2026-02-14
- **What changed**:
  - Added declarative momentum formula logic in `data/games/fire-in-the-lake.md` for:
    - `mom_wildWeasels`: Air Strike removal capped at 1 and degrade-vs-remove behavior enforced by branch guards.
    - `mom_adsid`: reusable `mom-adsid-on-trail-change` macro and wiring on production Trail-changing branches.
    - `mom_claymores`: marching-group activation penalty (remove 1 moving guerrilla when activation condition is met).
    - `mom_559thTransportGrp`: Infiltrate selection capped to 1 space (merged with existing Typhoon max-space guard).
    - `mom_bodyCount`: reusable `mom-body-count-award-aid` macro plus ARVN Assault/Patrol legality+cost overrides and aid-award wiring.
  - Added `test/integration/fitl-momentum-formula-mods.test.ts` with runtime and structural checks for implemented formula modifiers.
  - Updated `test/integration/fitl-coin-operations.test.ts` assertions where ARVN Assault/Patrol contracts are now momentum-aware.
- **Deviations from original plan**:
  - Deferred `mom_medevacUnshaded`, `mom_blowtorchKomer`, and Medevac-shaded remain-eligible behavior remain deferred exactly as reassessed (production coup/support/event-turn-flow modeling not in this ticket).
  - Body Count aid validation on Assault is structural in this ticket; Patrol cost-eligibility is runtime-validated via legal-move availability.
- **Verification**:
  - `npm run build` passed
  - `npm run lint` passed
  - `npm test` passed
  - `node --test dist/test/integration/fitl-momentum-formula-mods.test.js` passed
