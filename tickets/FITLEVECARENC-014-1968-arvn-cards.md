# FITLEVECARENC-014: 1968 Period — ARVN-First Faction Order Cards

**Status**: TODO
**Priority**: P3
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.4, Phase 4)
**Depends on**: FITLEVECARENC-001

## Description

Encode the 1968 period cards where ARVN is the first faction in the order:

| # | Title | Faction Order | Complexity | Notes |
|---|-------|---------------|------------|-------|
| 61 | Armored Cavalry | ARVN, US, NVA, VC | Medium | ARVN Capability |
| 62 | Cambodian Civil War | ARVN, US, NVA, VC | High | Free Air Lift + Sweep; Base removal |
| 65 | International Forces | ARVN, US, NVA, VC | Low | Pieces from out-of-play; die roll |
| 71 | An Loc | ARVN, NVA, US, VC | Medium | Troop removal + placement |
| 74 | Lam Son 719 | ARVN, NVA, US, VC | Medium | Troop placement + Trail degrade |
| 77 | Detente | ARVN, NVA, VC, US | Medium | Resource halving |
| 80 | Light at the End of the Tunnel | ARVN, NVA, VC, US | High | Multi-step per-piece effects, no shaded |
| 84 | To Quoc | ARVN, VC, US, NVA | Medium | Piece placement per space |
| 88 | Phan Quang Dan | ARVN, VC, NVA, US | Low | Saigon shifts + Patronage |

9 cards total.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 9 card definitions.
- `test/integration/fitl-events-1968-arvn.test.ts` — **New file**. Integration tests.

## Out of Scope

- Other period/faction group cards.
- Any kernel/compiler changes.

## Encoding Notes

- **Card 61 (Armored Cavalry)**: ARVN Capability. Tags: `["capability", "ARVN"]`.
- **Card 77 (Detente)**: "Cut resources to half" requires division expression.
- **Card 80**: No shaded text. Complex per-piece effect loop.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1968-arvn.test.ts`:
   - All 9 cards compile, correct metadata, faction orders.
   - Card 61: capability `setVar`, tags `["capability", "ARVN"]`.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- All existing cards unchanged. Card IDs unique. Faction orders valid.
- Production spec compiles without errors.
