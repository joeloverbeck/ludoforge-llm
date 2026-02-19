# VISCONF-002: Create FITL and Texas Hold'em visual-config.yaml files

**Status**: ✅ COMPLETED
**Spec**: 42 (Per-Game Visual Config)
**Priority**: P1
**Depends on**: VISCONF-001 (visual config schema/provider exist in runner)
**Blocks**: VISCONF-010 (game spec YAML stripping must happen after extraction)

---

## Summary

Create standalone per-game visual config YAML files for FITL and Texas Hold'em using the current source-of-truth game specs and compiled bootstrap data. These files become the authoritative visual data source for the runner.

---

## Reassessed assumptions and corrections

1. `VISCONF-001` is already implemented.
   - `packages/runner/src/config/visual-config-types.ts`, `packages/runner/src/config/visual-config-provider.ts`, and related tests already exist.

2. FITL map visual assumptions in the original ticket were stale.
   - `loc` height is `36` (not `30`).
   - Province/LoC colors are produced by `visualRules` attribute matching; they are not fixed in base category styles.
   - Current FITL rules are based on `terrainTags` (`highland`, `jungle`, `lowland`, `highway`, `mekong`), not `coastal` or country-based province coloring.

3. Token visual assumptions were stale.
   - Current source data defines token `shape` and optional `activeSymbol`; there is no per-token `size` in source specs.
   - Existing compiled bootstrap token visuals currently carry color/symbol only; this ticket should extract from source game specs (piece catalog visuals), not infer non-source sizes.

4. Zone ID form must use canonical runtime IDs.
   - Use fully expanded zone IDs (for example `deck:none`, `available-US:none`, `hand:0`...`hand:9`), with no aliasing/wildcards.

5. Test expectations in the original ticket were stale.
   - This ticket must add automated tests validating YAML parse/schema compliance and key invariants; manual-only validation is insufficient.

---

## Files to create

| File | Purpose |
|------|---------|
| `data/games/fire-in-the-lake/visual-config.yaml` | FITL visual configuration |
| `data/games/texas-holdem/visual-config.yaml` | Texas Hold'em visual configuration |

## Files to modify

| File | Purpose |
|------|---------|
| `packages/runner/test/config/*` | Add/extend tests for these concrete YAML files and invariants |

---

## Detailed requirements

### FITL visual-config.yaml

Source files:
- `data/games/fire-in-the-lake/10-vocabulary.md`
- `data/games/fire-in-the-lake/40-content-data-assets.md`
- `packages/runner/src/bootstrap/fitl-game-def.json` (for parity checks)

Required content:

1. `version: 1` as first key.
2. `layout.mode: graph`.
3. `factions` from piece catalog factions:
   - `us`, `arvn`, `nva`, `vc` with current colors/display names.
4. `zones.categoryStyles` from FITL `visualRules` category matches:
   - `city`: `shape: circle`, `width: 90`, `height: 90`, `color: "#5b7fa5"`
   - `province`: `shape: rectangle`, `width: 160`, `height: 100`
   - `loc`: `shape: line`, `width: 120`, `height: 36`
5. `zones.attributeRules` from FITL `visualRules` attribute matches:
   - province + `terrainTags` contains `highland` -> `color: "#6b5b3e"`
   - province + `terrainTags` contains `jungle` -> `color: "#3d5c3a"`
   - province + `terrainTags` contains `lowland` -> `color: "#5a7a52"`
   - loc + `terrainTags` contains `highway` -> `color: "#8b7355"`
   - loc + `terrainTags` contains `mekong` -> `color: "#4a7a8c"`
6. `zones.overrides` label entries for all 47 FITL board map zones (from map-space `visual.label`).
7. `zones.layoutRoles` using canonical runtime zone IDs:
   - `deck:none`, `leader:none`, `lookahead:none`, `played:none` -> `card`
   - `available-US:none`, `available-ARVN:none`, `available-NVA:none`, `available-VC:none`, `out-of-play-US:none`, `out-of-play-ARVN:none`, `casualties-US:none` -> `forcePool`
8. `tokenTypes` from piece catalog visuals:
   - Include `shape`, `color`, and `symbol` (mapped from `activeSymbol` where present).
   - Do not invent `size` values not present in source specs.

### Texas Hold'em visual-config.yaml

Source files:
- `data/games/texas-holdem/00-metadata.md`
- `data/games/texas-holdem/10-vocabulary.md`
- `data/games/texas-holdem/40-content-data-assets.md`
- `packages/runner/src/bootstrap/texas-game-def.json` (for parity checks)

Required content:

1. `version: 1` as first key.
2. `layout.mode: table`.
3. `factions.neutral` with current color/displayName.
4. `zones.layoutRoles` using canonical runtime zone IDs:
   - `deck:none: card`
   - `burn:none: other`
   - `community:none: other`
   - `muck:none: other`
   - `hand:0` through `hand:9`: `hand`
5. `cardAnimation` from metadata, but expanded to canonical runtime zone IDs:
   - `cardTokenTypes.idPrefixes: ["card-"]`
   - `zoneRoles.draw: ["deck:none"]`
   - `zoneRoles.hand: ["hand:0", ..., "hand:9"]`
   - `zoneRoles.shared: ["community:none"]`
   - `zoneRoles.burn: ["burn:none"]`
   - `zoneRoles.discard: ["muck:none"]`

(Texas has no zone category styles, attribute rules, overrides, or token type visuals in this ticket.)

---

## Out of scope

- Editing game spec `.md` files (VISCONF-010).
- Engine/ruler behavioral code changes.
- Runtime loading pipeline changes (VISCONF-003).
- Bootstrap fixture regeneration/changes (VISCONF-011).

---

## Acceptance criteria

### Tests that must pass

1. New/updated runner tests validating:
   - both YAML files exist and parse,
   - both YAML files satisfy `VisualConfigSchema`,
   - key invariants (canonical IDs, expected roles, expected FITL rule chain, 47 FITL label overrides).
2. Existing relevant runner config tests remain green.

### Invariants

- Files are pure YAML data (no code/logic).
- `version: 1` is first key in both files.
- No alias IDs or wildcard roles; canonical runtime IDs only.
- All referenced faction IDs, token type IDs, and zone IDs exist in corresponding game data.
- Visual data only; no rule/kernel semantics are moved into these files.

---

## Outcome

- **Completion date**: 2026-02-19
- **What changed**:
  - Added `data/games/fire-in-the-lake/visual-config.yaml` with FITL factions, layout mode, category styles, attribute rules, 47 zone label overrides, layout roles, and token type visuals.
  - Added `data/games/texas-holdem/visual-config.yaml` with Texas layout mode, neutral faction visuals, canonical layout roles, and canonical card animation role mapping.
  - Added `packages/runner/test/config/visual-config-files.test.ts` to parse YAML, validate against `VisualConfigSchema`, and assert critical invariants against bootstrap zone/layout-role data.
  - Added `yaml` as a runner dev dependency to support direct YAML parsing in tests.
- **Deviations vs original plan**:
  - Original ticket assumed manual-only validation and no test changes; implementation includes automated tests for parse/schema/invariant coverage.
  - Original FITL assumptions (loc height, attribute rule set, and token-size expectations) were stale and were corrected before implementation.
- **Verification**:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
