# FITLCAPMOMRVNLEA-006 - Momentum Marker Definitions (15 Boolean Global Vars)

**Status**: Pending
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.3)
**Depends on**: None (uses existing boolean gvar infrastructure)

## Goal

Define all 15 momentum markers as boolean global vars in the FITL production GameSpecDoc (`data/games/fire-in-the-lake.md`). Each is a boolean gvar defaulting to `false`, set `true` by event cards, and cleared to `false` at coup Reset phase. This ticket adds the data declarations only — prohibition/formula checks are in tickets 007-008.

## File list it expects to touch

- `data/games/fire-in-the-lake.md` — Add 15 momentum boolean gvars to `globalVars` section

## Out of scope

- Momentum prohibition preconditions on operations/SAs (FITLCAPMOMRVNLEA-007)
- Momentum formula modifications on operations (FITLCAPMOMRVNLEA-008)
- Momentum expiry at coup Reset (already handled by foundation Reset logic; verify only)
- Event cards that set momentum `true` (Spec 29)
- Capability definitions and branches (FITLCAPMOMRVNLEA-001 through 005)
- RVN Leader (FITLCAPMOMRVNLEA-009, 010)
- Any engine/kernel/compiler source changes

## Deliverables

Add the following 15 boolean gvars to the `globalVars:` section:

| # | ID | Side | Effect Summary |
|---|---|---|---|
| 5 | `mom_wildWeasels` | Shaded | Air Strike: Degrade Trail OR remove just 1 piece |
| 7 | `mom_adsid` | Unshaded | -6 NVA Resources at any Trail# change |
| 10 | `mom_rollingThunder` | Shaded | No Air Strike until Coup |
| 15a | `mom_medevacUnshaded` | Unshaded | This Commitment, all Troop Casualties Available |
| 15b | `mom_medevacShaded` | Shaded | No Air Lift until Coup. Executing Faction remains Eligible. |
| 16 | `mom_blowtorchKomer` | Unshaded | Pacify costs 1 Resource per step/Terror (Coup Round Support Phase) |
| 17 | `mom_claymores` | Unshaded | No Ambush; remove 1 Guerrilla each Marching group that Activates |
| 22 | `mom_daNang` | Shaded | No Air Strike until Coup |
| 38 | `mom_mcnamaraLine` | Single | No Infiltrate or Trail Improvement by Rally until Coup |
| 39 | `mom_oriskany` | Shaded | No Degrade of Trail (Air Strike/Coup, not Events) |
| 41 | `mom_bombingPause` | Single | No Air Strike until Coup |
| 46 | `mom_559thTransportGrp` | Unshaded | Infiltrate max 1 space |
| 72 | `mom_bodyCount` | Unshaded | Assault/Patrol +3 Aid per Guerrilla removed, cost 0 |
| 78 | `mom_generalLansdale` | Shaded | No US Assault until Coup |
| 115 | `mom_typhoonKate` | Single | No Air Lift/Transport/Bombard; all other SAs max 1 space |

Each entry follows the pattern:
```yaml
- { name: mom_wildWeasels, type: int, init: 0, min: 0, max: 1 }
```

Note: Using `int` with 0/1 if the existing gvar system doesn't support a `boolean` type directly. Match whatever pattern the existing production spec uses for boolean-like gvars.

**Medevac mutual exclusion**: `mom_medevacUnshaded` and `mom_medevacShaded` are separate gvars. Mutual exclusivity is enforced by event card effects (Spec 29), not by the gvar definitions.

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm test` — All existing tests pass
- Verify via `compileProductionSpec()` that the compiled `GameDef` includes all 15 momentum gvars with correct defaults

### Invariants that must remain true

- All 15 momentum gvars default to `0` (false)
- IDs match the spec table exactly
- No existing gvars are modified — only additive changes
- The production spec remains valid YAML
- No game-specific logic in engine/kernel/compiler
