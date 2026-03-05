# CHOICEUI-004: FITL Action Labels in Visual Config

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None -- data file only
**Deps**: CHOICEUI-003

## Problem

Some FITL action IDs auto-format poorly via `formatIdAsDisplayName()`:
- `ambushNva` -> "Ambush Nva" (should be "NVA Ambush")
- `ambushVc` -> "Ambush Vc" (should be "VC Ambush")
- `airLift` -> "Air Lift" (should be "Airlift")
- `coupArvnRedeployMandatory` -> "Coup Arvn Redeploy Mandatory" ("Arvn" should be "ARVN")
- `coupArvnRedeployOptionalTroops` -> "Coup Arvn Redeploy Optional Troops" (same)
- `coupArvnRedeployPolice` -> "Coup Arvn Redeploy Police" (same)
- `coupNvaRedeployTroops` -> "Coup Nva Redeploy Troops" ("Nva" should be "NVA")

Additionally, the 8 core operations (`train`, `patrol`, `sweep`, `assault`, `rally`, `march`, `attack`, `terror`) and special activities have no choice prompts for their interactive parameters (e.g., space selection). Adding choice prompts improves the UI.

## Assumption Reassessment (2026-03-06)

**Corrected from original ticket:**

1. Action IDs are **not** faction-prefixed. The game spec uses shared IDs: `train`, `patrol`, `sweep`, `assault`, `rally`, `march`, `attack`, `terror`. Faction-specific variants are profile IDs (e.g., `train-us-profile`), not action IDs.
2. There are 8 core operation IDs, not 16. They are already single words that auto-format correctly ("Train", "Patrol", etc.).
3. The IDs that genuinely auto-format badly are special activities (`ambushNva`, `ambushVc`, `airLift`) and coup-phase actions with mixed-case faction abbreviations (`coupArvnRedeploy*`, `coupNvaRedeploy*`).
4. `data/games/fire-in-the-lake/visual-config.yaml` exists and currently has no `actions` section.
5. The `actions` schema (CHOICEUI-003) is already merged, making the section parseable.

## Architecture Check

1. Pure data change -- only modifies a YAML fixture file with display labels and choice prompts.
2. Keeps game-specific labels in the game's data directory, not in engine or runner code.
3. No code changes required; schema support comes from CHOICEUI-003.

## What to Change

### 1. Add `actions` section to FITL visual config

Append an `actions` section to `data/games/fire-in-the-lake/visual-config.yaml` with entries for:

**A) Action IDs with bad auto-formatting (display name fix):**
- `ambushNva` -> displayName: "NVA Ambush"
- `ambushVc` -> displayName: "VC Ambush"
- `airLift` -> displayName: "Airlift"
- `coupArvnRedeployMandatory` -> displayName: "Coup: ARVN Mandatory Redeploy"
- `coupArvnRedeployOptionalTroops` -> displayName: "Coup: ARVN Troop Redeploy"
- `coupArvnRedeployPolice` -> displayName: "Coup: ARVN Police Redeploy"
- `coupNvaRedeployTroops` -> displayName: "Coup: NVA Troop Redeploy"

**B) Core operations (choice prompts for targetSpaces):**
- `train` -> choices.targetSpaces.prompt: "Select spaces to train in"
- `patrol` -> choices.targetSpaces.prompt: "Select LoCs to patrol"
- `sweep` -> choices.targetSpaces.prompt: "Select spaces to sweep"
- `assault` -> choices.targetSpaces.prompt: "Select spaces to assault"
- `rally` -> choices.targetSpaces.prompt: "Select spaces to rally in"
- `march` -> choices.targetSpaces.prompt: "Select destination spaces"
- `attack` -> choices.targetSpaces.prompt: "Select spaces to attack"
- `terror` -> choices.targetSpaces.prompt: "Select spaces for terror"

**C) Special activities with multi-word IDs (display name + choice prompts):**
- `airStrike` -> displayName: "Air Strike", choices.spaces.prompt: "Select spaces for air strike"
- `airLift` -> choices.spaces.prompt: "Select spaces for airlift"
- `advise` -> choices.targetSpaces.prompt: "Select spaces to advise in"
- `govern` -> choices.targetSpaces.prompt: "Select spaces to govern"
- `transport` -> choices.targetSpaces.prompt: "Select spaces for transport"
- `raid` -> choices.targetSpaces.prompt: "Select spaces to raid"
- `infiltrate` -> choices.targetSpaces.prompt: "Select spaces to infiltrate"
- `bombard` -> choices.targetSpaces.prompt: "Select spaces to bombard"
- `tax` -> choices.targetSpaces.prompt: "Select spaces to tax"
- `subvert` -> choices.targetSpaces.prompt: "Select spaces to subvert"
- `ambushNva` -> choices.targetSpaces.prompt: "Select spaces for ambush"
- `ambushVc` -> choices.targetSpaces.prompt: "Select spaces for ambush"

## Files to Touch

- `data/games/fire-in-the-lake/visual-config.yaml` (modify)

## Out of Scope

- Adding labels for event card choices.
- Modifying the visual config schema (CHOICEUI-003).
- Modifying any runner source code.
- Adding labels for Texas Hold'em actions.

## Acceptance Criteria

### Tests That Must Pass

1. `data/games/fire-in-the-lake/visual-config.yaml` parses successfully against `VisualConfigSchema`.
2. `VisualConfigProvider` constructed with the updated config returns correct display names and choice prompts.
3. The existing FITL visual-config-files integration test still verifies all zone/edge/token/faction sections.
4. Existing suite: `pnpm -F @ludoforge/runner test`.

### Invariants

1. All existing visual config sections remain unchanged and valid.
2. The `actions` section only contains action IDs that exist in the FITL game spec.
3. YAML formatting follows the existing file's style (2-space indent, quoted strings for display values).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-files.test.ts` -- add assertions that the FITL actions section:
   - Contains entries for all 7 badly-formatting action IDs with correct display names
   - Contains choice prompts for all 8 core operations' targetSpaces parameter
   - Validates that all action IDs in the visual config exist in the compiled GameDef

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`

## Outcome

### What changed vs originally planned

The original ticket assumed FITL action IDs were faction-prefixed (e.g., `us-train`, `nva-rally`) producing 16 entries. Investigation revealed action IDs are shared single words (`train`, `rally`, etc.) that already auto-format correctly.

**Narrowed scope (Option 3):**
- Fixed display names for 7 action IDs that genuinely auto-format badly: `ambushNva`, `ambushVc`, `airLift`, `airStrike`, `coupArvnRedeployMandatory`, `coupArvnRedeployOptionalTroops`, `coupArvnRedeployPolice`, `coupNvaRedeployTroops`
- Added choice prompts for all 8 core operations' `targetSpaces` parameter
- Added choice prompts for all 12 special activities with their correct parameter names
- Added 1 new integration test validating display names, choice prompts, and that all action IDs in the config exist in the compiled GameDef

### Files modified
- `data/games/fire-in-the-lake/visual-config.yaml` — added `actions` section (27 entries)
- `packages/runner/test/config/visual-config-files.test.ts` — added 1 new test with comprehensive assertions
