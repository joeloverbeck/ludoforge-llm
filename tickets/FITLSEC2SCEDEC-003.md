# FITLSEC2SCEDEC-003: Initialize `leaderBoxCardCount` for Short and Medium Scenarios

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data-only
**Deps**: None (Spec 44, Gap 3)

## Problem

The `leaderBoxCardCount` global variable (defined in `10-vocabulary.md` line ~351) has `init: 0`. This is correct for the Full scenario (Duong Van Minh is the starting leader with no coup cards in the box), but incorrect for:

- **Short scenario**: Starts with Young Turks (leader) + Khanh (beneath) = 2 cards in leader box.
- **Medium scenario**: Starts with Ky (leader) + Khanh + Young Turks (beneath) = 3 cards.

Without overrides, the Medium scenario incorrectly blocks pivotal events (which require `leaderBoxCardCount >= 2`) until 2 coup rounds have been completed, even though the scenario starts with 3 leader cards.

The Short scenario also starts with `leaderBoxCardCount` 2 (though it has no pivotals, it matters for consistency and for any future rules that reference this variable).

## Assumption Reassessment (2026-02-23)

1. `leaderBoxCardCount` in `10-vocabulary.md` line ~351: `type: int, init: 0, min: 0, max: 8` — confirmed.
2. Short scenario `initialTrackValues` at line ~1437 of `40-content-data-assets.md` has entries for `aid`, `patronage`, `trail`, `totalEcon`, `vcResources` but no `leaderBoxCardCount` — confirmed.
3. Medium scenario `initialTrackValues` at line ~1821 has the same pattern with no `leaderBoxCardCount` — confirmed.
4. Full scenario `initialTrackValues` at line ~1099 also has no `leaderBoxCardCount`, but default `init: 0` is correct — confirmed.
5. Pivotal play conditions check `leaderBoxCardCount >= 2` (confirmed in `41-content-event-decks.md` lines ~4176, ~4230, ~4261, ~4285).

## Architecture Check

1. Pure data change — adds `initialTrackValues` entries to existing scenario setup blocks. No engine code impact.
2. Game-specific data stays in `data/games/fire-in-the-lake/`. No kernel/compiler/runtime changes.
3. No aliasing or shims introduced.

## What to Change

### 1. Add `leaderBoxCardCount` to Short scenario `initialTrackValues`

In `data/games/fire-in-the-lake/40-content-data-assets.md`, locate the Short scenario's `initialTrackValues` block (line ~1437, after existing entries like `vcResources`) and add:

```yaml
        - trackId: leaderBoxCardCount
          value: 2
```

### 2. Add `leaderBoxCardCount` to Medium scenario `initialTrackValues`

In the same file, locate the Medium scenario's `initialTrackValues` block (line ~1821, after existing entries) and add:

```yaml
        - trackId: leaderBoxCardCount
          value: 3
```

## Files to Touch

- `data/games/fire-in-the-lake/40-content-data-assets.md` (modify — Short and Medium scenario `initialTrackValues`)

## Out of Scope

- Full scenario `initialTrackValues` (default `init: 0` is already correct)
- Deck exclusions (covered by FITLSEC2SCEDEC-001 and FITLSEC2SCEDEC-002)
- Pivotal single-use enforcement (covered by FITLSEC2SCEDEC-004)
- Period filter schema or data (covered by FITLSEC2SCEDEC-005)
- Any engine/compiler/kernel code changes
- Any changes to `10-vocabulary.md`, `30-rules-actions.md`, or `41-content-event-decks.md`
- The global `init: 0` default in `10-vocabulary.md` (it must remain 0 as the Full scenario depends on it)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — clean compilation
2. `pnpm turbo test` — all existing tests pass (including scenario conservation and derived values)
3. **New test**: Compile production spec with scenario `fitl-scenario-short`, initialize state, assert `state.globalVars.leaderBoxCardCount === 2`
4. **New test**: Compile production spec with scenario `fitl-scenario-medium`, initialize state, assert `state.globalVars.leaderBoxCardCount === 3`
5. **New test**: Compile production spec with scenario `fitl-scenario-full`, initialize state, assert `state.globalVars.leaderBoxCardCount === 0` (unchanged default)

### Invariants

1. The vocabulary definition of `leaderBoxCardCount` in `10-vocabulary.md` remains unchanged (`init: 0`, `min: 0`, `max: 8`).
2. The Full scenario's `initialTrackValues` is not modified.
3. Existing `initialTrackValues` entries in Short and Medium (aid, patronage, trail, totalEcon, vcResources) remain unchanged.
4. All existing FITL scenario setup projection and conservation tests continue to pass.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-scenario-leader-box-init.test.ts` — new test file that compiles the production spec, selects each scenario, initializes state via `initialState()`, and verifies `leaderBoxCardCount` values.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo build && pnpm turbo test`
