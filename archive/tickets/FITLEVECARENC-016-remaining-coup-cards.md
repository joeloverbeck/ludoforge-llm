# FITLEVECARENC-016: Remaining Coup Cards (#126-130)

**Status**: ✅ COMPLETED
**Priority**: P3
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.5, Phase 5a)
**Depends on**: FITLEVECARENC-006

## Description

Encode the 5 remaining coup cards (#126-130). Card #125 (Nguyen Khanh) is already handled in FITLEVECARENC-006. Each coup card has:
- `sideMode: "single"`
- `tags: ["coup"]`
- RVN Leader card bookkeeping via `addVar(leaderBoxCardCount, +1)`.
- Successful leader-change coups (`126`-`128`) set `activeLeader` explicitly.
- Failed Attempt coups (`129`-`130`) keep `activeLeader` unchanged.
- Leader behavior implemented in shared action/macros keyed by `globalMarkers.activeLeader` (not per-card `lastingEffects`).
- Monsoon preview remains turn-flow/lookahead behavior and is not encoded per card.

| # | Title | Leader Effect |
|---|-------|---------------|
| 126 | Young Turks | Each ARVN Govern SA adds +2 Patronage |
| 127 | Nguyen Cao Ky | Pacification costs 4 Resources per Terror or level |
| 128 | Nguyen Van Thieu | No effect (Stabilizer) |
| 129 | Failed Attempt | ARVN removes 1 in 3 cubes per space; placed below any RVN Leader |
| 130 | Failed Attempt | Same as 129 (duplicate card) |

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` — Add cards `126`-`130`.
- `test/integration/fitl-events-coup-remaining.test.ts` — **New file** for card-structure assertions.
- `test/integration/fitl-rvn-leader.test.ts` — Extend existing behavior coverage where needed.

## Out of Scope

- Card #125 (Nguyen Khanh) — handled in FITLEVECARENC-006.
- Pivotal events.
- Coup round trigger mechanism.
- Any kernel/compiler changes or new leader-effect primitives.

## Encoding Notes

- **Cards 129, 130**: Both are "Failed Attempt" with identical *immediate* desertion effect (`rvn-leader-failed-attempt-desertion` macro). Use distinct IDs (`card-129`, `card-130`) and keep deck manipulation text as metadata (`unshaded.text`), not runtime logic.
- **Card 128 (Thieu)**: "No effect" means no additional action gating/bonus logic beyond setting `activeLeader` and incrementing `leaderBoxCardCount`.
- **All coup cards**: Include `addVar(leaderBoxCardCount, +1)`. Cards `126`-`128` also include `setGlobalMarker(activeLeader, <leader>)`; cards `129`-`130` do not mutate `activeLeader`.
- **Architecture guardrail**: Do not duplicate leader-specific runtime logic inside event cards; keep behavior centralized in shared action/macro pipelines.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-coup-remaining.test.ts`:
   - All 5 cards compile, `sideMode: "single"`, tags include `"coup"`.
   - Cards `126`-`128` have `setGlobalMarker` for `activeLeader` with the correct leader state.
   - Cards `126`-`130` have `addVar` for `leaderBoxCardCount` +1.
   - Card 126 text/effects encode Young Turks leader handoff only (behavior asserted in leader integration tests).
   - Card 127 text/effects encode Ky leader handoff only (behavior asserted in leader integration tests).
   - Card 128 has no extra per-card effects beyond leader handoff.
   - Cards 129, 130 both invoke `rvn-leader-failed-attempt-desertion` with identical effect shape.
2. `test/integration/fitl-rvn-leader.test.ts`:
   - Existing leader behavior assertions still pass.
   - Add edge-case assertion that card 129 and card 130 compile with identical desertion effects and distinct IDs/order.
3. `npm run build` passes.
4. `npm test` passes.

### Invariants That Must Remain True

- Card 125 definition unchanged.
- All existing cards unchanged. Card IDs unique.
- Production spec compiles without errors.
- Leader behavior remains centralized by `activeLeader` checks in shared action/macro logic.

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Added production coup card definitions `card-126` through `card-130` in `data/games/fire-in-the-lake/41-content-event-decks.md`.
  - Added `test/integration/fitl-events-coup-remaining.test.ts` for structural encoding assertions.
  - Extended `test/integration/fitl-rvn-leader.test.ts` with duplicate Failed Attempt invariant coverage.
- **Deviations from original plan**:
  - Replaced outdated per-card `lastingEffects` assumptions with the current marker-driven architecture where leader behavior stays centralized in shared action/macro pipelines.
  - Failed Attempt validation checks semantic desertion effect structure after macro expansion rather than raw macro call text.
- **Verification results**:
  - `npm run build` passed.
  - `npm run test:integration` passed.
  - `npm test` passed.
  - `npm run lint` passed.
