# FITLSEC2SCEDEC-003: Initialize `leaderBoxCardCount` for Short and Medium Scenarios

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data/test only
**Deps**: None (Spec 44, Gap 3)

## Problem

The game must start with the correct `leaderBoxCardCount` per scenario:

- **Short scenario**: Starts with Young Turks (leader) + Khanh (beneath) = 2 cards in leader box.
- **Medium scenario**: Starts with Ky (leader) + Khanh + Young Turks (beneath) = 3 cards.

Without scenario-specific initialization, the Medium scenario incorrectly blocks pivotal events (which require `leaderBoxCardCount >= 2`) until 2 coup rounds have been completed, even though the scenario starts with 3 leader cards.

The Short scenario also starts with `leaderBoxCardCount` 2 (though it has no pivotals, it matters for consistency and for any future rules that reference this variable).

## Assumption Reassessment (2026-02-24)

1. `leaderBoxCardCount` is currently declared in `data/games/fire-in-the-lake/10-vocabulary.md` as a global int (`init: 0`, `min: 0`, `max: 8`) — confirmed.
2. Scenario `initialTrackValues` currently omit `leaderBoxCardCount` in Short and Medium — confirmed.
3. Current compiler/validator behavior allows `scenario.initialTrackValues` to reference **map tracks only**; unknown IDs raise `CNL_VALIDATOR_SCENARIO_TRACK_VALUE_INVALID` / `CNL_TRACK_SCENARIO_INIT_UNKNOWN` — confirmed in `packages/engine/src/cnl/validate-zones.ts` and `packages/engine/src/cnl/compiler-core.ts`.
4. Therefore, the original ticket plan ("add `leaderBoxCardCount` under `initialTrackValues` while keeping it only in vocabulary globals") is invalid under current architecture and would fail compilation.
5. Existing tests already enforce map-track identity/count (for example `fitl-production-data-compilation.test.ts` and `fitl-production-tracks.test.ts`), so test updates are required.
6. Pivotal play conditions do check `leaderBoxCardCount >= 2` in production events (`41-content-event-decks.md`) — confirmed.

## Architecture Decision

The cleanest robust fix is to model `leaderBoxCardCount` as a FITL map global track, not as a standalone vocabulary global var:

1. This uses the existing generic scenario-track initialization pipeline (no engine hardcoding, no aliases).
2. It avoids introducing game-specific compiler behavior for one variable.
3. It keeps scenario initialization declarative in data assets and aligns with the Agnostic Engine rule.

## Corrected Scope

### 1. Move `leaderBoxCardCount` from vocabulary global vars to map tracks

In `data/games/fire-in-the-lake/40-content-data-assets.md` map `tracks`, add:

```yaml
        - id: leaderBoxCardCount
          scope: global
          min: 0
          max: 8
          initial: 0
```

In `data/games/fire-in-the-lake/10-vocabulary.md`, remove the standalone `leaderBoxCardCount` global var declaration to avoid duplicate definitions.

### 2. Add `leaderBoxCardCount` scenario initial values

```yaml
        - trackId: leaderBoxCardCount
          value: 2
```

for Short scenario, and:

```yaml
        - trackId: leaderBoxCardCount
          value: 3
```

for Medium scenario.

No Full override (track default `initial: 0` remains correct).

## Files to Touch

- `data/games/fire-in-the-lake/40-content-data-assets.md` (modify — map tracks + Short/Medium `initialTrackValues`)
- `data/games/fire-in-the-lake/10-vocabulary.md` (modify — remove duplicate `leaderBoxCardCount` global var)
- `packages/engine/test/integration/fitl-production-data-compilation.test.ts` (modify impacted track expectations)
- `packages/engine/test/unit/fitl-production-tracks.test.ts` (modify impacted track expectations)
- `packages/engine/test/integration/fitl-scenario-leader-box-init.test.ts` (new)

## Out of Scope

- Full scenario override entry in `initialTrackValues` (default `initial: 0` remains correct)
- Deck exclusions (covered by FITLSEC2SCEDEC-001 and FITLSEC2SCEDEC-002)
- Pivotal single-use enforcement (covered by FITLSEC2SCEDEC-004)
- Period filter schema or data (covered by FITLSEC2SCEDEC-005)
- Any engine/compiler/kernel code changes
- Any changes to `30-rules-actions.md` or `41-content-event-decks.md`

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — clean compilation
2. `pnpm turbo test` — all existing tests pass (including scenario conservation and derived values)
3. **New test**: Compile production spec with scenario `fitl-scenario-short`, initialize state, assert `state.globalVars.leaderBoxCardCount === 2`
4. **New test**: Compile production spec with scenario `fitl-scenario-medium`, initialize state, assert `state.globalVars.leaderBoxCardCount === 3`
5. **New test**: Compile production spec with scenario `fitl-scenario-full`, initialize state, assert `state.globalVars.leaderBoxCardCount === 0` (unchanged default)
6. Updated track-identity tests reflect `leaderBoxCardCount` as a map global track.

### Invariants

1. `leaderBoxCardCount` remains bounded to `[0, 8]` with default `0` (now sourced from map track definition).
2. The Full scenario's `initialTrackValues` is not modified for `leaderBoxCardCount`.
3. Existing Short/Medium `initialTrackValues` entries (aid/patronage/trail/totalEcon/vcResources/nvaResources/arvnResources) remain unchanged.
4. All existing FITL scenario setup projection and conservation tests continue to pass.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-scenario-leader-box-init.test.ts` — new test file that compiles the production spec with each scenario selected, initializes state via `initialState()`, and verifies `leaderBoxCardCount`.
2. `packages/engine/test/integration/fitl-production-data-compilation.test.ts` — update expected map track IDs/count.
3. `packages/engine/test/unit/fitl-production-tracks.test.ts` — update expected track counts and global-track set.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo build && pnpm turbo lint && pnpm turbo test`

## Outcome

- **Completion date**: 2026-02-24
- **What changed**:
  - Promoted `leaderBoxCardCount` to a map global track in `40-content-data-assets.md` and removed the duplicate declaration from `10-vocabulary.md`.
  - Added scenario initial values for `leaderBoxCardCount` to Short (`2`) and Medium (`3`), leaving Full at default `0`.
  - Added new scenario-selection integration coverage for leader-box initialization.
  - Updated existing production track expectation tests to include the new track.
- **Deviations from original plan**:
  - Original ticket plan assumed adding `leaderBoxCardCount` directly to `initialTrackValues` while keeping it in vocabulary globals; this was invalid because scenario track initialization accepts map tracks only.
  - Corrected approach moved the variable to map tracks to preserve generic compiler architecture and avoid engine changes.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo build` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo test` passed.
