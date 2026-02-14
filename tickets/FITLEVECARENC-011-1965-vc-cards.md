# FITLEVECARENC-011: 1965 Period — VC-First Faction Order Cards

**Status**: TODO
**Priority**: P2
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.3, Phase 3)
**Depends on**: FITLEVECARENC-001

## Description

Encode the 1965 period cards where VC is the first faction in the order:

| # | Title | Faction Order | Complexity | Notes |
|---|-------|---------------|------------|-------|
| 95 | Westmoreland | VC, US, NVA, ARVN | High | Free Air Lift + Sweep/Assault + Air Strike |
| 98 | Long Tan | VC, US, ARVN, NVA | Medium | Piece placement or removal |
| 99 | Masher/White Wing | VC, US, ARVN, NVA | Medium | Free Sweep + Assault "as US" |
| 100 | Rach Ba Rai | VC, US, ARVN, NVA | Medium | Remove VC or non-Troop NVA; die roll |
| 102 | Cu Chi | VC, NVA, US, ARVN | Medium | Tunnel removal/placement |
| 104 | Main Force Bns | VC, NVA, US, ARVN | Medium | VC Capability |
| 105 | Rural Pressure | VC, NVA, ARVN, US | Low | Support/Opposition shifts |
| 106 | Binh Duong | VC, NVA, ARVN, US | Medium | Shifts + piece placement, no shaded |
| 108 | Draft Dodgers | VC, NVA, ARVN, US | Low | Conditional Troop movement |
| 109 | Nguyen Huu Tho | VC, NVA, ARVN, US | Medium | City shifts; Base + Guerrilla placement |
| 114 | Tri Quang | VC, ARVN, US, NVA | Medium | City Support setting; Opposition shifts |
| 116 | Cadres | VC, ARVN, NVA, US | Medium | VC Capability |

12 cards total.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 12 card definitions.
- `test/integration/fitl-events-1965-vc.test.ts` — **New file**. Integration tests.

## Out of Scope

- Other period/faction group cards.
- Any kernel/compiler changes.

## Encoding Notes

- **Card 104 (Main Force Bns)**: VC Capability. Tags: `["capability", "VC"]`.
- **Card 116 (Cadres)**: VC Capability. Tags: `["capability", "VC"]`.
- **Card 106 (Binh Duong)**: No shaded text.
- **Card 95 (Westmoreland)**: Complex multi-step with free operations.
- **Card 100 (Rach Ba Rai)**: Die roll for cube removal.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1965-vc.test.ts`:
   - All 12 cards compile, correct metadata, faction orders, text fields.
   - Cards 104, 116: capability `setVar`, tags `["capability", "VC"]`.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- All existing cards unchanged. Card IDs unique. Faction orders valid.
- Production spec compiles without errors.
