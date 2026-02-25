# FITLGOLT4-004: Turn 4 Golden E2E Test

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test only
**Deps**: FITLGOLT4-003

## Problem

The FITL playbook golden E2E test suite (`fitl-playbook-golden.test.ts`) currently covers Turns 1-3. Turn 4 (Gulf of Tonkin) must be added to validate the full event execution flow: US plays event → free Air Strike → deployment of 6 pieces from out-of-play → NVA March + Infiltrate. This turn exercises the new `effectTiming: afterGrants` primitive and the `chooseN` + `forEach over binding` deployment pattern.

## Assumption Reassessment (2026-02-25)

1. **Golden test structure** — confirmed at `packages/engine/test/e2e/fitl-playbook-golden.test.ts`. Uses `PlaybookTurn` type with `moves` array and `expectedEndState`. Currently has `TURN_1`, `TURN_2`, `TURN_3` in `PLAYBOOK_TURNS` array.
2. **Playbook deck order** — confirmed at lines 27-41. Card-1 (Gulf of Tonkin) is 4th in deck, card-97 (Brinks Hotel) is 5th (lookahead for Turn 4).
3. **Turn 4 card** — Gulf of Tonkin: US first eligible (seatOrder `["US", "NVA", "ARVN", "VC"]`).
4. **Turn 4 playbook text** — detailed in `reports/fire-in-the-lake-playbook-turn-4.md`. Three logical moves: (a) US event (Air Strike + deployment), (b) US free Air Strike in Quang Tri, (c) NVA March + Infiltrate.
5. **Harness helpers** — `replayPlaybookTurn`, `replayPlaybookTurns`, `assertPlaybookSnapshot` available from `fitl-playbook-harness.ts`.

## Architecture Check

1. **Test-only change** — follows the exact pattern of existing Turn 1-3 tests. No engine code changes.
2. **Playbook fidelity** — move sequences and assertions derived directly from the official playbook text.
3. **No test infrastructure changes needed** — existing harness supports all required assertion patterns.

## What to Change

### 1. Add `TURN_4` constant

Add a `PlaybookTurn` constant modeling the Gulf of Tonkin turn with these moves:

**Move 1: US plays Event (Gulf of Tonkin unshaded)**
- Action: `event` with `side: 'unshaded'`, `eventCardId: 'card-1'`
- This enqueues the free Air Strike grant and (with `effectTiming: afterGrants`) defers the deployment effects
- Intermediate assertions: free operation grant pending, no deployment yet

**Move 2: US free Air Strike in Quang Tri**
- Action: `airStrike` as free operation
- Targets: Quang Tri (remove 2 active VC guerrillas to available)
- Side effects per playbook:
  - Quang Tri shifts from Neutral to Passive Opposition
  - VC victory marker adjusts (opposition × population)
  - Trail degrades from 2 to 1
- After grant consumption, deferred deployment effects fire:
  - `chooseN` selects 6 pieces (1 Base + 5 Troops) from US out-of-play
  - Pieces placed: 2 Troops → Saigon, 3 Troops + 1 Base → Hue
- Intermediate assertions: VC guerrillas removed, opposition shifted, trail degraded, pieces deployed

**Move 3: NVA Operation (March) + Special Activity (Infiltrate)**
- Action: `march` as compound operation with `infiltrate` special activity
- March destinations: Quang Tri, Kien Phong, Kien Giang
- March costs: 3 NVA resources (1 per destination province)
- Troop movements per playbook:
  - 2 NVA guerrillas from Parrot's Beak → Kien Phong
  - 2 NVA guerrillas from Parrot's Beak → Kien Giang
  - 2 NVA guerrillas from Central Laos → Quang Tri
  - 5 NVA guerrillas from North Vietnam → Quang Tri
- Control changes: NVA Control in Kien Phong, Kien Giang, Quang Tri
- NVA victory marker: 4 → 10 (population 2+2+2)
- Infiltrate in Southern Laos: place 2 NVA Troops, exchange 3 guerrillas for 3 Troops
- Infiltrate in Kien Giang: shift opposition Active → Passive, replace VC guerrilla with NVA guerrilla

### 2. Add `TURN_4` to `PLAYBOOK_TURNS`

Update the array from `[TURN_1, TURN_2, TURN_3]` to `[TURN_1, TURN_2, TURN_3, TURN_4]`.

### 3. End-state assertions

Verify after Turn 4 completes:
- **Eligibility**: VC and ARVN eligible, US and NVA ineligible
- **Trail**: 1
- **NVA Resources**: 2 (was 5, spent 3 on March)
- **NVA victory marker**: 10 (was 4, +6 from 3 controlled provinces × pop 2)
- **VC victory marker**: 23 (was 25, −2 from Kien Giang opposition shift)
- **Quang Tri**: Passive Opposition, NVA Control, 7 NVA guerrillas + existing pieces minus 2 removed VC guerrillas
- **Kien Phong**: NVA Control, 2 NVA guerrillas + existing VC pieces
- **Kien Giang**: Passive Opposition (was Active), NVA Control, 4 NVA guerrillas (3 original + 1 replacing VC)
- **Southern Laos**: 1 NVA Base + 5 NVA Troops (2 placed + 3 exchanged from guerrillas)
- **Saigon**: +2 US Troops from deployment
- **Hue**: +3 US Troops + 1 US Base from deployment

## Files to Touch

- `packages/engine/test/e2e/fitl-playbook-golden.test.ts` (modify) — add `TURN_4` and update `PLAYBOOK_TURNS`

## Out of Scope

- Turns 5+ (future tickets)
- Modifying the playbook harness infrastructure
- Engine code changes
- Encoding changes (handled by FITLGOLT4-002 and FITLGOLT4-003)

## Acceptance Criteria

### Tests That Must Pass

1. `TURN_4` replays successfully through all 3 moves without errors.
2. All intermediate state assertions pass (post-Air-Strike, post-deployment, post-March).
3. End-state assertions match playbook text for all affected zones, tracks, and markers.
4. Turns 1-3 continue to pass (no regression).
5. Existing suite: `pnpm turbo test --force`

### Invariants

1. Deterministic replay — same seed + same moves = identical final state.
2. No engine code modified in this ticket.
3. Move sequences derived from official playbook text, not invented.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/fitl-playbook-golden.test.ts` — add `TURN_4` with comprehensive intermediate and end-state assertions per playbook Turn 4 text.

### Commands

1. `pnpm -F @ludoforge/engine test:e2e`
2. `pnpm -F @ludoforge/engine test:all`
