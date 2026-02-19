# Spec 42: Per-Game Visual Config

**Status**: ACTIVE
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 38 (PixiJS Canvas Foundation), Spec 39 (React DOM UI Layer), Spec 41 (Board Layout Engine)
**Roadmap**: [35-00-frontend-implementation-roadmap.md](./35-00-frontend-implementation-roadmap.md)
**Design doc**: [brainstorming/browser-based-game-runner.md](../brainstorming/browser-based-game-runner.md), Sections 7–9
**Ticket prefix**: VISCONF

---

## Objective

Extract all presentation data from GameDef into per-game visual config YAML files. Create a `VisualConfigProvider` in the runner that resolves visual properties with a layered defaults system. Strip visual fields from engine types, compiler, and game spec files.

**Goal**: GameDef = pure rules. Visual config = all presentation. The kernel and compiler never touch visual data.

**Success criteria**: The engine contains zero visual hint types. The runner renders correctly using `VisualConfigProvider` backed by per-game `visual-config.yaml` files with full fallback defaults when no config exists.

---

## Constraints

- The visual config file is **display-only**. The kernel and compiler never read it.
- The runner MUST work without a visual config file (default rendering via `VisualConfigProvider` fallbacks).
- GameDef becomes pure rules — no `ZoneVisualHints`, no `TokenVisualHints`, no `FactionDef.color`, no `layoutMode`, no `cardAnimation`, no `layoutRole`.
- Visual config loaded at build time via Vite YAML import, not fetched at runtime.
- No backwards compatibility — clean break from engine visual fields.

---

## Visual Config YAML Schema

```yaml
# data/games/<game>/visual-config.yaml
version: 1

layout:
  mode: graph  # 'graph' | 'table' | 'track' | 'grid'
  hints:
    regions:
      - name: "North Vietnam"
        zones: ["hanoi", "haiphong", "north-vietnam"]
        position: "top-left"
    fixed:
      - zone: "available-forces-us"
        x: -200
        y: 400

factions:
  us:
    color: "#e63946"
    displayName: "United States"
  arvn:
    color: "#457b9d"
    displayName: "ARVN"

zones:
  categoryStyles:
    city:
      shape: circle
      width: 90
      height: 90
      color: "#5b7fa5"
    province:
      shape: rectangle
      width: 160
      height: 100

  attributeRules:
    - match:
        category: [province]
        attributeContains:
          terrainTags: highland
      style:
        color: "#6b5b3e"

  overrides:
    "hue:none":
      label: "Hue"
    "saigon:none":
      label: "Saigon"

  layoutRoles:
    deck: card
    available-US: forcePool

tokenTypes:
  us-troops:
    shape: cube
    color: "#e63946"
    size: 24

cardAnimation:
  cardTokenTypes:
    idPrefixes: [card-]
  zoneRoles:
    draw: [deck]
    hand: [hand]
    shared: [community]
    burn: [burn]
    discard: [muck]

animations:
  actions:
    bombard: "explosion"
    sweep: "scan"

cards:
  templates:
    event-card:
      width: 200
      height: 300
      layout:
        title: { y: 20, fontSize: 16, align: "center" }
        text: { y: 80, fontSize: 11, align: "left", wrap: 180 }

variables:
  prominent: ["pot", "currentBet"]
  panels:
    - name: "Faction Resources"
      vars: ["resources-us", "resources-arvn"]
  formatting:
    support: { type: "track", min: -2, max: 2, labels: ["Active Opp", "Passive Opp", "Neutral", "Passive Sup", "Active Sup"] }
```

---

## Resolution Chain (VisualConfigProvider)

For zone visuals: `defaults → categoryStyles[category] → attributeRules (in order) → overrides[zoneId]`. Each step merges (later values overwrite earlier, undefined fields are skipped).

---

## Fallback Defaults (no visual config)

| Property | Default |
|----------|---------|
| Layout mode | `'graph'` if any zone has adjacency, `'table'` otherwise |
| Faction color | FNV-1a hash into 8-color palette (existing `DefaultFactionColorProvider`) |
| Faction displayName | `formatIdAsDisplayName(factionId)` (existing utility) |
| Zone shape | `'rectangle'` |
| Zone width/height | 160/100 (current `ZONE_RENDER_WIDTH`/`HEIGHT`) |
| Zone color | Visibility-based fill (current `resolveFillColor`) |
| Zone label | `formatIdAsDisplayName(zoneId)` |
| Layout role | Heuristic: stack+no-adjacency=card, owner+owner-vis=hand, else other |
| Token shape | `'circle'` |
| Token color | Faction color fallback |
| Token size | 28 |
| Card animation | `null` (no card animations) |

---

## Deliverables

### D1: Visual Config Types

`packages/runner/src/config/visual-config-types.ts`

- `VisualConfig`, `ZoneVisualStyle`, `TokenTypeVisualStyle`, `CardAnimationConfig`
- `ZoneShape`, `TokenShape` types (moved from engine)
- `LayoutMode`, `LayoutRole` types (moved from engine)
- Zod v4 schema for YAML validation

### D2: VisualConfigProvider

`packages/runner/src/config/visual-config-provider.ts`

- Stateless resolver class, constructed with `VisualConfig | null`
- Methods: `resolveZoneVisual(zoneId, category, attributes)`, `getFactionColor(factionId)`, `getFactionDisplayName(factionId)`, `getTokenTypeVisual(tokenTypeId)`, `getLayoutMode()`, `getLayoutRole(zoneId)`, `getCardAnimation()`
- Encapsulates the category → attributeRules → override merge chain

### D3: Visual Config Defaults

`packages/runner/src/config/visual-config-defaults.ts`

- All default values for when no visual config exists
- Reuses existing heuristics (hash-based palette, visibility-based fill, formatIdAsDisplayName)

### D4: Visual Config Loader

`packages/runner/src/config/visual-config-loader.ts`

- Vite build-time YAML import (needs `vite-plugin-yaml` or equivalent)
- Validates against Zod schema, returns typed `VisualConfig | null`

### D5: Create FITL visual-config.yaml

`data/games/fire-in-the-lake/visual-config.yaml`

- Extract: faction colors/displayNames, zone labels, zone category styles, layout roles, token type visuals
- Source: `00-metadata.md`, `10-vocabulary.md`, `40-content-data-assets.md`

### D6: Create Texas Hold'em visual-config.yaml

`data/games/texas-holdem/visual-config.yaml`

- Extract: cardAnimation, layout roles, faction color, layout mode
- Source: `00-metadata.md`, `10-vocabulary.md`, `40-content-data-assets.md`

### D7: Wire visual config into runner rendering

Multiple runner files:
- `derive-render-model.ts`: Inject `VisualConfigProvider`, use for zone visual/displayName
- `faction-colors.ts`: Rewrite `GameDefFactionColorProvider` → `VisualConfigFactionColorProvider`
- `renderer-types.ts`: Change `TokenVisualHints` → `TokenTypeVisualStyle`
- Zone/token renderers: Use runner visual types instead of engine types
- `canvas-equality.ts`: Update zone/token visual equality checks

### D8: Wire visual config into runner layout

Layout pipeline files:
- `build-layout-graph.ts`: `resolveLayoutMode()` from visual config
- `aux-zone-layout.ts`: `classifyAuxZone()` from visual config layout roles
- `layout-cache.ts`: Include visual config hash in cache key

### D9: Wire visual config into animation system

- `animation-controller.ts`: `buildCardContext()` reads from `VisualConfigProvider.getCardAnimation()`

### D10: Strip visual fields from engine types

Engine kernel:
- `types-core.ts`: Remove `ZoneVisualHints`, `TokenVisualHints`, `ZoneShape`, `TokenShape`, `CardAnimationMetadata`, `visual`/`layoutRole` from ZoneDef, `visual` from TokenTypeDef, `color`/`displayName` from FactionDef, `layoutMode` from metadata, `cardAnimation` from GameDef
- `schemas-core.ts`: Remove corresponding Zod schemas
- `index.ts`: Remove re-exports

### D11: Strip visual fields from engine compiler

Engine cnl:
- `compile-lowering.ts`: Remove `lowerCardAnimationMetadata`, visual pass-through
- `compile-data-assets.ts`: Remove `resolveMapSpaceVisuals`, `extractPieceTypeVisuals`
- `compiler-core.ts`: Remove cardAnimation from compiled output
- `compile-zones.ts`: Remove layoutRole from zone output
- `validate-zones.ts`, `validate-metadata.ts`: Remove visual validation
- `game-spec-doc.ts`: Remove visual fields from spec types

### D12: Strip visual data from game spec files

`data/games/*/`:
- FITL: Remove `visual:` from map spaces, `color:`/`displayName:` from factions, `layoutRole:` from zones
- Texas Hold'em: Remove `cardAnimation:` from metadata, `layoutRole:` from zones, `color:`/`displayName:` from factions

### D13: Update bootstrap JSON and regenerate schemas

- Strip visual fields from `fitl-game-def.json` and `texas-game-def.json`
- Run `pnpm turbo schema:artifacts` to regenerate `GameDef.schema.json`

### D14: Update engine tests

- Remove visual field assertions from compilation tests
- Relocate card animation tests to runner
- Update fixtures that include visual data

---

## Ticket Breakdown

| Ticket | Summary | Depends On |
|--------|---------|------------|
| VISCONF-001 | Define visual config types, Zod schema, and VisualConfigProvider | — |
| VISCONF-002 | Create FITL and Texas Hold'em visual-config.yaml files | VISCONF-001 |
| VISCONF-003 | Add Vite YAML loader and visual config loading pipeline | VISCONF-001 |
| VISCONF-004 | Wire visual config into render model derivation | VISCONF-001 |
| VISCONF-005 | Wire visual config into faction color provider and renderers | VISCONF-001 |
| VISCONF-006 | Wire visual config into layout pipeline (layoutMode, layoutRole) | VISCONF-001 |
| VISCONF-007 | Wire visual config into animation system (cardAnimation) | VISCONF-001 |
| VISCONF-008 | Strip visual fields from engine types and schemas | VISCONF-004,005,006,007 |
| VISCONF-009 | Strip visual fields from engine compiler and validators | VISCONF-008 |
| VISCONF-010 | Strip visual data from game spec YAML files | VISCONF-008 |
| VISCONF-011 | Update bootstrap JSON fixtures and regenerate schema artifacts | VISCONF-008 |
| VISCONF-012 | Update engine tests (remove visual assertions, relocate card animation tests) | VISCONF-009 |

**Parallelizable**: VISCONF-002/003/004/005/006/007 can all run in parallel after VISCONF-001.
**Gate**: VISCONF-008 can only start after all runner wiring is complete.
**Final wave**: VISCONF-009/010/011/012 can then run in parallel after VISCONF-008.

---

## Verification

1. `pnpm turbo build` — engine and runner both compile with zero visual fields in engine types
2. `pnpm turbo test` — all engine tests pass without visual field assertions; all runner tests pass with VisualConfigProvider
3. `pnpm turbo typecheck` — no type errors
4. `pnpm -F @ludoforge/runner dev` — FITL and Texas Hold'em render correctly using visual config data
5. Remove `data/games/fire-in-the-lake/visual-config.yaml` temporarily — runner still renders with fallback defaults
6. `pnpm turbo schema:artifacts` — regenerated GameDef.schema.json has no visual fields
7. Grep engine source for `visual`, `layoutRole`, `layoutMode`, `cardAnimation`, `displayName` (on types) — zero hits

---

## Out of Scope

- Session management (game selection, save/load, replay, event log) — see Spec 43
- Sprite/image asset creation (the visual config references images; creating them is a design task)
- Custom animation effect implementation (explosion particles, etc.)
- Token stacking within zones (rendering concern, not config — future ticket)
- Zone style hint derivation from zone metadata (rendering heuristic — incorporated into D2/D3 defaults)
