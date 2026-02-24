# FITLSEC4RULGAP-004: Air Lift Multi-Destination Redistribution

**Status**: PENDING
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
3. The kernel supports `chooseOne` per piece within a `forEach` loop — this pattern is used elsewhere (e.g., Patrol destination selection).
4. Monsoon 2-space limit is already handled by the space selection `chooseN.max` — this should be preserved.
5. North Vietnam exclusion filter on space selection is already correct — this should be preserved.
6. The rule text groups "ARVN Troops, Rangers, or Irregulars" under the 4-piece cap. Irregulars are US-faction but the rule bundles them with ARVN pieces for the cap. The implementer must verify faction filtering: Irregulars may need `faction: US, type: guerrilla` rather than `faction: ARVN`.

## Architecture Check

1. This is a YAML restructuring of the Air Lift profile's movement stages. The DSL already supports per-piece destination selection via `chooseOne` inside `forEach`.
2. No new kernel primitives needed — all queries (`mapSpaces`, `tokensInZone`, `chooseOne`, `chooseN`, `moveToken`) already exist.
3. The restructuring replaces the single-destination pattern with a per-piece-destination pattern, which is more complex but accurately models the rule.
4. No backwards-compatibility shim introduced.

## What to Change

### 1. Restructure Air Lift movement stages

In `data/games/fire-in-the-lake/30-rules-actions.md`, `air-lift-profile`:

**Remove**: The `select-destination` stage that forces a single `$airLiftDestination`.

**Replace movement stages** with per-piece destination selection:

#### US Troops (unlimited):
For each selected space, for each US Troop in that space, offer `chooseOne` destination from the other selected spaces (include option to not move / stay). Move if destination differs from current zone.

#### ARVN pieces (4-piece cap):
Gather all eligible ARVN Troops/Rangers/Irregulars across the selected spaces. Present `chooseN` (min 0, max 4) to select which pieces to move. For each selected piece, `chooseOne` destination from the selected spaces. Move if destination differs from current zone.

**Sketch** (ARVN movement):
```yaml
- stage: move-arvn-pieces
  effects:
    - chooseN:
        bind: $liftPieces
        options:
          # Gather ARVN Troops, Rangers, Irregulars from all selected spaces
          # Implementer must verify exact query for multi-zone token gathering
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

### 2. Verify Irregulars faction handling

Check whether Irregulars use `faction: US, type: guerrilla` or some other encoding. The 4-piece cap applies to "ARVN Troops, Rangers, or Irregulars" per the rule text — Irregulars are US-faction but count against this cap. Adjust the filter accordingly.

### 3. Preserve existing constraints

- North Vietnam exclusion on space selection: already in the `chooseN` filter — keep as-is.
- Monsoon 2-space limit: already in `chooseN.max` gated by monsoon condition — keep as-is.

### 4. Update tests

Add structural and runtime tests for multi-destination Air Lift.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — restructure `air-lift-profile`, ~lines 3319-3486)
- `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts` (modify — add Air Lift multi-destination assertions)

## Out of Scope

- Any kernel/compiler source code.
- Air Strike profile — correct and unrelated.
- Advise profile — correct and unrelated.
- Monsoon detection logic — already correct in space selection.
- North Vietnam filtering — already correct in space selection.

## Acceptance Criteria

### Tests That Must Pass

1. Structural test: Air Lift profile has NO single `$airLiftDestination` binding forcing all pieces to one space.
2. Structural test: Air Lift US Troop movement allows per-piece destination selection from the selected space pool.
3. Structural test: Air Lift ARVN piece movement allows per-piece destination selection with a 4-piece total cap.
4. Structural test: Monsoon `chooseN.max: 2` constraint preserved.
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
