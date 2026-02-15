# FITLEVECARENC-019: Momentum-Granting Card Cross-Validation

**Status**: ✅ COMPLETED
**Priority**: P3
**Complexity**: S
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.8)
**Depends on**: FITLEVECARENC-004, FITLEVECARENC-007, FITLEVECARENC-008, FITLEVECARENC-009, FITLEVECARENC-010, FITLEVECARENC-012, FITLEVECARENC-013, FITLEVECARENC-015

## Description

After all momentum-granting cards are encoded, run a single cross-validation pass over the compiled production spec to verify every momentum-tagged card uses canonical round-lasting momentum encoding (`lastingEffects` with `duration: "round"`, i.e. until Coup).

This ticket is intentionally invariant-oriented (aggregate validation), not another set of per-card behavior assertions already covered in era/card-specific tests.

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

### Assumptions (Reassessed)

- The authoritative source of truth is the compiled production `GameDef` event deck, not raw markdown text.
- There are **14** cards tagged `momentum`.
- There are **15** momentum lasting effects/markers because card **15 (Medevac)** has momentum on both unshaded and shaded sides.
- Existing integration tests already validate several individual momentum cards; this ticket adds complete aggregate coverage to prevent silent omissions.

## Files to Touch

- `test/integration/fitl-events-momentum-validation.test.ts` — **New file**. Validation test.

## Out of Scope

- Encoding any cards (done in prior tickets).
- Changing momentum/lasting effect definitions (Spec 28).
- Any kernel/compiler changes.
- Duplicating detailed per-card behavioral assertions already covered by existing FITL event tests.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-momentum-validation.test.ts`:
   - Compiles production spec and asserts no diagnostics.
   - Asserts the momentum-tagged card set exactly matches the 14-card canonical list above.
   - For each momentum-tagged card:
     - The expected side(s) contain momentum `lastingEffects`.
     - Each momentum `lastingEffect` has `duration: "round"`.
   - Asserts total momentum lasting effects across those cards is **15** (Medevac dual-side momentum).
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- No card definitions are changed by this ticket (read-only validation).
- Every momentum `lastingEffect` uses `duration: "round"` (maps to FITL's "until Coup").

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Added `test/integration/fitl-events-momentum-validation.test.ts` with aggregate invariant checks for all momentum-tagged cards.
  - Reassessed and corrected ticket assumptions to distinguish 14 momentum-tagged cards from 15 momentum lasting effects (Medevac dual-side).
- **Deviations from original plan**:
  - Expanded acceptance criteria to include explicit 14-card set equality and total momentum-effect count (15), improving drift detection.
- **Verification results**:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed.
