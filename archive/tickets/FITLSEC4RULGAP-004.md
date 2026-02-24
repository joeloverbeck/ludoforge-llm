# FITLSEC4RULGAP-004: Air Lift Multi-Destination Redistribution

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: None — data + tests only
**Deps**: Spec 46 (`specs/46-fitl-section4-rules-gaps.md`)

## Problem

Rule 4.2.2: "Move any US Troops and up to 4 ARVN Troops, Rangers, or Irregulars among any 4 spaces (2 spaces during Monsoon, 2.3.9; not North Vietnam, 1.4.2)."

The `air-lift-profile` (lines ~3319-3486 in `30-rules-actions.md`) forces ALL piece movement to a single destination via `chooseOne` (line ~3345-3347). The rules say "among any 4 spaces" — pieces can be redistributed across multiple origin/destination pairs within the selected space pool. Any of the 4 spaces can serve as both origin and destination.

This is the most complex gap because it requires restructuring the profile's movement logic from single-destination to per-piece destination selection.

## Assumption Reassessment (2026-02-24)

1. `data/games/fire-in-the-lake/30-rules-actions.md` lines ~3319-3486 contain the full `air-lift-profile`.
2. The current flow: `chooseN` spaces → `chooseOne` single destination → move all US Troops there → move up to 4 ARVN pieces there.
3. The kernel supports `chooseOne` per piece within a `forEach` loop, but this must use templated binds (for example `'$pieceDestination@{$piece}'`) so each piece gets an independent decision ID.
4. Monsoon 2-space limit is enforced in turn-flow `monsoon.restrictedActions` (`airLift` `maxParam` on `spaces`) rather than this profile's `chooseN.max`.
5. North Vietnam exclusion filter on space selection is already correct — this should be preserved.
6. Irregulars are encoded as US faction guerrillas (`faction: US`, `type: guerrilla`) and must share the same 4-piece cap bucket as ARVN Troops/Rangers per rule text.

## Architecture Check

1. This is a YAML restructuring of the Air Lift profile's movement stages. The DSL already supports per-piece destination selection via `chooseOne` inside `forEach` with templated bind names.
2. No new kernel primitives needed — use existing queries/effects (`mapSpaces`, `tokensInMapSpaces`, `concat`, `binding`, `chooseOne`, `chooseN`, `moveToken`).
3. The restructuring replaces the single-destination pattern with a per-piece-destination pattern, which is more complex but accurately models the rule.
4. No backwards-compatibility shim introduced.

## What to Change

### 1. Restructure Air Lift movement stages

In `data/games/fire-in-the-lake/30-rules-actions.md`, `air-lift-profile`:

**Remove**: The `select-destination` stage that forces a single `$airLiftDestination`.

**Replace movement stages** with per-piece destination selection:

#### US Troops (unlimited):
Gather US Troops from the selected spaces, choose any subset to move (`chooseN` min 0), and for each selected troop choose a destination from the selected spaces (including current space). Move only when destination differs from current zone.

#### ARVN + Irregular pieces (4-piece cap):
Gather ARVN Troops/Rangers plus US Irregulars across selected spaces, choose up to 4 total to move, and for each selected piece choose a destination from the selected spaces. Move only when destination differs from current zone.

**Sketch** (ARVN movement):
```yaml
- stage: move-arvn-pieces
  effects:
    - chooseN:
        bind: $liftPieces
        options:
          query: concat
          sources:
            - query: tokensInMapSpaces
              spaceFilter:
                op: in
                item: { ref: zoneProp, zone: $zone, prop: id }
                set: { ref: binding, name: spaces }
              filter:
                - { prop: faction, eq: ARVN }
                - { prop: type, op: in, value: [troops, guerrilla] }
            - query: tokensInMapSpaces
              spaceFilter:
                op: in
                item: { ref: zoneProp, zone: $zone, prop: id }
                set: { ref: binding, name: spaces }
              filter:
                - { prop: faction, eq: US }
                - { prop: type, eq: guerrilla }
        min: 0
        max: 4
    - forEach:
        bind: $piece
        over: { query: binding, name: $liftPieces }
        effects:
          - chooseOne:
              bind: $pieceDestination
              options: { query: binding, name: spaces }
          - if:
              when: { op: '!=', left: { ref: tokenZone, token: $piece }, right: $pieceDestination }
              then:
                - moveToken:
                    token: $piece
                    from: { zoneExpr: { ref: tokenZone, token: $piece } }
                    to: { zoneExpr: $pieceDestination }
```

### 2. Preserve Irregulars under the 4-piece cap

Irregulars are US guerrillas in data and must remain included in the same 4-piece Air Lift cap bucket.

### 3. Preserve existing constraints

- North Vietnam exclusion on space selection: already in the `chooseN` filter — keep as-is.
- Monsoon 2-space limit: already enforced by turn-flow monsoon `maxParam` restriction for `airLift.spaces` — keep as-is.

### 4. Update tests

Add structural and runtime tests for multi-destination Air Lift.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — restructure `air-lift-profile`, ~lines 3319-3486)
- `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts` (modify — add Air Lift multi-destination assertions)

## Out of Scope

- Any kernel/compiler source code.
- Air Strike profile — correct and unrelated.
- Advise profile — correct and unrelated.
- Monsoon detection logic — already correct in turn-flow monsoon restrictions.
- North Vietnam filtering — already correct in space selection.

## Acceptance Criteria

### Tests That Must Pass

1. Structural test: Air Lift profile has NO single `$airLiftDestination` binding forcing all pieces to one space.
2. Structural test: Air Lift US Troop movement allows per-piece destination selection from the selected space pool.
3. Structural test: Air Lift ARVN piece movement allows per-piece destination selection with a 4-piece total cap.
4. Structural/runtime test: Monsoon still caps Air Lift selected spaces at 2.
5. Structural test: North Vietnam exclusion filter preserved on space selection.
6. `pnpm turbo build`
7. `pnpm -F @ludoforge/engine test`

### Invariants

1. No file under `packages/engine/src/kernel/**` or `packages/engine/src/cnl/**` is modified.
2. US Troops are unlimited in Air Lift movement.
3. ARVN pieces (Troops, Rangers, Irregulars) capped at 4 total across all spaces.
4. Monsoon limits spaces to 2 (not pieces).
5. North Vietnam spaces remain excluded.
6. Texas Hold'em compilation tests still pass.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts` — structural assertions for multi-destination Air Lift profile.
2. Consider `packages/engine/test/integration/fitl-air-lift-multi-dest.test.ts` (new) if runtime tests are feasible — verify pieces land at different destinations in a compiled game.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- fitl-us-arvn-special-activities.test.ts`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-02-24
- **What changed (actual)**:
  - Reworked `air-lift-profile` to remove single shared destination and use per-piece destination decisions with templated binds.
  - Replaced origin-loop + `airLiftRemaining` bookkeeping with explicit selection of movable US troops (`chooseN`) and explicit capped selection (`max: 4`) of ARVN Troops/Rangers + US Irregulars (`concat` over `tokensInMapSpaces`).
  - Preserved North Vietnam exclusion in space selection and preserved Monsoon cap behavior via existing turn-flow restriction.
  - Updated integration tests to validate the new structural shape and runtime multi-destination behavior, including rejection when selecting more than 4 ARVN/Ranger/Irregular pieces.
  - Updated dependent Air Lift prohibition/modifier tests to remove obsolete `$airLiftDestination` move param.
- **Deviation vs original plan**:
  - Clarified and implemented Monsoon cap as a turn-flow concern rather than a profile-level `chooseN.max: 2` concern.
  - Used `tokensInMapSpaces` + `concat` (supported DSL primitives) instead of the initially sketched `tokensInZones` approach.
- **Verification**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/integration/fitl-us-arvn-special-activities.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo lint` ✅
