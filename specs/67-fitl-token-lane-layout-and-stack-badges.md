# Spec 67 — FITL Token Lane Layout and Stack Badges

**Depends on**: Spec 42 (per-game visual config)

## 0. Problem Statement

### 0.1 Current Rendering Collapses Distinct Piece Roles

In the current Fire in the Lake runner rendering, all non-card tokens in a map space are placed by the generic grid logic in [`packages/runner/src/canvas/renderers/token-renderer.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/renderers/token-renderer.ts). FITL bases therefore sit in the same centered row as troops, guerrillas, police, and irregulars.

That is visually wrong for FITL. Bases are strategically distinct pieces: they drive growth, matter for control and victory, and should read as a separate layer in the space, not just another token in the same row.

### 0.2 Current Stack Count Badge Is Underspecified

The count badge for stacked tokens is also hardcoded in the renderer:

- font size is too small
- there is no outline or dedicated legibility treatment
- the badge sits too far inside the token instead of reading as a corner marker

This is visible in [`screenshots/fitl-tokens.png`](/home/joeloverbeck/projects/ludoforge-llm/screenshots/fitl-tokens.png), where the VC guerrilla stack count is technically present but visually weak.

### 0.3 Architectural Gap

FITL-specific token presentation cannot be expressed today in [`data/games/fire-in-the-lake/visual-config.yaml`](/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/visual-config.yaml). The renderer owns:

- intra-zone token placement policy
- grid constants
- stack badge typography and offset

That violates the project direction established by Spec 42: visual presentation belongs in runner visual config, while `GameDef`, simulation, compiler, and kernel remain game-agnostic.

## 1. Goals

1. Regular tokens in a FITL map space must be centered horizontally and vertically as a distinct row.
2. Bases in a FITL map space must render in their own separate row beneath the regular-token row.
3. Base tokens must render at 1.5x the size of non-base tokens.
4. Stack count badges must support larger text, black outlining, and configurable corner offsets.
5. The solution must be declarative and reusable through runner visual config, not a FITL branch inside the generic renderer.
6. No backwards-compatibility layer is required. The runner visual-config contract may change cleanly.

## 2. Non-Goals

1. No change to `GameSpecDoc`, YAML rules content, compiler, kernel, or simulation semantics.
2. No FITL-only hardcoded token-type checks in engine or runner source.
3. No attempt to solve every future board-game token layout pattern in this spec. This should create a clean extension point for zone-local token lanes and badge styling, not a universal scene-layout DSL.

## 3. Current State

### 3.1 Placement

[`packages/runner/src/canvas/renderers/token-renderer.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/renderers/token-renderer.ts) currently chooses among three generic layouts:

- `fan` for shared/hand card zones
- `stack` for card piles
- `grid` for everything else

For non-card tokens, `gridOffset()` uses fixed renderer constants:

- `TOKENS_PER_ROW = 6`
- `TOKEN_SPACING = 36`

The renderer has no concept of:

- lane membership within a zone
- token-type visual scaling by role
- map-space-specific layout presets
- count badge style variants per game

### 3.2 Stack Badge

The count badge is currently a bare `Text` node with:

- `fontSize: 10`
- no stroke
- fixed position at `dimensions.width / 2 - 2`, `-dimensions.height / 2 + 2`

That implementation is too renderer-specific and not expressive enough for FITL.

## 4. Design Principles

1. Game-agnostic runtime, game-specific presentation. The runner provides generic token-lane and badge primitives; FITL opts into them through `visual-config.yaml`.
2. Zone-local layout policy. Token arrangement inside a zone is a layout concern owned by the runner visual layer, not by `GameDef`.
3. Declarative token grouping. The renderer should not infer that a token is a base from shape alone. Visual config must explicitly classify token types into presentation groups.
4. Single resolution path. Token visual size, placement lane, and badge style should resolve through `VisualConfigProvider`, not ad hoc constants spread across renderers.
5. Clean break. Existing FITL token rendering may change in one step; do not preserve the old schema.

## 5. Proposed Architecture

### 5.1 Add Zone Token Layout Config to Visual Config

Extend runner visual config with a new zone-token-layout section owned by the runner package.

Recommended shape:

```yaml
zones:
  tokenLayouts:
    defaults:
      other:
        mode: grid
        columns: 6
        spacingX: 36
        spacingY: 36

    presets:
      fitl-map-space:
        mode: lanes
        laneGap: 24
        laneOrder: [regular, base]
        lanes:
          regular:
            anchor: center
            pack: centeredRow
            spacingX: 32
          base:
            anchor: belowPreviousLane
            pack: centeredRow
            spacingX: 42

    assignments:
      byCategory:
        city: fitl-map-space
        province: fitl-map-space
```

Semantics:

- `grid` preserves current generic behavior where desired.
- `lanes` introduces ordered sub-rows within a zone.
- `centeredRow` means tokens in that lane are centered around the zone origin.
- `anchor: center` means the lane is centered vertically on the zone origin.
- `anchor: belowPreviousLane` means the next lane is positioned below the prior lane with `laneGap`.

This keeps the renderer generic while giving FITL a clean way to express "regular pieces centered, bases beneath."

### 5.2 Add Token Presentation Grouping

Extend token visual config so token types can declare a presentation group and scale.

Recommended shape:

```yaml
tokenTypes:
  us-troops:
    shape: square
    color: olive
    presentation:
      lane: regular
      scale: 1

  us-bases:
    shape: round-disk
    color: olive
    presentation:
      lane: base
      scale: 1.5
```

This same pattern applies to all FITL factions:

- `*-bases` map to `lane: base`, `scale: 1.5`
- all other on-map force pieces map to `lane: regular`, `scale: 1`

`presentation.lane` is visual-only metadata. It must not leak into engine contracts or simulation.

### 5.3 Add Stack Badge Styling

Extend token visual config with a reusable stack badge style block.

Recommended shape:

```yaml
tokens:
  stackBadge:
    fontSize: 13
    fill: "#f8fafc"
    stroke: "#000000"
    strokeWidth: 3
    anchorX: 1
    anchorY: 0
    offsetX: 4
    offsetY: -4
```

Semantics:

- badge remains top-right anchored
- larger font improves readability
- black stroke creates legibility on light and dark fills
- positive `offsetX` and negative `offsetY` move the badge farther toward the token corner than the current implementation

This should be a runner-wide primitive, not FITL-only code.

### 5.4 VisualConfigProvider Responsibilities

[`packages/runner/src/config/visual-config-provider.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-provider.ts) should become the single resolver for:

- resolved token presentation metadata for a token type
- resolved zone token layout preset for a zone
- resolved stack badge style

That means `ResolvedTokenVisual` should expand beyond `shape`, `color`, `size`, `symbol`, and `backSymbol` to include presentation metadata, or a sibling resolved type should be introduced for token presentation.

Recommended provider API additions:

- `resolveZoneTokenLayout(zoneId, category): ResolvedZoneTokenLayout`
- `getTokenTypePresentation(tokenTypeId): ResolvedTokenPresentation`
- `getStackBadgeStyle(): ResolvedStackBadgeStyle`

## 6. Renderer Refactor

### 6.1 Replace Grid-Only Placement for Generic Map Tokens

[`packages/runner/src/canvas/renderers/token-renderer.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/renderers/token-renderer.ts) should stop deciding generic map-token placement solely through `gridOffset(index)`.

Instead, token placement should be a two-step process:

1. Resolve a zone token layout policy through `VisualConfigProvider`.
2. Partition rendered token entries into lanes using token presentation metadata, then compute offsets within each lane.

For FITL map spaces this yields:

- lane `regular`: VC guerrillas, NVA troops, US troops, irregulars, police, rangers, etc.
- lane `base`: all bases

### 6.2 Preserve Stacking Semantics

The existing stack-collapse behavior in `buildRenderEntries()` should remain conceptually intact:

- identical non-selectable tokens may still collapse into one rendered entry with a count badge
- lane assignment must happen on the rendered entry based on the representative token type

This is important because FITL needs "two VC guerrillas" to remain one token graphic plus a badge, just placed in the regular lane.

### 6.3 Token Scale Must Affect Shape, Hit Area, and Badge Anchor

Base enlargement cannot be a post-hoc Pixi container scale hack. The resolved scale must flow through token dimension calculation so that:

- geometry is sized correctly
- hit areas remain correct
- badge positioning is computed from the final rendered dimensions

That keeps selection and hover behavior aligned with visuals.

## 7. FITL Visual Config Changes

[`data/games/fire-in-the-lake/visual-config.yaml`](/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/visual-config.yaml) should explicitly define:

1. A zone token layout preset for FITL map spaces using two centered lanes.
2. Token presentation metadata for all FITL token types.
3. A FITL stack badge style.

Required FITL mapping:

- `us-bases`, `arvn-bases`, `nva-bases`, `vc-bases` → `lane: base`, `scale: 1.5`
- `us-troops`, `us-irregulars`, `arvn-troops`, `arvn-police`, `arvn-rangers`, `nva-troops`, `nva-guerrillas`, `vc-guerrillas` → `lane: regular`, `scale: 1`

Lane preset assignment should target map spaces only:

- `city`
- `province`

`loc` zones should remain on existing behavior unless explicitly configured later.

## 8. Schema and Type Changes

### 8.1 `visual-config-types.ts`

Extend [`packages/runner/src/config/visual-config-types.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-types.ts) with:

- `TokenPresentationSchema`
- `StackBadgeStyleSchema`
- `ZoneTokenLayoutSchema`
- lane-based preset/assignment schemas

These types belong in the runner package only.

### 8.2 Validation Rules

Validation must fail fast when:

- a lane-based preset references a lane missing from `laneOrder`
- a token type references a lane not defined by its assigned zone layout
- numeric values such as `scale`, `spacingX`, `laneGap`, `strokeWidth`, or `fontSize` are non-positive

Because no backwards compatibility is required, the schema should reject old partial representations rather than silently guessing.

## 9. Testing Requirements

### 9.1 Schema Tests

Extend [`packages/runner/test/config/visual-config-schema.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-schema.test.ts) to cover:

- valid lane-layout config
- valid token presentation metadata
- valid stack badge styling
- invalid lane references
- invalid non-positive scale and badge stroke values

### 9.2 Provider Tests

Add or extend provider tests to verify:

- FITL map spaces resolve to the two-lane preset
- FITL base token types resolve `lane: base` and `scale: 1.5`
- regular FITL token types resolve `lane: regular`
- stack badge style resolves from config

### 9.3 Renderer Tests

Extend [`packages/runner/test/canvas/renderers/token-renderer.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/renderers/token-renderer.test.ts) with cases that assert:

1. Regular tokens in a lane layout are centered around the zone origin.
2. Base tokens render on a distinct row below the regular lane.
3. Base rendered dimensions are 1.5x those of comparable non-base tokens.
4. Stack badges use the configured font size and stroke.
5. Stack badge position moves farther toward the top-right corner than the current `-2/+2` inset.

### 9.4 Visual Regression Check

After implementation, capture a fresh FITL screenshot for the same Pleiku Darlac state and verify:

- the regular row is visually centered in the space
- the base row reads as separate and subordinate in vertical placement but dominant in size
- the VC guerrilla count badge is clearly legible at normal zoom

## 10. Migration Plan

1. Introduce the new schema/types/provider support in runner.
2. Refactor token renderer to consume resolved zone token layouts, token presentation metadata, and badge style.
3. Update FITL `visual-config.yaml` to define the lane preset, token lane assignments, token scaling, and badge styling.
4. Remove obsolete renderer constants and assumptions that are superseded by the new visual-config contract.

Because backwards compatibility is explicitly out of scope, this may be done as a single coordinated change.

## 11. Acceptance Criteria

This spec is complete when all of the following are true:

1. FITL map spaces render non-base tokens in a centered row and bases in a separate centered row beneath.
2. FITL bases render at 1.5x the size of other FITL force tokens.
3. Stack count badges are larger, black-outlined, and visibly farther toward the token's top-right corner.
4. The behavior is configured through runner visual-config schema and provider resolution, not FITL-specific renderer branching.
5. `GameDef`, simulation, compiler, and kernel remain unchanged and game-agnostic.
