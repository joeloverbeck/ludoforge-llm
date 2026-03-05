# CHOICEUI-004: FITL Action Labels in Visual Config

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None -- data file only
**Deps**: CHOICEUI-003

## Problem

FITL action IDs like `us-train`, `nva-rally`, `vc-march` are auto-formatted as "Us Train", "Nva Rally", "Vc March" by `formatIdAsDisplayName()`. These are imprecise and include faction prefixes that clutter the UI. Game designers need proper display names ("Train", "Rally", "March") and decision prompts ("Select spaces to train in") in the visual config.

## Assumption Reassessment (2026-03-05)

1. `data/games/fire-in-the-lake/visual-config.yaml` exists and currently has no `actions` section.
2. FITL defines four factions (US, ARVN, NVA, VC) with four operations each (16 total faction-operation pairs for core operations).
3. The `actions` schema (CHOICEUI-003) will be merged before this ticket, making the section parseable.
4. The exact action IDs used in the game spec need to be confirmed against the compiled GameDef (e.g., `us-train` vs `usTrain`).

## Architecture Check

1. Pure data change -- only modifies a YAML fixture file with display labels.
2. Keeps game-specific labels in the game's data directory, not in engine or runner code.
3. No code changes required; schema support comes from CHOICEUI-003.

## What to Change

### 1. Add `actions` section to FITL visual config

Append an `actions` section to `data/games/fire-in-the-lake/visual-config.yaml` with entries for all 16 core faction operations (US, ARVN, NVA, VC x Train/Patrol/Sweep/Assault or Rally/March/Attack/Terror).

Each entry includes:
- `displayName`: Faction-stripped operation name (e.g., "Train", "Patrol")
- `choices.targetSpaces.prompt`: Human-readable prompt for the primary space selection decision

For `us-train`, also include sub-choice labels:
- `choices.trainChoice.prompt`: "Choose placement type"
- `choices.trainChoice.options`: `place-irregulars` -> "Place Irregulars", `place-at-base` -> "Place at Base"

**Important**: The exact action IDs and choice parameter names must be confirmed by checking the compiled FITL GameDef or the game spec's action definitions. If IDs differ from what's specified in the spec, use the actual IDs.

## Files to Touch

- `data/games/fire-in-the-lake/visual-config.yaml` (modify)

## Out of Scope

- Adding labels for special activities (air lift, air strike, advise, govern, etc.).
- Adding labels for event card choices.
- Modifying the visual config schema (CHOICEUI-003).
- Modifying any runner source code.
- Adding labels for Texas Hold'em actions.

## Acceptance Criteria

### Tests That Must Pass

1. `data/games/fire-in-the-lake/visual-config.yaml` parses successfully against `VisualConfigSchema` (validated by existing `visual-config-files.test.ts` or `visual-config-schema.test.ts`).
2. `VisualConfigProvider` constructed with the updated config returns correct `getActionDisplayName('us-train')` -> `"Train"`.
3. Existing suite: `pnpm -F @ludoforge/runner test`.

### Invariants

1. All existing visual config sections (layout, factions, zones, edges, tokenTypes, etc.) remain unchanged and valid.
2. The `actions` section only contains action IDs that exist in the FITL game spec.
3. YAML formatting follows the existing file's style (2-space indent, quoted strings for display values).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-files.test.ts` -- verify FITL visual config still parses (should be covered by existing test; confirm the test exercises the full schema).

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
