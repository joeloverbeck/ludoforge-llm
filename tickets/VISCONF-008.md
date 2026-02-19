# VISCONF-008: Strip visual fields from engine types and schemas

**Spec**: 42 (Per-Game Visual Config), D10
**Priority**: P1 (gate ticket — all runner wiring must be done first)
**Depends on**: VISCONF-004, 005, 006, 007 (runner no longer reads these fields)
**Blocks**: VISCONF-009, 010, 011, 012

---

## Summary

Remove all visual/presentation types, fields, and schemas from the engine kernel types and Zod schemas. After this ticket, the engine has zero visual hint types.

---

## Files to modify

| File | Change |
|------|--------|
| `packages/engine/src/kernel/types-core.ts` | Remove types and fields listed below |
| `packages/engine/src/kernel/schemas-core.ts` | Remove imports of visual schemas, remove visual fields from ZoneDefSchema, TokenTypeDefSchema, GameDefSchema |
| `packages/engine/src/kernel/schemas-gamespec.ts` | Remove all visual schema definitions listed below |

---

## Detailed requirements

### types-core.ts — types to REMOVE entirely

| Type | Lines (approx) | Description |
|------|-------|-------------|
| `ZoneShape` | 73-75 | 8-value union type |
| `TokenShape` | 77-79 | 8-value union type |
| `ZoneVisualHints` | 81-87 | Interface: shape, width, height, color, label |
| `TokenVisualHints` | 89-94 | Interface: shape, color, size, symbol |
| `CardAnimationZoneRole` | 96 | 5-value union type |
| `CardAnimationMetadata` | 98-107 | Interface: cardTokenTypeIds, zoneRoles |
| `PieceVisualMetadata` | 298-302 | Interface: color, shape, activeSymbol |
| `MapVisualRuleMatch` | 390-395 | Interface: spaceIds, category, attributeEquals, attributeContains |
| `MapVisualRule` | 397-400 | Interface: match, visual |

### types-core.ts — fields to REMOVE from existing interfaces

| Interface | Field | Description |
|-----------|-------|-------------|
| `FactionDef` | `color: string` | Faction display color |
| `FactionDef` | `displayName?: string` | Faction display name |
| `ZoneDef` | `visual?: ZoneVisualHints` | Zone visual hints |
| `ZoneDef` | `layoutRole?: 'card' \| 'forcePool' \| 'hand' \| 'other'` | Layout classification |
| `TokenTypeDef` | `visual?: TokenVisualHints` | Token visual hints |
| `GameDef` metadata | `layoutMode?: 'graph' \| 'table' \| 'track' \| 'grid'` | Layout mode hint |
| `GameDef` | `cardAnimation?: CardAnimationMetadata` | Card animation config |
| `PieceTypeCatalogEntry` | `visual?: PieceVisualMetadata` | Piece visual metadata |
| `MapSpaceInput` | `visual?: ZoneVisualHints` | Map space visual hints |
| `MapPayload` | `visualRules?: readonly MapVisualRule[]` | Map visual rule array |

### schemas-gamespec.ts — schemas to REMOVE entirely

| Schema | Lines (approx) |
|--------|-------|
| `PieceVisualMetadataSchema` | 21-27 |
| `ZoneShapeSchema` | 71-74 |
| `TokenShapeSchema` | 76-79 |
| `ZoneVisualHintsSchema` | 81-89 |
| `TokenVisualHintsSchema` | 91-98 |
| `CardAnimationZoneRoleSchema` | 100-106 |
| `CardAnimationZoneRolesSchema` | 108-116 |
| `CardAnimationTokenTypeSelectorsSchema` | 118-123 |
| `CardAnimationMetadataSchema` | 125-130 |
| `MapVisualRuleMatchSchema` | 142-149 |
| `MapVisualRuleSchema` | 151-156 |

### schemas-gamespec.ts — fields to REMOVE from existing schemas

| Schema | Field |
|--------|-------|
| `PieceTypeCatalogEntrySchema` | `visual: PieceVisualMetadataSchema.optional()` |
| `FactionDefSchema` | `color: StringSchema.min(1)` |
| `FactionDefSchema` | `displayName: StringSchema.optional()` |
| `MapSpaceSchema` | `visual: ZoneVisualHintsSchema.optional()` |
| `MapPayloadSchema` | `visualRules: z.array(MapVisualRuleSchema).optional()` |

### schemas-core.ts — imports and fields to REMOVE

| Change | Description |
|--------|-------------|
| Remove imports | `CardAnimationMetadataSchema`, `TokenVisualHintsSchema`, `ZoneVisualHintsSchema` from schemas-gamespec |
| ZoneDefSchema | Remove `visual: ZoneVisualHintsSchema.optional()` and `layoutRole` field |
| TokenTypeDefSchema | Remove `visual: TokenVisualHintsSchema.optional()` |
| GameDefSchema metadata | Remove `layoutMode` field |
| GameDefSchema | Remove `cardAnimation: CardAnimationMetadataSchema.optional()` |

---

## Out of scope

- Compiler changes (VISCONF-009)
- Game spec YAML changes (VISCONF-010)
- Bootstrap JSON changes (VISCONF-011)
- Test changes (VISCONF-012)
- Runner code changes (done in VISCONF-004 through 007)

---

## Acceptance criteria

### Tests that must pass

After this ticket, the engine will have **compilation errors** in compiler files and test files that still reference the removed types. That's expected — VISCONF-009 and 012 fix those. However:

1. `pnpm -F @ludoforge/engine typecheck` is NOT expected to pass yet (compiler references will break)
2. The type definitions themselves must be internally consistent (no dangling references within types-core.ts or schemas files)

### Verification

1. `grep -r 'ZoneVisualHints\|TokenVisualHints\|CardAnimationMetadata\|PieceVisualMetadata\|MapVisualRule' packages/engine/src/kernel/` returns zero hits
2. `grep -r 'ZoneShape\|TokenShape\|CardAnimationZoneRole' packages/engine/src/kernel/` returns zero hits
3. `grep -r 'layoutRole\|layoutMode\|cardAnimation' packages/engine/src/kernel/types-core.ts` returns zero hits
4. `grep -r 'displayName\|\.color' packages/engine/src/kernel/types-core.ts` returns zero hits (for FactionDef fields specifically)

### Invariants

- `FactionDef` retains only `id: string` (plus any future non-visual fields)
- `ZoneDef` retains: `id`, `zoneKind`, `ownerPlayerIndex`, `owner`, `visibility`, `ordering`, `adjacentTo`, `category`, `attributes`
- `TokenTypeDef` retains: `id`, `faction`, `props`, `transitions`
- `GameDef` retains all non-visual fields (zones, tokenTypes, factions, variables, phases, actions, triggers, scenarios, metadata minus layoutMode, etc.)
- No new types are added to the engine in this ticket
