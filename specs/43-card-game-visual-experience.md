# Spec 43 — Card Game Visual Experience

## Context

The browser runner's first pass is complete, but card games (Texas Hold'em) have critical visual deficiencies: tokens render as gray circles instead of cards, all zones are shunted to a sidebar instead of appearing on a table, there are no deal animations, and the Hand panel shows raw property text. The root causes are (1) a missing `tokenTypes` config section, (2) the layout pipeline routing ALL zones to the aux sidebar when no adjacency-based board zones exist, (3) card template text rendering with no color/symbol support, and (4) no card-aware Hand panel component. This spec addresses all of these plus table background, chip/pot/bet overlays, and dealer button visualization.

**Constraint**: All changes are game-agnostic. GameDef and simulation remain untouched. All game-specific presentation is driven by `visual-config.yaml`.

---

## Deliverables

### D1. Token type prefix matching (fix gray circles)

**Problem**: `getTokenTypeVisual()` in `visual-config-provider.ts` does exact key lookup on `config.tokenTypes[tokenTypeId]`. Texas Hold'em has 52 token types (`card-2S` through `card-AS`) but no `tokenTypes` entries. The default is `circle`.

**Solution**: Add a `tokenTypeDefaults` array to the visual config schema using the existing `TokenTypeSelectorsSchema` pattern (same as `cards.assignments`). When exact match fails, iterate `tokenTypeDefaults` and find the first matching prefix.

Files to modify:
- `packages/runner/src/config/visual-config-types.ts` — Add `TokenTypeDefaultSchema` and `tokenTypeDefaults` array to `VisualConfigSchema`
- `packages/runner/src/config/visual-config-provider.ts` — Modify `getTokenTypeVisual()`, `resolveTokenSymbols()`, and `getTokenTypeDisplayName()` to fall back to prefix matching via `tokenTypeDefaults`
- `data/games/texas-holdem/visual-config.yaml` — Add:
  ```yaml
  tokenTypeDefaults:
    - match:
        idPrefixes: [card-]
      style:
        shape: card
        color: "#ffffff"
        backSymbol: diamond
  ```

Schema addition:
```typescript
const TokenTypeDefaultSchema = z.object({
  match: TokenTypeSelectorsSchema,
  style: TokenTypeVisualStyleSchema,
});

// In VisualConfigSchema:
tokenTypeDefaults: z.array(TokenTypeDefaultSchema).optional(),
```

Tests: `packages/runner/test/config/visual-config-provider.test.ts` — prefix matching, exact match takes priority over defaults, first matching prefix wins.

---

### D2. Card template color and symbol support (styled text cards)

**Problem**: `drawCardContent()` in `card-template-renderer.ts` renders all text in hardcoded white (`#f8fafc`). No mechanism for property-driven colors (red hearts, black spades) or value-to-symbol mapping (suitName "Hearts" -> "&#x2665;").

**Solution**: Extend `CardFieldLayoutSchema` with optional fields for source remapping, symbol mapping, and color mapping. All additive, no breaking changes.

Files to modify:
- `packages/runner/src/config/visual-config-types.ts` — Extend `CardFieldLayoutSchema`:
  ```typescript
  const CardFieldLayoutSchema = z.object({
    y: z.number().optional(),
    x: z.number().optional(),          // NEW: horizontal pixel offset
    fontSize: z.number().optional(),
    align: z.string().optional(),
    wrap: z.number().optional(),
    sourceField: z.string().optional(), // NEW: read from this property instead of field key name
    symbolMap: z.record(z.string(), z.string()).optional(), // NEW: property value -> display text
    colorFromProp: z.string().optional(), // NEW: property name whose value selects color
    colorMap: z.record(z.string(), z.string()).optional(),  // NEW: property value -> hex color
  });
  ```
- `packages/runner/src/canvas/renderers/card-template-renderer.ts` — Modify `drawCardContent()`:
  1. Resolve source: `fields[fieldLayout.sourceField ?? fieldName]`
  2. Apply symbolMap: `symbolMap[String(rawValue)] ?? String(rawValue)`
  3. Resolve color: if `colorFromProp` set, lookup `fields[colorFromProp]` in `colorMap`, else default white
  4. Support `x` offset in addition to alignment-based positioning
- `data/games/texas-holdem/visual-config.yaml` — Update poker-card template:
  ```yaml
  cards:
    templates:
      poker-card:
        width: 48
        height: 68
        layout:
          rankCorner:
            y: 4
            x: 4
            fontSize: 9
            align: left
            sourceField: rankName
            colorFromProp: suitName
            colorMap:
              Spades: "#1e293b"
              Hearts: "#dc2626"
              Diamonds: "#dc2626"
              Clubs: "#1e293b"
          suitCenter:
            y: 20
            fontSize: 18
            align: center
            sourceField: suitName
            symbolMap:
              Spades: "\u2660"
              Hearts: "\u2665"
              Diamonds: "\u2666"
              Clubs: "\u2663"
            colorFromProp: suitName
            colorMap:
              Spades: "#1e293b"
              Hearts: "#dc2626"
              Diamonds: "#dc2626"
              Clubs: "#1e293b"
          rankBottom:
            y: 52
            x: -4
            fontSize: 9
            align: right
            sourceField: rankName
            colorFromProp: suitName
            colorMap:
              Spades: "#1e293b"
              Hearts: "#dc2626"
              Diamonds: "#dc2626"
              Clubs: "#1e293b"
  ```

Tests: `packages/runner/test/canvas/renderers/card-template-renderer.test.ts` — sourceField resolution, symbolMap transformation, colorMap application.

---

### D3. Card-role-aware table layout (zones on table, not sidebar)

**Problem**: `partitionZones()` puts all non-adjacency zones in `aux`. `computeAuxLayout()` places all aux zones in a sidebar. For Texas Hold'em, ALL zones end up in the sidebar, and the aux positions overwrite the board positions in `layout-cache.ts` line 38-40.

**Solution**: In `layout-cache.ts`, after `partitionZones(def)`, promote zones that appear in `cardAnimation.zoneRoles` from aux to board. Then pass the promoted board list to the table layout and the filtered aux to `computeAuxLayout()`.

Files to modify:
- `packages/runner/src/layout/layout-helpers.ts` — Add `promoteCardRoleZones()`:
  ```typescript
  export function promoteCardRoleZones(
    partitioned: { board: ZoneDef[]; aux: ZoneDef[] },
    provider: VisualConfigProvider,
  ): { board: readonly ZoneDef[]; aux: readonly ZoneDef[] } {
    const cardAnimation = provider.getCardAnimation();
    if (cardAnimation === null) return partitioned;

    const roleZoneIds = new Set<string>();
    for (const ids of Object.values(cardAnimation.zoneRoles)) {
      for (const id of ids) roleZoneIds.add(id);
    }

    const promoted: ZoneDef[] = [...partitioned.board];
    const remaining: ZoneDef[] = [];
    for (const zone of partitioned.aux) {
      if (roleZoneIds.has(zone.id)) promoted.push(zone);
      else remaining.push(zone);
    }
    return { board: promoted, aux: remaining };
  }
  ```
- `packages/runner/src/layout/layout-cache.ts` — After `partitionZones(def)`, call `promoteCardRoleZones()`, pass `promoted.board` to compute layout and `promoted.aux` to `computeAuxLayout()`
- `packages/runner/src/layout/compute-layout.ts` — Modify `computeLayout()` and `computeTableLayout()` to accept an explicit zone list instead of re-deriving from `def` via `selectPrimaryLayoutZones()`:
  ```typescript
  export function computeLayout(
    def: GameDef,
    mode: LayoutMode,
    regionHints?: readonly RegionHint[] | null,
    boardZones?: readonly ZoneDef[],  // NEW optional param
  ): LayoutResult {
    switch (mode) {
      case 'table': return computeTableLayout(boardZones ?? selectPrimaryLayoutZones(def));
      // ...
    }
  }
  ```
- `packages/runner/src/layout/compute-layout.ts` — In `placePlayerZones()`, change starting angle from `-Math.PI / 2` (top) to `Math.PI / 2` (bottom) so seat 0 appears at bottom of table

**Enhanced table center layout for card-role zones**: Modify `computeTableLayout()` to accept optional `CardAnimationZoneRoles` and position shared (non-player) zones by role:
- `draw` zones: above center
- `shared` zones: center row, spread horizontally
- `burn` zones: below center-left
- `discard` zones: below center-right
- Zones not in any role but still shared: center column (existing behavior)

New constants:
```typescript
const TABLE_CENTER_ROW_GAP = 100;
const TABLE_CENTER_HORIZONTAL_SPACING = 140;
```

Tests:
- `packages/runner/test/layout/layout-helpers.test.ts` — promoteCardRoleZones with various configs
- `packages/runner/test/layout/compute-layout.test.ts` — card-role center placement, seat 0 at bottom
- `packages/runner/test/layout/layout-cache.test.ts` — full pipeline with card role promotion

---

### D4. Table background ("felt")

**Problem**: Empty dark canvas with no visual table surface.

**Solution**: Add `tableBackground` config to layout section. New `table-background-renderer.ts` draws a PixiJS Graphics ellipse/rect behind all zones.

Files to create:
- `packages/runner/src/canvas/renderers/table-background-renderer.ts` — Draws filled shape (ellipse/rectangle/roundedRect) sized to board bounds + padding. Added to board group BEFORE zone layer.

Files to modify:
- `packages/runner/src/config/visual-config-types.ts` — Add `TableBackgroundSchema`:
  ```typescript
  const TableBackgroundSchema = z.object({
    color: z.string().optional(),           // default: '#0a5c2e'
    shape: z.enum(['ellipse', 'rectangle', 'roundedRect']).optional(),
    paddingX: z.number().optional(),        // default: 80
    paddingY: z.number().optional(),        // default: 60
    borderColor: z.string().optional(),
    borderWidth: z.number().optional(),
  });
  ```
  Add to `LayoutConfigSchema`: `tableBackground: TableBackgroundSchema.optional()`
- `packages/runner/src/config/visual-config-provider.ts` — Add `getTableBackground()` method
- `packages/runner/src/canvas/layers.ts` — Add `backgroundLayer` container as first child of `boardGroup`
- `packages/runner/src/canvas/GameCanvas.tsx` — Create and wire background renderer
- `data/games/texas-holdem/visual-config.yaml`:
  ```yaml
  layout:
    mode: table
    tableBackground:
      color: "#0a5c2e"
      shape: ellipse
      paddingX: 100
      paddingY: 80
      borderColor: "#4a2c0a"
      borderWidth: 4
  ```

Tests: `packages/runner/test/canvas/renderers/table-background-renderer.test.ts`

---

### D5. Table overlays (pot, bets, dealer button)

**Problem**: Pot, bets, and dealer seat are only visible as text in the scoreboard panel.

**Solution**: Add `tableOverlays` config section. New `table-overlay-renderer.ts` renders variable-driven PixiJS Text objects positioned relative to table center or player seats.

Files to create:
- `packages/runner/src/canvas/renderers/table-overlay-renderer.ts` — Reads overlay config, resolves variable values from render model, draws styled text at configured positions. In world-space (pans/zooms with viewport).

Files to modify:
- `packages/runner/src/config/visual-config-types.ts` — Add schemas:
  ```typescript
  const TableOverlayItemSchema = z.object({
    kind: z.enum(['globalVar', 'perPlayerVar', 'marker']),
    varName: z.string(),
    label: z.string().optional(),
    position: z.enum(['tableCenter', 'playerSeat']),
    offsetX: z.number().optional(),
    offsetY: z.number().optional(),
    fontSize: z.number().optional(),
    color: z.string().optional(),
    markerShape: z.enum(['circle', 'badge']).optional(),
  });

  const TableOverlaysSchema = z.object({
    items: z.array(TableOverlayItemSchema).optional(),
  });
  ```
  Add to `VisualConfigSchema`: `tableOverlays: TableOverlaysSchema.optional()`
- `packages/runner/src/config/visual-config-provider.ts` — Add `getTableOverlays()` method
- `packages/runner/src/canvas/canvas-updater.ts` — Wire overlay renderer into update cycle
- `packages/runner/src/canvas/GameCanvas.tsx` — Create and wire overlay renderer
- `data/games/texas-holdem/visual-config.yaml`:
  ```yaml
  tableOverlays:
    items:
      - kind: globalVar
        varName: pot
        label: "Pot"
        position: tableCenter
        offsetY: 60
        fontSize: 14
        color: "#fbbf24"
      - kind: perPlayerVar
        varName: streetBet
        label: "Bet"
        position: playerSeat
        offsetY: -40
        fontSize: 11
        color: "#94a3b8"
      - kind: marker
        varName: dealerSeat
        label: "D"
        position: playerSeat
        offsetX: -60
        offsetY: -20
        markerShape: circle
        color: "#fbbf24"
  ```

Overlay behavior:
- `globalVar` at `tableCenter`: renders label + value at table center + offset
- `perPlayerVar` at `playerSeat`: renders per each active player near their seat + offset
- `marker` at `playerSeat`: renders a marker badge at the seat whose index equals the var's value (for dealer button: `dealerSeat` value = seat index)

Tests: `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts`

---

### D6. Hand panel card visuals

**Problem**: `PlayerHandPanel.tsx` shows `card-JH\nrank: 11, rankName: Jack, suit: 1, suitName: Hearts` as plain text.

**Solution**: Create a `MiniCard` React component that renders HTML/CSS mini cards. The Hand panel uses `VisualConfigProvider` to check if a token has a card template and renders `MiniCard` instead of text.

Files to create:
- `packages/runner/src/ui/MiniCard.tsx` — React component:
  - Props: `RenderToken`, optional `CardTemplate`
  - Face-up: renders rank in corners, suit symbol centered, colored by suit (using same symbolMap/colorMap from template)
  - Face-down: dark card with back pattern
- `packages/runner/src/ui/MiniCard.module.css` — Card styling (36x52px, rounded corners, card-back pattern)

Files to modify:
- `packages/runner/src/ui/PlayerHandPanel.tsx`:
  - Import `useContext` and `VisualConfigContext`
  - For each token: check `getCardTemplateForTokenType(token.type)`
  - If template exists: render `<MiniCard token={token} template={template} />`
  - If no template: keep existing text fallback (graceful degradation for non-card games)

VisualConfigContext availability: Already provided in `GameContainer.tsx` wrapping the UI layer.

Tests: `packages/runner/test/ui/MiniCard.test.ts`, update `packages/runner/test/ui/PlayerHandPanel.test.ts`

---

### D7. Deal animation activation

**Problem**: Card animation infrastructure exists (`card-classification.ts`, arc-tween presets) but isn't producing visible animations because zones are in the sidebar.

**Resolution**: D3 fixes zone positioning on the table. Once zones have proper positions, the existing animation system should automatically produce deal animations (moveToken from draw zone to hand/shared zone -> classified as `cardDeal` -> arc-tween preset). No new animation code needed.

**Verification**: After D3 is complete, start a Texas Hold'em game and confirm arc-tween animations play for initial deal. If animations don't trigger, investigate whether the trace-to-descriptor pipeline is receiving the correct zone positions.

---

## Implementation Order

1. **D1** (token type prefix matching) — standalone, immediately fixes gray circles
2. **D2** (card template color/symbol) — depends on D1 for card shape to be active
3. **D3** (card-role table layout) — standalone, fixes zone positioning; enables D7 automatically
4. **D4** (table background) — depends on D3 for board bounds
5. **D5** (table overlays) — depends on D3 for zone positions
6. **D6** (hand panel cards) — depends on D2 for card template schema
7. **D7** (deal animation verification) — depends on D3

D1+D3 can be done in parallel. D2+D6 are sequential. D4+D5 can be done in parallel after D3.

## Verification

1. `pnpm -F @ludoforge/runner test` — all new and existing tests pass
2. `pnpm -F @ludoforge/runner typecheck` — no type errors
3. `pnpm -F @ludoforge/runner lint` — clean
4. `pnpm -F @ludoforge/runner dev` — start dev server, load Texas Hold'em:
   - Cards render as styled rectangles with rank + suit symbol + color
   - Deck/Community/Burn/Muck are centered on the table
   - Hand zones surround the table (seat 0 at bottom)
   - Green table felt background visible
   - Pot amount and bet amounts visible on table
   - Dealer button badge visible at active seat
   - Hand panel shows mini card visuals
   - Deal animation plays when game starts
5. Load FITL game — confirm no regressions (graph layout, token shapes, sidebar aux zones all unchanged)
