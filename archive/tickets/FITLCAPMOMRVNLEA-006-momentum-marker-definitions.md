# FITLCAPMOMRVNLEA-006 - Momentum Marker Definitions (15 Boolean-like Global Vars)

**Status**: ✅ COMPLETED
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.3)
**Depends on**: None (uses existing global var pipeline)

## Goal

Define all 15 momentum markers as global vars in the FITL production GameSpecDoc (`data/games/fire-in-the-lake.md`).
Each marker is represented as a first-class `boolean` gvar with default `false`.
This ticket is data-definition only: no action legality/effect behavior changes.

## Assumption Reassessment

- Corrected and implemented: runtime/compiler variable schema now supports both `int` and `boolean` vars for `globalVars`/`perPlayerVars`.
- Confirmed: `compileProductionSpec()` exists and is the canonical FITL production compilation path used by tests.
- Confirmed: `data/games/fire-in-the-lake.md` currently does not define any `mom_*` global vars.
- Corrected: this ticket must include explicit tests for momentum var presence/shape; relying on indirect coverage is insufficient.
- Corrected: do **not** assume coup Reset clearing is already implemented/verified for these markers in this ticket. Reset behavior remains out of scope and is handled in follow-on momentum behavior tickets.

## Architecture Rationale

- Keeping momentum as additive gvar declarations in YAML is aligned with engine-agnostic architecture.
- Using first-class booleans for momentum removes integer-flag encoding and keeps variable semantics explicit at schema/runtime level.
- No aliasing/back-compat shims are added; downstream behavior tickets should consume canonical `mom_*` ids directly.

## File list it expects to touch

- `data/games/fire-in-the-lake.md` - Add 15 momentum `globalVars` declarations
- `test/integration/fitl-momentum-marker-definitions.test.ts` (new) - Verify production compile includes all momentum vars with canonical boolean defaults

## Out of scope

- Momentum prohibition preconditions on operations/SAs (`FITLCAPMOMRVNLEA-007`)
- Momentum formula modifications on operations (`FITLCAPMOMRVNLEA-008`)
- Event cards that set momentum active (Spec 29)
- Coup Reset logic that clears active momentum markers
- Capability definitions/branches (`FITLCAPMOMRVNLEA-001` through `FITLCAPMOMRVNLEA-005`)
- RVN Leader (`FITLCAPMOMRVNLEA-009`, `FITLCAPMOMRVNLEA-010`)
- Any engine/kernel/compiler source changes

## Deliverables

Add the following 15 momentum gvars to `globalVars:`:

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

Each declaration uses:

```yaml
- { name: mom_wildWeasels, type: boolean, init: false }
```

**Medevac mutual exclusion**: `mom_medevacUnshaded` and `mom_medevacShaded` remain separate gvars. Mutual exclusivity is enforced by event behavior, not by var schema.

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm run lint`
- `npm test`
- `node --test dist/test/integration/fitl-momentum-marker-definitions.test.js`

### Invariants that must remain true

- All 15 momentum gvars compile with `type: boolean`, `init: false`
- IDs match the spec table exactly
- Change is additive: no existing global var definitions are removed/renamed
- Production spec remains valid and compilable via `compileProductionSpec()`
- Engine/kernel/compiler remain game-agnostic while adding generic boolean variable support

## Outcome

- Completion date: 2026-02-14
- Actually changed:
  - Added generic first-class `boolean` variable support across compiler, runtime, validators, state schemas, and hash encoding.
  - Converted all 15 `mom_*` momentum global vars in `data/games/fire-in-the-lake.md` to `type: boolean` with `init: false`.
  - Added `test/integration/fitl-momentum-marker-definitions.test.ts` to verify canonical momentum IDs and boolean var shape.
  - Added/updated regression tests to cover boolean set/add semantics and schema acceptance.
- Deviations from original plan:
  - Expanded scope from data-only int flags to a generic architecture upgrade for boolean vars (cleaner long-term model).
  - Expanded expected touched files to include runtime/compiler/schema updates and direct tests.
- Verification results:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed.
  - `node --test dist/test/integration/fitl-momentum-marker-definitions.test.js` passed.
