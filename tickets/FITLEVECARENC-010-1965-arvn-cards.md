# FITLEVECARENC-010: 1965 Period — ARVN-First Faction Order Cards

**Status**: TODO
**Priority**: P2
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.3, Phase 3)
**Depends on**: FITLEVECARENC-001

## Description

Encode the 1965 period cards where ARVN is the first faction in the order:

| # | Title | Faction Order | Complexity | Notes |
|---|-------|---------------|------------|-------|
| 64 | Honolulu Conference | ARVN, US, NVA, VC | Medium | Aid/Patronage changes, no shaded |
| 67 | Amphib Landing | ARVN, US, VC, NVA | Medium | Troop relocation + free Sweep/Assault |
| 69 | MACV | ARVN, US, VC, NVA | High | Free Special Activities, no shaded |
| 70 | ROKs | ARVN, US, VC, NVA | High | "As if US" Sweep/Assault |
| 72 | Body Count | ARVN, NVA, US, VC | Medium | Momentum (unshaded) |
| 76 | Annam | ARVN, NVA, VC, US | Medium | Resource loss + Patronage |
| 78 | General Landsdale | ARVN, NVA, VC, US | Medium | Momentum (shaded) |
| 81 | CIDG | ARVN, VC, US, NVA | Medium | Replace pieces |
| 82 | Domino Theory | ARVN, VC, US, NVA | Low | Already exists (FITLEVECARENC-001) |
| 83 | Election | ARVN, VC, US, NVA | Low | Support shifts + Aid |
| 85 | USAID | ARVN, VC, US, NVA | Low | Support shifts |
| 86 | Mandate of Heaven | ARVN, VC, NVA, US | Medium | ARVN Capability |
| 87 | Nguyen Chanh Thi | ARVN, VC, NVA, US | Medium | Piece placement + shifts |
| 89 | Tam Chau | ARVN, VC, NVA, US | Low | Saigon shifts + Patronage |
| 90 | Walt Rostow | ARVN, VC, NVA, US | Medium | Piece placement/relocation |

**Note**: Card 82 (Domino Theory) is already encoded. Skip it here. That leaves 14 cards.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 14 card definitions.
- `test/integration/fitl-events-1965-arvn.test.ts` — **New file**. Integration tests.

## Out of Scope

- Card 82 (Domino Theory) — already handled in FITLEVECARENC-001.
- Other period/faction group cards.
- Any kernel/compiler changes.

## Encoding Notes

- **Card 86 (Mandate of Heaven)**: ARVN Capability. Tags: `["capability", "ARVN"]`.
- **Cards 64, 69**: No shaded text. `sideMode: "dual"` with null/empty shaded, or document convention.
- **Card 70 (ROKs)**: "As if US" modifier on Sweep/Assault. May need encoding convention for "treat as" mechanics. Flag if needed.
- **Momentum** (72 unshaded, 78 shaded): `lastingEffects` with `duration: "round"`.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1965-arvn.test.ts`:
   - All 14 cards compile, correct metadata, faction orders, text fields.
   - Card 86: capability `setVar`, tags `["capability", "ARVN"]`.
   - Cards 72, 78: momentum `lastingEffects` with `duration: "round"`.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- Card 82 definition unchanged by this ticket.
- All existing cards unchanged. Card IDs unique. Faction orders valid.
- Production spec compiles without errors.
