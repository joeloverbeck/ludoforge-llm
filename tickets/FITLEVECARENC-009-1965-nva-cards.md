# FITLEVECARENC-009: 1965 Period — NVA-First Faction Order Cards

**Status**: TODO
**Priority**: P2
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.3, Phase 3)
**Depends on**: FITLEVECARENC-001

## Description

Encode the 1965 period cards where NVA is the first faction in the order:

| # | Title | Faction Order | Complexity | Notes |
|---|-------|---------------|------------|-------|
| 34 | SA-2s | NVA, US, ARVN, VC | Medium | NVA Capability |
| 38 | McNamara Line | NVA, US, VC, ARVN | High | Momentum, no shaded |
| 39 | Oriskany | NVA, US, VC, ARVN | Medium | Momentum (shaded) |
| 46 | 559th Transport Grp | NVA, ARVN, VC, US | Medium | Momentum (unshaded) |
| 47 | Chu Luc | NVA, ARVN, VC, US | Medium | Troop placement |
| 53 | Sappers | NVA, VC, US, ARVN | Medium | Piece removal |
| 56 | Vo Nguyen Giap | NVA, VC, ARVN, US | High | Free March + free Op/SA |
| 59 | Plei Mei | NVA, VC, ARVN, US | Medium | Piece removal + free March/Attack |

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 8 card definitions.
- `test/integration/fitl-events-1965-nva.test.ts` — **New file**. Integration tests.

## Out of Scope

- 1965 cards where US, ARVN, or VC is first faction.
- Other period cards.
- Any kernel/compiler changes.

## Encoding Notes

- **Card 34 (SA-2s)**: NVA Capability. Tags: `["capability", "NVA"]`.
- **Card 38 (McNamara Line)**: No shaded text — `sideMode: "dual"` with empty/null shaded side, or use single branch on unshaded only. Momentum: `lastingEffects` with `duration: "round"`. Tags: `["momentum"]`.
- **Card 56 (Vo Nguyen Giap)**: Shaded has "free Marches into up to 3 spaces then executes any 1 free Op or SA within each". Complex multi-step. Flag if needed.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1965-nva.test.ts`:
   - All 8 cards compile, correct metadata, faction orders, text fields.
   - Card 34: capability `setVar`, tags `["capability", "NVA"]`.
   - Cards 38, 39, 46: momentum `lastingEffects` with `duration: "round"`.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- All existing cards unchanged. Card IDs unique. Faction orders valid.
- Production spec compiles without errors.
