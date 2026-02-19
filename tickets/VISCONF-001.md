# VISCONF-001: Define visual config types, Zod schema, VisualConfigProvider, and defaults

**Spec**: 42 (Per-Game Visual Config)
**Priority**: P0 (blocks all other VISCONF tickets)
**Depends on**: Nothing
**Blocks**: VISCONF-002, 003, 004, 005, 006, 007

---

## Summary

Create the foundational `packages/runner/src/config/` module with:

1. **Type definitions** — `VisualConfig` root type and all nested types.
2. **Zod v4 validation schema** — mirrors the type definitions for YAML validation.
3. **VisualConfigProvider** — stateless resolver class that encapsulates the layered merge chain: `defaults -> categoryStyles -> attributeRules -> overrides`.
4. **Default values** — fallback constants for every visual property when no config file exists.

---

## Files to create

| File | Purpose |
|------|---------|
| `packages/runner/src/config/visual-config-types.ts` | TypeScript types + Zod schema |
| `packages/runner/src/config/visual-config-defaults.ts` | Default constant values |
| `packages/runner/src/config/visual-config-provider.ts` | Layered resolver class |
| `packages/runner/src/config/index.ts` | Barrel re-exports |
| `packages/runner/test/config/visual-config-provider.test.ts` | Unit tests for provider |
| `packages/runner/test/config/visual-config-schema.test.ts` | Zod schema validation tests |

## Files NOT touched

No existing files are modified in this ticket.

---

## Detailed requirements

### visual-config-types.ts

Define these types (all `readonly`):

```
VisualConfig
  version: 1
  layout?: LayoutConfig
  factions?: Record<string, FactionVisualConfig>
  zones?: ZonesConfig
  tokenTypes?: Record<string, TokenTypeVisualStyle>
  cardAnimation?: CardAnimationConfig
  animations?: AnimationsConfig
  cards?: CardsConfig
  variables?: VariablesConfig

LayoutConfig
  mode?: LayoutMode
  hints?: LayoutHints

LayoutMode = 'graph' | 'table' | 'track' | 'grid'

LayoutHints
  regions?: RegionHint[]
  fixed?: FixedPositionHint[]

RegionHint
  name: string
  zones: string[]
  position?: string

FixedPositionHint
  zone: string
  x: number
  y: number

FactionVisualConfig
  color?: string
  displayName?: string

ZonesConfig
  categoryStyles?: Record<string, ZoneVisualStyle>
  attributeRules?: AttributeRule[]
  overrides?: Record<string, ZoneVisualOverride>
  layoutRoles?: Record<string, LayoutRole>

ZoneVisualStyle
  shape?: ZoneShape
  width?: number
  height?: number
  color?: string

ZoneVisualOverride extends ZoneVisualStyle
  label?: string

ZoneShape = 'rectangle' | 'circle' | 'hexagon' | 'diamond' | 'ellipse' | 'triangle' | 'line' | 'octagon'

LayoutRole = 'card' | 'forcePool' | 'hand' | 'other'

AttributeRule
  match: AttributeRuleMatch
  style: ZoneVisualStyle

AttributeRuleMatch
  category?: string[]
  attributeContains?: Record<string, string>

TokenShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'hexagon' | 'cylinder' | 'meeple' | 'card' | 'cube' | 'round-disk'

TokenTypeVisualStyle
  shape?: TokenShape
  color?: string
  size?: number
  symbol?: string

CardAnimationConfig
  cardTokenTypes: CardTokenTypeSelectors
  zoneRoles: CardAnimationZoneRoles

CardTokenTypeSelectors
  ids?: string[]
  idPrefixes?: string[]

CardAnimationZoneRoles
  draw: string[]
  hand: string[]
  shared: string[]
  burn: string[]
  discard: string[]

AnimationsConfig
  actions?: Record<string, string>

CardsConfig
  templates?: Record<string, CardTemplate>

CardTemplate
  width: number
  height: number
  layout?: Record<string, CardFieldLayout>

CardFieldLayout
  y?: number
  fontSize?: number
  align?: string
  wrap?: number

VariablesConfig
  prominent?: string[]
  panels?: VariablePanel[]
  formatting?: Record<string, VariableFormatting>

VariablePanel
  name: string
  vars: string[]

VariableFormatting
  type: string
  min?: number
  max?: number
  labels?: string[]
  suffix?: string
```

Also export a Zod v4 schema `VisualConfigSchema` that mirrors every type above. The schema is used at load time to validate parsed YAML.

### visual-config-defaults.ts

Export named constants:

| Constant | Type | Value |
|----------|------|-------|
| `DEFAULT_ZONE_SHAPE` | `ZoneShape` | `'rectangle'` |
| `DEFAULT_ZONE_WIDTH` | `number` | `160` |
| `DEFAULT_ZONE_HEIGHT` | `number` | `100` |
| `DEFAULT_TOKEN_SHAPE` | `TokenShape` | `'circle'` |
| `DEFAULT_TOKEN_SIZE` | `number` | `28` |
| `DEFAULT_FACTION_PALETTE` | `readonly string[]` | 8-color palette (same as existing `DefaultFactionColorProvider`) |

Export a pure function `computeDefaultFactionColor(factionId: string): string` that uses FNV-1a hash into the palette (port logic from `packages/runner/src/canvas/renderers/faction-colors.ts` `DefaultFactionColorProvider.getColor()`).

### visual-config-provider.ts

Stateless class `VisualConfigProvider`:

**Constructor**: `new VisualConfigProvider(config: VisualConfig | null)`

**Methods**:

| Method | Return | Logic |
|--------|--------|-------|
| `resolveZoneVisual(zoneId, category, attributes)` | `ResolvedZoneVisual` | Merge chain: defaults -> categoryStyles[category] -> matching attributeRules (in order) -> overrides[zoneId]. Skip undefined fields at each step. |
| `getZoneLabel(zoneId)` | `string \| null` | Return `overrides[zoneId].label` if set, else `null` |
| `getFactionColor(factionId)` | `string` | Return config color if set, else `computeDefaultFactionColor(factionId)` |
| `getFactionDisplayName(factionId)` | `string \| null` | Return config displayName if set, else `null` (caller uses `formatIdAsDisplayName` fallback) |
| `getTokenTypeVisual(tokenTypeId)` | `ResolvedTokenVisual` | Return config entry merged with defaults |
| `getLayoutMode(hasAdjacency: boolean)` | `LayoutMode` | Return config mode if set, else `'graph'` if hasAdjacency, else `'table'` |
| `getLayoutRole(zoneId)` | `LayoutRole \| null` | Return config layoutRoles[zoneId] if set, else `null` |
| `getCardAnimation()` | `CardAnimationConfig \| null` | Return config cardAnimation or `null` |
| `getAnimationPreset(actionId)` | `string \| null` | Return config animations.actions[actionId] or `null` |
| `getVariablesConfig()` | `VariablesConfig \| null` | Return config variables or `null` |

**Helper type**:

```typescript
interface ResolvedZoneVisual {
  readonly shape: ZoneShape;
  readonly width: number;
  readonly height: number;
  readonly color: string | null;  // null = use visibility-based fill (renderer decides)
}

interface ResolvedTokenVisual {
  readonly shape: TokenShape;
  readonly color: string | null;  // null = use faction color
  readonly size: number;
  readonly symbol: string | null;
}
```

---

## Out of scope

- Loading YAML from files (VISCONF-003)
- Creating game-specific YAML files (VISCONF-002)
- Wiring into any existing runner code (VISCONF-004 through 007)
- Modifying any engine files
- Modifying any existing runner files
- Vite plugin configuration

---

## Acceptance criteria

### Tests that must pass

**visual-config-schema.test.ts**:
1. Valid FITL-shaped config parses without errors
2. Valid Texas Hold'em-shaped config parses without errors
3. Empty object (only `version: 1`) parses — all sections optional
4. Invalid version (e.g. `2`) rejects
5. Invalid zone shape string rejects
6. Invalid layout mode string rejects
7. Malformed attributeRules (missing `match` or `style`) rejects
8. cardAnimation with missing required `zoneRoles` rejects

**visual-config-provider.test.ts**:
1. `null` config — `resolveZoneVisual()` returns all defaults (rectangle, 160, 100)
2. `null` config — `getFactionColor('us')` returns a deterministic hash color
3. `null` config — `getLayoutMode(true)` returns `'graph'`, `getLayoutMode(false)` returns `'table'`
4. `null` config — `getCardAnimation()` returns `null`
5. categoryStyles only — zone with matching category gets category style merged over defaults
6. categoryStyles + attributeRules — matching rule overrides category color
7. categoryStyles + attributeRules + overrides — override wins for specified zone
8. Non-matching attributeRule — zone keeps category style
9. `getFactionColor` with config — returns config color for known faction, hash color for unknown
10. `getFactionDisplayName` — returns config displayName if set, null otherwise
11. `getTokenTypeVisual` with config — returns config values merged with defaults
12. `getTokenTypeVisual` with null config — returns all defaults
13. `getLayoutRole` — returns config value for known zone, null for unknown
14. Two calls with same inputs return structurally equal results (deterministic)

### Invariants

- `VisualConfigProvider` is stateless — constructing with same config always produces same results
- All resolved values have concrete types (no `undefined` in `ResolvedZoneVisual` or `ResolvedTokenVisual`)
- Default palette color computation is deterministic given the same factionId string
- Zod schema accepts all YAML structures shown in the spec's schema example
- No imports from `@ludoforge/engine` — types are runner-owned
- `pnpm -F @ludoforge/runner typecheck` passes
- `pnpm -F @ludoforge/runner test` passes (new tests + all existing tests unchanged)
