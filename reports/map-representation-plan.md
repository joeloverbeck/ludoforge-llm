# Map Representation Plan — Iteration 7

**Date**: 2026-03-30
**Based on**: EVALUATION #6 (no change; effective scores from EVALUATION #5, average: 6.0)
**Problems targeted**: [MEDIUM] Label readability at overview zoom, [MEDIUM] Token size and faction identification

## Context

Evaluation #6 recorded "no change" because screenshots were not retaken after Iteration 6's code changes. However, **all Iteration 6 changes are already present in the codebase**: routes render above zones (`layers.ts:70-77` shows `zoneLayer` before `connectionRouteLayer`), route stroke width is 6 with alpha 0.75 and overlap margin 80 (`connection-route-renderer.ts:55-61`), and bold terrain colors are in `visual-config.yaml` (Laos `#6b8f7b`, Cambodia `#7a8868`, NV `#8b5e3c`). The next evaluation will capture these changes.

With the two HIGH items from Eval #5 addressed by Iteration 6's code, this iteration targets the top two MEDIUM items that have been recurring longest: label readability (4 consecutive evaluations) and token size (5 consecutive evaluations).

**Stalled iteration check**: Iteration 6 was implemented in code but not re-evaluated due to stale screenshots. No plan changes needed — the code matches the plan. This iteration moves to the next priority tier.

## Deferred Items

| Item | First recommended | Deferred since | Target iteration |
|------|-------------------|---------------|-----------------|
| Adaptive font sizing (zoom-responsive labels) | Eval #2 | Iteration 7 | 8 or later (requires viewport scale plumbing to zone renderer) |
| City circles embedded in territory | Eval #2 | Iteration 4 | No target yet |
| Saigon area visual congestion | Eval #5 | Iteration 6 | No target yet |
| S-curve geography refinement | Eval #2 | Iteration 4 | No target yet |

**Note on adaptive font sizing**: This iteration increases static font sizes for an immediate readability boost. True zoom-responsive scaling (counter-scaling labels inversely to viewport zoom) requires passing viewport scale into the zone renderer's update cycle — a more invasive change deferred to Iteration 8.

## Foundations Alignment

| Foundation | Relevance | How This Plan Respects It |
|-----------|-----------|--------------------------|
| #1 Engine Agnosticism | Not relevant | No engine code changes |
| #3 Visual Separation | Always relevant | Font size constants are runner code; no GameSpecDoc or engine changes |
| #7 Immutability | Not relevant | No state transitions affected — changes are rendering constants |
| #9 No Backwards Compat | Relevant | Size changes apply unconditionally — no opt-in flag or fallback |
| #10 Architectural Completeness | Always relevant | Font size increase is a targeted improvement, not a full zoom-scaling solution. The root cause (no zoom-responsive sizing) is acknowledged and deferred. Token size increase addresses the root cause (tokens too small to distinguish). |

## Current Code Architecture (reference for implementer)

### Zone Label Constants (zone-renderer.ts:243-248)

```typescript
// packages/runner/src/canvas/renderers/zone-renderer.ts:243-248
const LABEL_FONT_SIZE = 26;
const LABEL_CHAR_WIDTH_FACTOR = 0.6;
const LABEL_PILL_PADDING = 8;
const LABEL_PILL_CORNER_RADIUS = 4;
const LABEL_PILL_ALPHA = 0.65;
```

`LABEL_FONT_SIZE` controls the zone name BitmapText size. `LABEL_CHAR_WIDTH_FACTOR` estimates label width for the background pill. `LABEL_PILL_PADDING` adds space around the pill.

### Label Creation (zone-renderer.ts:164-187)

```typescript
const nameLabel = createBitmapLabel('', 0, 0, 26, {
  fontName: STROKE_LABEL_FONT_NAME,
  fill: '#ffffff',
  stroke: { color: '#000000', width: 3 },
  anchor: { x: 0.5, y: 0.5 },
});
```

The hardcoded `26` in the `createBitmapLabel` call uses `LABEL_FONT_SIZE`. The label background pill in `drawLabelBackground()` (lines 250-269) computes width as `LABEL_FONT_SIZE * LABEL_CHAR_WIDTH_FACTOR * textLength + 2 * LABEL_PILL_PADDING`.

### Markers Label (zone-presentation-visuals.ts:16-31)

```typescript
export function createZoneMarkersLabel(...): BitmapText {
  return createManagedBitmapText({
    text: '',
    style: {
      fontName: STROKE_LABEL_FONT_NAME,
      fill: '#f5f7fa',
      fontSize: 11,  // Hardcoded
      stroke: { color: '#000000', width: 2 },
    },
    ...
  });
}
```

Markers label uses a hardcoded `fontSize: 11`.

### Label Position (presentation-scene.ts:114-119)

```typescript
const LABEL_GAP = 8;
const LABEL_LINE_HEIGHT = 18;
```

`LABEL_LINE_HEIGHT` controls vertical spacing between name and markers labels. With larger fonts, this may need a proportional increase.

### Bitmap Font Master Size (bitmap-font-registry.ts:30-51)

Both fonts (`ludoforge-label` and `ludoforge-label-stroke`) are installed at `fontSize: 22`. BitmapText scales runtime requests (26px, 11px) from this 22px master texture. Increasing runtime font sizes to 34px and 15px will scale up from the same 22px master — this works but may appear slightly blurry. If quality is insufficient, the master font size should also increase (e.g., to 36px).

### Token Size (visual-config-defaults.ts:29-30, token-presentation.ts:16)

```typescript
// visual-config-defaults.ts:30
export const DEFAULT_TOKEN_SIZE = 28;

// token-presentation.ts:16
const TOKEN_RADIUS = 14;  // DEFAULT_TOKEN_SIZE / 2
```

All FITL token types use the default 28 (no per-type `size` override in visual-config.yaml). The `size` field is supported in the schema (`visual-config-types.ts:362`) and resolved in `visual-config-provider.ts:238`: `size: style?.size ?? DEFAULT_TOKEN_SIZE`.

### Token Dimension Resolution (token-presentation.ts:517-566)

Dimensions are computed as `max(16, round(size * scale))` for most shapes. Bases use `scale: 1.5` → effective 42px at current size. At proposed size 38: regular tokens = 38px, bases = 57px.

### ZoneRenderer Interface (renderer-types.ts:28-35)

```typescript
export interface ZoneRenderer {
  update(
    zones: readonly PresentationZoneNode[],
    positions: ReadonlyMap<string, Position>,
  ): void;
  getContainerMap(): ReadonlyMap<string, Container>;
  destroy(): void;
}
```

No viewport scale parameter — adding one is deferred to Iteration 8 (adaptive sizing).

## Problem 1: Labels unreadable at overview zoom

**Evaluation score**: Label/Token Readability = 5/10 (unchanged for 4 evaluations)
**Root cause**: Zone name labels use a fixed 26px font with no zoom-responsive scaling. At overview zoom, the viewport scales all content down proportionally — 26px labels shrink below legibility. The background pills help contrast but cannot compensate for tiny rendered size.

### Approaches Considered

1. **Increase static font sizes**
   - Description: Increase `LABEL_FONT_SIZE` from 26 to 34 (+31%), markers from 11 to 15 (+36%), stroke width from 3 to 4. Increase `LABEL_LINE_HEIGHT` from 18 to 24. Increase master bitmap font from 22 to 36 to maintain crisp rendering at the larger size. Increase pill padding from 8 to 10.
   - Feasibility: HIGH — 6 constant changes across 3 files. No API changes.
   - Visual impact: MEDIUM — labels are ~31% larger at all zoom levels. Still shrinks at overview zoom but starts from a larger baseline, keeping labels legible at moderate zoom-out.
   - Risk: LOW — larger labels may overlap with tokens or routes in dense areas. Pill backgrounds will be proportionally larger.

2. **Zoom-responsive counter-scaling (adaptive font sizing)**
   - Description: Pass viewport scale into zone renderer's `update()` method. Compute `labelCounterScale = clamp(1 / viewportScale, 1, 3)`. Apply to both BitmapText and label background pill on each update.
   - Feasibility: MEDIUM — requires modifying `ZoneRenderer` interface, `canvas-updater.ts` call site, and zone-renderer update logic. Also requires scaling the Graphics pill, which currently uses absolute coordinates.
   - Visual impact: HIGH — labels maintain readable size at any zoom level.
   - Risk: MEDIUM — interface change propagates to map editor zone renderer. Label scaling interaction with zone container positioning needs careful testing.

3. **Separate non-scaling label layer**
   - Description: Place all labels in an overlay Container that doesn't zoom with the viewport. Labels are positioned in screen coordinates based on zone world positions projected to screen space.
   - Feasibility: LOW — requires fundamental restructure of label ownership. Labels currently belong to zone containers. Screen-space positioning requires per-frame recalculation.
   - Visual impact: HIGH — labels always render at designed size regardless of zoom.
   - Risk: HIGH — major architectural change. Label-zone association becomes indirect. Performance cost of screen-space projection per frame.

### Recommendation: Approach 1 (Increase static font sizes)

**Why**: Maximum immediate impact with minimum risk. A 31% font size increase makes labels significantly more readable at moderate zoom-out — the most common viewing angle. The true solution (Approach 2) requires interface changes across multiple renderers and is better suited as a dedicated iteration. Approach 1 provides a meaningful improvement now while Approach 2 is deferred to Iteration 8 with a clear scope. The master bitmap font increase from 22 to 36 ensures the larger runtime sizes render crisply rather than appearing blurry from upscaling.

## Problem 2: Tokens too small to identify

**Evaluation score**: Label/Token Readability = 5/10 (token aspect unchanged for 5 evaluations)
**Root cause**: `DEFAULT_TOKEN_SIZE = 28` produces tokens that are ~28px (regular) and ~42px (bases with 1.5x scale). At default and overview zoom, these are too small to distinguish faction shapes (square vs beveled-cylinder vs round-disk) or see activity symbols (star). The FITL visual config already defines good visual differentiation (shape, color, symbol) — the problem is purely that the rendered size is too small to perceive these distinctions.

### Approaches Considered

1. **Increase default token size**
   - Description: Change `DEFAULT_TOKEN_SIZE` from 28 to 38 and `TOKEN_RADIUS` from 14 to 19. All tokens become 36% larger. Regular tokens: 38px (was 28). Bases at 1.5x: 57px (was 42).
   - Feasibility: HIGH — 2 constant changes. All dimension resolution flows through these values.
   - Visual impact: HIGH — tokens large enough to distinguish shapes and see activity symbols at default zoom.
   - Risk: LOW — larger tokens may overlap in dense zones (Saigon area). Lane spacing (`spacingX: 32` for regular, `42` for bases) may need minor increase.

2. **Per-type size overrides in visual-config.yaml**
   - Description: Add explicit `size: 38` to each FITL token type definition in visual-config.yaml. Keeps the global default unchanged.
   - Feasibility: MEDIUM — ~11 token type entries need updating. Game-specific rather than global.
   - Visual impact: HIGH — same visual result as Approach 1 for FITL.
   - Risk: LOW — no code changes at all, purely data. But verbose and game-specific.

3. **Increase size + adjust lane spacing**
   - Description: Increase default size to 38 AND adjust FITL lane spacing (`spacingX` from 32 to 40 for regular, 42 to 52 for bases) and `laneGap` from 24 to 30.
   - Feasibility: HIGH — 2 constant changes + 3 YAML config values.
   - Visual impact: HIGH — larger tokens with proportional spacing prevents overlap.
   - Risk: LOW — slightly larger token clusters may extend beyond zone boundaries in small zones.

### Recommendation: Approach 3 (Increase size + adjust lane spacing)

**Why**: Approach 1 is the core change needed, but larger tokens at unchanged spacing will overlap more in dense zones. Approach 3 combines the size increase with proportional spacing adjustments for a cleaner result. The spacing changes are purely FITL visual config data — no code beyond the 2 constants. This is a hybrid of Approaches 1 and 2 that takes the global size increase (Approach 1) and pairs it with game-specific spacing tuning (from Approach 2's data-only philosophy).

## Implementation Steps

1. **Increase master bitmap font size** — **File**: `packages/runner/src/canvas/text/bitmap-font-registry.ts` — **Depends on**: none
   - Change both `fontSize: 22` entries to `fontSize: 36` (lines ~34 and ~47)
   - This ensures larger runtime font sizes (34px, 15px) render crisply from the master texture

2. **Increase zone label constants** — **File**: `packages/runner/src/canvas/renderers/zone-renderer.ts` — **Depends on**: none
   - `LABEL_FONT_SIZE`: 26 → 34
   - `LABEL_PILL_PADDING`: 8 → 10
   - Update the `createBitmapLabel` call to use `LABEL_FONT_SIZE` instead of hardcoded `26` (if not already)
   - Update label stroke width: 3 → 4 (proportional to larger font)

3. **Increase markers label font size** — **File**: `packages/runner/src/canvas/renderers/zone-presentation-visuals.ts` — **Depends on**: none
   - Markers label `fontSize`: 11 → 15
   - Markers label stroke width: 2 → 3

4. **Increase label line height** — **File**: `packages/runner/src/presentation/presentation-scene.ts` — **Depends on**: none
   - `LABEL_LINE_HEIGHT`: 18 → 24 (proportional to larger name label)

5. **Increase map editor label font size** — **File**: `packages/runner/src/map-editor/map-editor-zone-renderer.ts` — **Depends on**: none
   - Editor label `fontSize`: 20 → 28 (line ~71)

6. **Increase default token size** — **File**: `packages/runner/src/config/visual-config-defaults.ts` — **Depends on**: none
   - `DEFAULT_TOKEN_SIZE`: 28 → 38

7. **Synchronize TOKEN_RADIUS** — **File**: `packages/runner/src/presentation/token-presentation.ts` — **Depends on**: Step 6
   - `TOKEN_RADIUS`: 14 → 19 (keeps it as `DEFAULT_TOKEN_SIZE / 2`)

8. **Adjust FITL token lane spacing** — **File**: `data/games/fire-in-the-lake/visual-config.yaml` — **Depends on**: none
   - Regular lane `spacingX`: 32 → 42
   - Base lane `spacingX`: 42 → 54
   - `laneGap`: 24 → 30

9. **Run typecheck and tests** — **Depends on**: Steps 1-8
   - `pnpm turbo typecheck` — must pass
   - `pnpm -F @ludoforge/runner test` — must pass

10. **Visual verification** — **Depends on**: Step 9
   - `pnpm -F @ludoforge/runner dev` — inspect in browser
   - Verify zone name labels are visibly larger and readable at moderate zoom-out
   - Verify markers labels are proportionally larger
   - Verify label background pills scale with larger text
   - Verify tokens are noticeably larger — faction shapes (square, cylinder, disk) distinguishable at default zoom
   - Verify activity star symbols visible on active guerrillas/irregulars
   - Verify token spacing prevents excessive overlap in dense zones
   - Verify no label-token overlap in standard views
   - Check map editor labels and tokens match game canvas sizes

11. **Take new screenshots for evaluation** — **Depends on**: Step 10
    - `fitl-game-map.png` (close-up)
    - `fitl-game-map-overview.png` (zoomed-out full map)
    - `fitl-map-editor.png` (close-up)
    - `fitl-map-editor-overview.png` (zoomed-out full map)
    - These screenshots will also capture Iteration 6's route and terrain changes for the first time

## Map Editor Scope

**Included in this iteration**:
- Label size changes — the map editor zone renderer (`map-editor-zone-renderer.ts:71`) has its own hardcoded `fontSize: 20`, separate from the game canvas's `LABEL_FONT_SIZE`. This must be updated to 28 (proportional increase from 20, matching the game canvas's 26→34 ratio).
- Bitmap font size — shared across both flows via `installLabelBitmapFonts()`. The master font increase applies to both.
- Token size changes — the editor doesn't render tokens (it's a layout tool), so no editor token changes needed.

**Deferred to future iteration**:
- No editor-specific changes deferred.

## Visual Config Changes

**File**: `data/games/fire-in-the-lake/visual-config.yaml`

Update token layout spacing only:

```yaml
fitl-map-space:
  mode: lanes
  laneGap: 30        # was 24
  laneOrder: [regular, base]
  lanes:
    regular:
      anchor: center
      pack: centeredRow
      spacingX: 42    # was 32
    base:
      anchor: belowPreviousLane
      pack: centeredRow
      spacingX: 54    # was 42
```

**No schema changes needed.**

## Verification

1. `pnpm turbo typecheck` — must pass
2. `pnpm -F @ludoforge/runner test` — must pass
3. Visual check — run dev server (`pnpm -F @ludoforge/runner dev`):
   - Zone name labels are ~31% larger than before — text clearly readable at default zoom
   - Labels remain readable (not tiny) at moderate zoom-out (one notch beyond default)
   - Background pills proportionally larger with adequate padding
   - Markers labels (support/opposition states) visible below zone names
   - Tokens are visibly larger — shapes (square troops, cylinder guerrillas, disk bases) distinguishable
   - Activity star symbols visible on active guerrillas/irregulars at default zoom
   - Base tokens (1.5x scale = 57px) are prominently larger than regular tokens (38px)
   - Token clusters don't excessively overflow zone boundaries in standard-sized zones
   - Saigon/Mekong Delta area: denser but still functional (some overlap acceptable)
   - Map editor: labels render at same larger size
   - No rendering errors or missing glyphs from font size change

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Larger labels overlap with routes in dense areas | MEDIUM | Reduced readability where routes cross zone centers | Routes at 0.75 alpha; labels have opaque background pills that ensure text visibility over routes |
| Larger tokens overflow small zone boundaries | MEDIUM | Visual clutter in Saigon/Mekong Delta | Increased lane spacing (Step 7) compensates. Some overflow acceptable — tokens sitting atop zone fills is standard in board games |
| BitmapText upscaling appears blurry (34px from 22px master) | LOW | Fuzzy label text | Step 1 increases master font to 36px, so 34px runtime size renders at near-native quality |
| Map editor label sizes don't update | VERY LOW | Editor labels remain small while game canvas labels grow | Step 5 explicitly updates `map-editor-zone-renderer.ts:71` from 20 to 28. Both flows share `installLabelBitmapFonts()`. |
| Token lane spacing too generous | LOW | Token clusters appear sparse | Values tuned proportionally (38/28 ≈ 1.36x size increase, spacing increases match). Can reduce if visual check shows excessive gaps |

## Implementation Verification Checklist

- [ ] `bitmap-font-registry.ts`: Master font fontSize changed from 22 to 36 (both font variants)
- [ ] `zone-renderer.ts`: `LABEL_FONT_SIZE` changed from 26 to 34
- [ ] `zone-renderer.ts`: `LABEL_PILL_PADDING` changed from 8 to 10
- [ ] `zone-renderer.ts`: Label stroke width changed from 3 to 4
- [ ] `zone-presentation-visuals.ts`: Markers label fontSize changed from 11 to 15
- [ ] `zone-presentation-visuals.ts`: Markers label stroke width changed from 2 to 3
- [ ] `presentation-scene.ts`: `LABEL_LINE_HEIGHT` changed from 18 to 24
- [ ] `map-editor-zone-renderer.ts`: Editor label fontSize changed from 20 to 28
- [ ] `visual-config-defaults.ts`: `DEFAULT_TOKEN_SIZE` changed from 28 to 38
- [ ] `token-presentation.ts`: `TOKEN_RADIUS` changed from 14 to 19
- [ ] `visual-config.yaml`: `laneGap` changed from 24 to 30
- [ ] `visual-config.yaml`: Regular lane `spacingX` changed from 32 to 42
- [ ] `visual-config.yaml`: Base lane `spacingX` changed from 42 to 54

## Research Sources

All solutions extend existing patterns in the codebase. No external research needed:
- **Label font sizing**: `LABEL_FONT_SIZE` and related constants are existing tunables in `zone-renderer.ts`.
- **Bitmap font master size**: `installLabelBitmapFonts()` already parameterizes font size — just a value change.
- **Token sizing**: `DEFAULT_TOKEN_SIZE` and `TOKEN_RADIUS` are existing constants consumed by the dimension resolution pipeline.
- **Lane spacing**: Already configurable per-zone-category in visual-config.yaml.
