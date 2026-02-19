# VISCONF-009: Strip visual fields from engine compiler and validators

**Spec**: 42 (Per-Game Visual Config), D11
**Priority**: P1
**Depends on**: VISCONF-008 (types removed — compiler must be updated to match)
**Blocks**: VISCONF-012 (engine tests need compiler changes first)

---

## Summary

Remove all visual field handling from the engine compiler (`cnl/`): lowering functions, data asset extraction, validation, and spec types. After this ticket, the compiler passes through zero visual data.

---

## Files to modify

| File | Change |
|------|--------|
| `packages/engine/src/cnl/compile-lowering.ts` | Remove `lowerCardAnimationMetadata` function (~150 lines), `resolveCardAnimationRoleZones` helper, and visual field pass-through in `lowerTokenTypes`. |
| `packages/engine/src/cnl/compile-data-assets.ts` | Remove `resolveMapSpaceVisuals`, `mergeZoneVisualHints`, `buildTokenTypeVisualsMap` functions. Remove `visual` field from zone/tokenType output. |
| `packages/engine/src/cnl/compiler-core.ts` | Remove `cardAnimation` section compilation (call to `lowerCardAnimationMetadata`), remove `layoutMode` pass-through in metadata assembly, remove `cardAnimation` from final GameDef assembly. |
| `packages/engine/src/cnl/compile-zones.ts` | Remove `normalizeZoneLayoutRole` function, remove `layoutRole` and `visual` parameters from `createZoneDef`, remove layout role normalization from `materializeZoneDefs`. |
| `packages/engine/src/cnl/validate-zones.ts` | Remove `layoutRole` validation from `validateZones`. Remove `layoutRole` from `ZONE_KEYS`. |
| `packages/engine/src/cnl/validate-metadata.ts` | Remove `layoutMode` validation block (~12 lines), remove `cardAnimation` validation block (~60 lines). Remove `'cardAnimation'` and `'layoutMode'` from `METADATA_KEYS`. |
| `packages/engine/src/cnl/validate-spec-shared.ts` | Remove `'cardAnimation'` and `'layoutMode'` from `METADATA_KEYS` array. Remove `'layoutRole'` from `ZONE_KEYS` array. Remove `CARD_ANIMATION_KEYS` constant. |
| `packages/engine/src/cnl/game-spec-doc.ts` | Remove visual types: `GameSpecCardAnimationMetadata`, `GameSpecCardAnimationZoneRoles`, `GameSpecCardTokenTypeSelectors`. Remove fields: `cardAnimation` and `layoutMode` from `GameSpecMetadata`, `layoutRole` and `visual` from `GameSpecZoneDef`, `visual` from `GameSpecTokenTypeDef`. |

---

## Detailed requirements

### compile-lowering.ts

**Remove entirely**:
- `lowerCardAnimationMetadata()` function (lines ~183-336)
- `resolveCardAnimationRoleZones()` helper function (lines ~1121-1183)

**Modify**:
- `lowerTokenTypes()`: Remove the `visual: tokenType.visual` line from the output object (line ~177)

### compile-data-assets.ts

**Remove entirely**:
- `resolveMapSpaceVisuals()` (lines ~387-411)
- `mergeZoneVisualHints()` (lines ~413-436)
- `buildTokenTypeVisualsMap()` (lines ~438-451)

**Modify**:
- Zone output: Remove `visual` field from the map space -> zone transformation
- Token type output: Remove `visual` field extraction from piece types
- Remove `tokenTypeVisuals` from the return value

### compiler-core.ts

**Remove**:
- The `cardAnimation` section compilation block (lines ~289-298)
- The `cardAnimation` tracking field in the sections object
- The `cardAnimation` field from the final GameDef assembly
- The `layoutMode` conditional spread in metadata assembly (line ~220-225)

### compile-zones.ts

**Remove entirely**:
- `normalizeZoneLayoutRole()` function (lines ~284-292)

**Modify**:
- `createZoneDef()`: Remove `layoutRole` and `visual` parameters and their conditional spreads in the output object
- `materializeZoneDefs()`: Remove `normalizeZoneLayoutRole` calls, stop passing `layoutRole` and `visual` to `createZoneDef`

### validate-spec-shared.ts

**Modify**:
- `METADATA_KEYS`: Remove `'cardAnimation'` and `'layoutMode'` → becomes `['id', 'players', 'maxTriggerDepth', 'defaultScenarioAssetId', 'namedSets']`
- `ZONE_KEYS`: Remove `'layoutRole'` → becomes `['id', 'zoneKind', 'owner', 'visibility', 'ordering', 'adjacentTo']`
- `CARD_ANIMATION_KEYS`: Remove entire constant

### validate-metadata.ts

**Remove**:
- `layoutMode` validation block (lines ~145-157)
- `cardAnimation` validation block (lines ~159-220+)
- Import of `CARD_ANIMATION_KEYS`

### game-spec-doc.ts

**Remove types entirely**:
- `GameSpecCardTokenTypeSelectors`
- `GameSpecCardAnimationZoneRoles`
- `GameSpecCardAnimationMetadata`

**Remove fields**:
- `GameSpecMetadata.cardAnimation`
- `GameSpecMetadata.layoutMode`
- `GameSpecZoneDef.layoutRole`
- `GameSpecZoneDef.visual`
- `GameSpecTokenTypeDef.visual`

**Remove imports** of `ZoneVisualHints`, `TokenVisualHints` from kernel types.

---

## Out of scope

- Engine kernel type changes (VISCONF-008 — already done)
- Game spec YAML file edits (VISCONF-010)
- Bootstrap JSON changes (VISCONF-011)
- Engine test updates (VISCONF-012)
- Any runner changes

---

## Acceptance criteria

### Tests that must pass

1. `pnpm -F @ludoforge/engine typecheck` passes (no references to removed types in src/)
2. `pnpm -F @ludoforge/engine build` succeeds

Note: Engine tests may still fail at this point because test fixtures reference removed fields. That's addressed in VISCONF-012.

### Verification

1. `grep -r 'lowerCardAnimationMetadata\|resolveMapSpaceVisuals\|mergeZoneVisualHints\|buildTokenTypeVisualsMap\|normalizeZoneLayoutRole' packages/engine/src/cnl/` returns zero hits
2. `grep -r 'cardAnimation\|layoutMode\|layoutRole' packages/engine/src/cnl/game-spec-doc.ts` returns zero hits
3. `grep -r 'CARD_ANIMATION_KEYS' packages/engine/src/cnl/` returns zero hits
4. `grep -r 'ZoneVisualHints\|TokenVisualHints\|PieceVisualMetadata' packages/engine/src/cnl/` returns zero hits

### Invariants

- The compiler still compiles valid game specs to GameDef (minus visual fields)
- Validation still catches unknown keys in metadata and zones (with updated key lists)
- No visual field is silently ignored — they are actively stripped from the valid key lists, so leftover visual fields in game specs will produce "unknown key" diagnostics
- `game-spec-doc.ts` spec types match the data that YAML files actually contain (after VISCONF-010 strips visual data)
