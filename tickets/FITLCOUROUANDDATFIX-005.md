# FITLCOUROUANDDATFIX-005: Coup Support Phase — Pacification and Agitation (Rule 6.3)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — data-only YAML (actions, effects)
**Deps**: FITLCOUROUANDDATFIX-002

## Problem

The Coup Support phase (Rule 6.3) is interactive — US and ARVN make pacification choices, VC makes agitation choices. None of this logic exists. This is the most complex interactive coup phase due to:
- Combined 4-space limit shared between US and ARVN pacification
- Ky leader modifier on pacification cost (3 → 4)
- US spending floor at `totalEcon` (Rule 1.8.1)
- 2-level-per-space shift cap
- Terror marker removal vs. support/opposition shift choice

## Assumption Reassessment (2026-02-23)

1. `coupSupport` phase stub exists from FITLCOUROUANDDATFIX-002 with `isCoupRound == true` precondition.
2. `coupSupportSpacesUsed` and `coupAgitationSpacesUsed` global vars exist from FITLCOUROUANDDATFIX-002.
3. `supportOpposition` is a marker lattice on map spaces with states: `activeSupport`, `passiveSupport`, `neutral`, `passiveOpposition`, `activeOpposition`.
4. Terror markers are tracked on map spaces (zone marker lattice or token-based).
5. The `rvn-leader-pacification-cost` macro already exists in `20-macros.md` — it handles the Ky cost modifier.
6. The US ARVN resource spend constraint (floor at `totalEcon`) is already implemented as a macro/precondition pattern.
7. COIN Control is a derived check: US + ARVN pieces > NVA + VC pieces in a space.

## Architecture Check

1. Three separate actions for the three actor types (US pacify, ARVN pacify, VC agitate) follows the existing action pattern in `30-rules-actions.md`.
2. Shared space limit via `coupSupportSpacesUsed` counter keeps US and ARVN coordination data-driven.
3. Reuses existing `rvn-leader-pacification-cost` macro for cost calculation.
4. No engine changes — all logic expressed as action preconditions and effects.

## What to Change

### 1. Add coupPacifyUS action to 30-rules-actions.md

- **Phase**: `[coupSupport]`
- **Actor**: seat `'0'` (US)
- **Params**:
  - `targetSpace`: domain = map spaces with COIN Control + Police + US Troops
  - `action`: enum `[removeTerror, shiftSupport]`
- **Preconditions**:
  - `isCoupRound == true`
  - `coupSupportSpacesUsed < 4`
  - Target space has COIN Control
  - Target space has at least 1 Police piece
  - Target space has at least 1 US Troop
  - `arvnResources >= totalEcon + 3` (or +4 if Ky) — US spending floor
  - If `action == removeTerror`: target space has terror marker
  - If `action == shiftSupport`: target space is not already at `activeSupport`; shift count for this space this phase < 2
- **Effects**:
  - Deduct ARVN resources (3, or 4 if Ky)
  - If removeTerror: remove 1 terror marker from space
  - If shiftSupport: shift `supportOpposition` one level toward `activeSupport`
  - Increment `coupSupportSpacesUsed` (track unique spaces, not actions)

### 2. Add coupPacifyARVN action to 30-rules-actions.md

- Same structure as US pacification but:
  - **Actor**: seat `'1'` (ARVN)
  - Requires ARVN Troops (not US Troops) in the space
  - Shared `coupSupportSpacesUsed` limit (combined with US)
  - ARVN resources floor is 0 (standard), not `totalEcon`

### 3. Add coupAgitateVC action to 30-rules-actions.md

- **Phase**: `[coupSupport]`
- **Actor**: seat `'3'` (VC)
- **Params**:
  - `targetSpace`: domain = map spaces with VC pieces and no COIN Control
  - `action`: enum `[removeTerror, shiftOpposition]`
- **Preconditions**:
  - `isCoupRound == true`
  - `coupAgitationSpacesUsed < 4`
  - Target space has VC pieces
  - Target space does NOT have COIN Control
  - `vcResources >= 1`
  - If `action == removeTerror`: target space has terror marker
  - If `action == shiftOpposition`: target space is not already at `activeOpposition`; shift count for this space this phase < 2
- **Effects**:
  - Deduct 1 VC resource
  - If removeTerror: remove 1 terror marker
  - If shiftOpposition: shift `supportOpposition` one level toward `activeOpposition`
  - Increment `coupAgitationSpacesUsed` (track unique spaces)

### 4. Add pass actions for coupSupport phase

US, ARVN, and VC each need a pass/done action for the `coupSupport` phase so they can decline further pacification/agitation.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — add `coupPacifyUS`, `coupPacifyARVN`, `coupAgitateVC` actions + pass actions)

## Out of Scope

- Resources phase logic (ticket 004)
- Redeploy phase (ticket 006)
- Commitment phase (ticket 007)
- Reset phase (ticket 008)
- Engine/kernel code changes
- Changes to `10-vocabulary.md` (vars already added in ticket 002)
- Changes to `20-macros.md` (reuse existing `rvn-leader-pacification-cost`)
- Changes to `40-content-data-assets.md` or `90-terminal.md`

## Acceptance Criteria

### Tests That Must Pass

1. Production spec compiles without errors.
2. US pacification test: given a space with COIN Control + Police + US Troops, US can pacify; `arvnResources` decreases by 3 (or 4 with Ky).
3. Combined space limit test: after US pacifies 3 spaces, ARVN can pacify only 1 more space.
4. US spending floor test: US cannot pacify when `arvnResources` would drop below `totalEcon`.
5. 2-level cap test: a space already shifted 2 levels in this phase cannot be shifted further.
6. VC agitation test: VC spends 1 resource to shift opposition in a space with VC pieces and no COIN Control.
7. VC agitation 4-space limit: VC cannot agitate in more than 4 spaces.
8. Terror removal test: pacification/agitation can remove terror marker instead of shifting support/opposition.
9. Existing test suite: `pnpm -F @ludoforge/engine test` — all pass.

### Invariants

1. Combined US + ARVN pacification spaces never exceed 4.
2. VC agitation spaces never exceed 4.
3. Support/opposition shift per space per phase never exceeds 2 levels.
4. US never spends ARVN resources below `totalEcon`.
5. Pacification requires COIN Control + Police + respective faction's Troops.
6. Agitation requires VC pieces + no COIN Control.
7. No engine code is modified.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-support-phase.test.ts` (new) — test US pacification, ARVN pacification, VC agitation, combined limits, spending floors, 2-level cap, terror removal.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="coup-support"` (targeted)
2. `pnpm -F @ludoforge/engine test` (full suite)
3. `pnpm turbo typecheck`
