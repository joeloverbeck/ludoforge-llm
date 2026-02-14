# FITLEVECARENC-015: 1968 Period — VC-First Faction Order Cards

**Status**: TODO
**Priority**: P3
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.4, Phase 4)
**Depends on**: FITLEVECARENC-001

## Description

Encode the 1968 period cards where VC is the first faction in the order:

| # | Title | Faction Order | Complexity | Notes |
|---|-------|---------------|------------|-------|
| 91 | Bob Hope | VC, US, NVA, ARVN | Medium | Troop relocation + Casualties |
| 92 | SEALORDS | VC, US, NVA, ARVN | Medium | Free Sweep/Assault around Can Tho |
| 94 | Tunnel Rats | VC, US, NVA, ARVN | Medium | Tunnel placement/removal, no shaded |
| 96 | APC | VC, US, ARVN, NVA | High | Free Pacify; Tet Offensive reference |
| 103 | Kent State | VC, NVA, US, ARVN | Medium | Casualties + free LimOp |
| 111 | Agent Orange | VC, ARVN, US, NVA | Medium | Flip + free Air Strikes |
| 113 | Ruff Puff | VC, ARVN, US, NVA | Medium | Police placement; piece replacement |
| 115 | Typhoon Kate | VC, ARVN, US, NVA | Medium | Momentum (unshaded), no shaded |
| 117 | Corps Commander | VC, ARVN, NVA, US | Medium | Troop placement + Sweep; die roll |
| 119 | My Lai | VC, ARVN, NVA, US | Medium | Opposition + piece placement |
| 120 | US Press Corps | VC, ARVN, NVA, US | Medium | Conditional piece movement |

11 cards total.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 11 card definitions.
- `test/integration/fitl-events-1968-vc.test.ts` — **New file**. Integration tests.

## Out of Scope

- Other period/faction group cards.
- Any kernel/compiler changes.

## Encoding Notes

- **Card 96 (APC)**: References Tet Offensive card (#124). Shaded text says "If Tet Offensive played, return it to VC. If not, VC execute 'General uprising'." Complex cross-card reference.
- **Card 115 (Typhoon Kate)**: Momentum. No shaded text. Tags: `["momentum"]`.
- **Cards 94, 115**: No shaded text.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1968-vc.test.ts`:
   - All 11 cards compile, correct metadata, faction orders.
   - Card 115: momentum `lastingEffects` with `duration: "round"`.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- All existing cards unchanged. Card IDs unique. Faction orders valid.
- Production spec compiles without errors.
