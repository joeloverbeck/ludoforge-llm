# FITLCAPMOMRVNLEA-001 - Capability Global Marker Definitions (19 Tri-State Markers)

**Status**: ✅ COMPLETED
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.1)
**Depends on**: None (this ticket now includes minimal generic global marker lattice definition support required to compile capability declarations)

## Goal

Define all 19 capability global markers in the FITL production GameSpecDoc (`data/games/fire-in-the-lake.md`). Each capability is a tri-state marker: `inactive` (default), `unshaded`, `shaded`.

This ticket also closes a verified architecture gap: the current codebase supports only per-space `markerLattices` and does not yet support top-level `globalMarkerLattices` declarations. To keep architecture clean and extensible (no capability-as-int aliasing workaround), this ticket includes minimal generic support for defining/compiling/validating top-level global marker lattices.

## File list it expects to touch

- `data/games/fire-in-the-lake.md` — Add top-level `globalMarkerLattices` section with 19 capability entries
- `src/cnl/*` parser/composition/compiler paths — recognize/merge/lower top-level `globalMarkerLattices`
- `src/kernel/*` core types + schemas + initial state + validation + hashing for global marker lattice definitions/state
- `test/unit/*` + `test/integration/*` — coverage for parser/compiler/kernel behavior and FITL production spec expectations

## Out of scope

- Conditional branches on operations that check capability state (FITLCAPMOMRVNLEA-002 through 005)
- Momentum markers (FITLCAPMOMRVNLEA-006)
- RVN Leader markers (FITLCAPMOMRVNLEA-009)
- Event cards that grant capabilities (Spec 29)
- `globalMarkerState` references and `setGlobalMarker`/`shiftGlobalMarker` effects (runtime manipulation/checking comes in later tickets)
- Any FITL-specific branches in engine/compiler code

## Deliverables

1. Add a top-level `globalMarkerLattices:` section to the production spec with entries for all 19 capabilities:

| # | ID | Faction | States |
|---|---|---|---|
| 4 | `cap_topGun` | US | inactive, unshaded, shaded |
| 8 | `cap_arcLight` | US | inactive, unshaded, shaded |
| 11 | `cap_abrams` | US | inactive, unshaded, shaded |
| 13 | `cap_cobras` | US | inactive, unshaded, shaded |
| 14 | `cap_m48Patton` | US | inactive, unshaded, shaded |
| 18 | `cap_caps` | US | inactive, unshaded, shaded |
| 19 | `cap_cords` | US | inactive, unshaded, shaded |
| 20 | `cap_lgbs` | US | inactive, unshaded, shaded |
| 28 | `cap_searchAndDestroy` | US | inactive, unshaded, shaded |
| 31 | `cap_aaa` | NVA | inactive, unshaded, shaded |
| 32 | `cap_longRangeGuns` | NVA | inactive, unshaded, shaded |
| 33 | `cap_migs` | NVA | inactive, unshaded, shaded |
| 34 | `cap_sa2s` | NVA | inactive, unshaded, shaded |
| 45 | `cap_pt76` | NVA | inactive, unshaded, shaded |
| 61 | `cap_armoredCavalry` | ARVN | inactive, unshaded, shaded |
| 86 | `cap_mandateOfHeaven` | ARVN | inactive, unshaded, shaded |
| 101 | `cap_boobyTraps` | VC | inactive, unshaded, shaded |
| 104 | `cap_mainForceBns` | VC | inactive, unshaded, shaded |
| 116 | `cap_cadres` | VC | inactive, unshaded, shaded |

Each entry follows the pattern:
```yaml
- id: "cap_topGun"
  states: ["inactive", "unshaded", "shaded"]
  defaultState: "inactive"
```

2. Add generic compiler/kernel support for top-level global marker lattice definitions so the section is parsed, validated, lowered to `GameDef`, and initialized in `GameState`.

## Acceptance criteria

### Specific tests that must pass

- `npm run build` — Build succeeds (no compile errors from production spec changes)
- `npm test` — All existing tests pass (no regressions)
- Verify via `compileProductionSpec()` that compiled `GameDef` includes all 19 `globalMarkerLattices` capability entries
- Add targeted unit coverage for parser/compiler/kernel handling of top-level `globalMarkerLattices`

### Invariants that must remain true

- All 19 entries use exactly the states `["inactive", "unshaded", "shaded"]` with `defaultState: "inactive"`
- IDs match the spec table exactly (`cap_topGun`, `cap_arcLight`, etc.)
- No FITL-specific capability logic is introduced in generic engine/compiler code
- Production spec changes are additive
- The production spec remains valid YAML (parseable without errors)

## Outcome

- **Completion date**: 2026-02-14
- **What changed**:
  - Added top-level `globalMarkerLattices` support to parser/composer/compiler/kernel types/schemas/state hashing/initialization.
  - Added 19 FITL capability tri-state global marker lattice declarations to `data/games/fire-in-the-lake.md`.
  - Added/updated tests to assert parsing, compilation, and initialization behavior for global marker lattices.
  - Updated impacted golden fixtures for the new canonical serialized fields.
- **Deviations from original plan**:
  - Original ticket assumed global marker primitive already existed and scoped changes to production YAML only.
  - Actual codebase lacked that primitive, so this ticket was corrected and expanded to include minimal generic infrastructure required for clean architecture (no stopgap capability-as-int aliasing).
- **Verification**:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed (150/150).
