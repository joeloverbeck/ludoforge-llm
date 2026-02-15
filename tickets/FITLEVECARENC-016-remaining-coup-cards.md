# FITLEVECARENC-016: Remaining Coup Cards (#126-130)

**Status**: TODO
**Priority**: P3
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.5, Phase 5a)
**Depends on**: FITLEVECARENC-006

## Description

Encode the 5 remaining coup cards (#126-130). Card #125 (Nguyen Khanh) is already handled in FITLEVECARENC-006. Each coup card has:
- `sideMode: "single"`
- `tags: ["coup"]`
- RVN Leader change effect
- Leader-specific lasting effects
- Monsoon preview effects

| # | Title | Leader Effect |
|---|-------|---------------|
| 126 | Young Turks | Each ARVN Govern SA adds +2 Patronage |
| 127 | Nguyen Cao Ky | Pacification costs 4 Resources per Terror or level |
| 128 | Nguyen Van Thieu | No effect (Stabilizer) |
| 129 | Failed Attempt | ARVN removes 1 in 3 cubes per space; placed below any RVN Leader |
| 130 | Failed Attempt | Same as 129 (duplicate card) |

## Files to Touch

- `data/games/fire-in-the-lake/*.md` — Add 5 card definitions.
- `test/integration/fitl-events-coup-remaining.test.ts` — **New file**. Integration tests.

## Out of Scope

- Card #125 (Nguyen Khanh) — handled in FITLEVECARENC-006.
- Pivotal events.
- Coup round trigger mechanism.
- Any kernel/compiler changes.

## Encoding Notes

- **Cards 129, 130**: Both are "Failed Attempt" with identical effects. They need distinct `card-129` and `card-130` IDs but share the same effect pattern: remove 1/3 of ARVN cubes per space (round down). The "place below any RVN Leader card" is a deck manipulation effect.
- **Card 128 (Thieu)**: "No effect" — still needs `setGlobalMarker` for leader change + `leaderBoxCardCount` increment. The lasting effect is empty (no restriction).
- **All coup cards**: Must include `setGlobalMarker` for `activeLeader` and `addVar` for `leaderBoxCardCount`.
- **Monsoon**: All coup cards have the same monsoon preview rule. This is a structural property of coup cards, not encoded per-card. Document this convention.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-coup-remaining.test.ts`:
   - All 5 cards compile, `sideMode: "single"`, tags include `"coup"`.
   - Each card has `setGlobalMarker` for `activeLeader` with the correct leader state.
   - Each card has `addVar` for `leaderBoxCardCount` +1.
   - Card 126: `lastingEffects` for Govern +2 Patronage bonus.
   - Card 127: `lastingEffects` for Pacification cost 4.
   - Card 128: No `lastingEffects` (or empty lasting effects).
   - Cards 129, 130: `lastingEffects` for cube removal, same structure.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- Card 125 definition unchanged.
- All existing cards unchanged. Card IDs unique.
- Production spec compiles without errors.
