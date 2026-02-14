# FITLEVECARENC-019: Momentum-Granting Card Cross-Validation

**Status**: TODO
**Priority**: P3
**Complexity**: S
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.8)
**Depends on**: FITLEVECARENC-004, FITLEVECARENC-007, FITLEVECARENC-008, FITLEVECARENC-009, FITLEVECARENC-010, FITLEVECARENC-012, FITLEVECARENC-013, FITLEVECARENC-015

## Description

After all momentum-granting cards are encoded, run a validation pass to verify each card correctly uses `lastingEffects` with `duration: "round"` (= until Coup).

### Expected Momentum Cards

| # | Title | Which Side | Momentum Effect |
|---|-------|-----------|-----------------|
| 5 | Wild Weasels | Shaded | Air Strike restriction |
| 7 | ADSID | Unshaded | -6 NVA Resources at Trail change |
| 10 | Rolling Thunder | Shaded | No Air Strike until Coup |
| 15 | Medevac | Both sides | Unshaded: Troop Casualties Available. Shaded: No Air Lift |
| 16 | Blowtorch Komer | Unshaded | Pacify costs 1 Resource |
| 17 | Claymores | Unshaded | No Ambush + marching Guerrilla removal |
| 22 | Da Nang | Shaded | No Air Strike until Coup |
| 38 | McNamara Line | Unshaded | No Infiltrate or Trail Improvement by Rally |
| 39 | Oriskany | Shaded | No Trail Degrade |
| 41 | Bombing Pause | Unshaded | No Air Strike until Coup |
| 46 | 559th Transport Grp | Unshaded | Infiltrate max 1 space |
| 72 | Body Count | Unshaded | Assault/Patrol +3 Aid per Guerrilla, cost 0 |
| 78 | General Landsdale | Shaded | No US Assault until Coup |
| 115 | Typhoon Kate | Unshaded | No Air Lift/Transport/Bombard, SAs max 1 space |

## Files to Touch

- `test/integration/fitl-events-momentum-validation.test.ts` — **New file**. Validation test.

## Out of Scope

- Encoding any cards (done in prior tickets).
- Changing momentum/lasting effect definitions (Spec 28).
- Any kernel/compiler changes.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-momentum-validation.test.ts`:
   - For each card with `tags` including `"momentum"`:
     - The specified side (unshaded or shaded per the table above) contains `lastingEffects`.
     - Each `lastingEffect` has `duration: "round"`.
   - All 14 momentum cards are accounted for.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- No card definitions are changed by this ticket (read-only validation).
- All `lastingEffects` use `duration: "round"` (maps to FITL's "until Coup").
