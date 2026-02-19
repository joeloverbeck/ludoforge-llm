# VISCONF2-004: Card Template Rendering

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner + visual config YAML
**Deps**: VISCONF2-001 (card shape must be wired before templates are rendered on top)

## Problem

The visual config schema defines card templates at `packages/runner/src/config/visual-config-types.ts:112-127`:

```typescript
const CardFieldLayoutSchema = z.object({
  y: z.number().optional(),
  fontSize: z.number().optional(),
  align: z.string().optional(),
  wrap: z.number().optional(),
});

const CardTemplateSchema = z.object({
  width: z.number(),
  height: z.number(),
  layout: z.record(z.string(), CardFieldLayoutSchema).optional(),
});

const CardsConfigSchema = z.object({
  templates: z.record(z.string(), CardTemplateSchema).optional(),
});
```

This schema is declared but **never consumed** by the token renderer. Card-shaped tokens render as blank colored rectangles with no structured field display.

The `VisualConfigProvider` has no method to retrieve card templates. The token renderer's `drawTokenBase()` draws a plain `roundRect` for card shape with no content areas.

## What to Change

### 1. Add card template resolution to provider

**File**: `packages/runner/src/config/visual-config-provider.ts`

Add method:
```typescript
getCardTemplate(templateId: string): CardTemplate | null
```

Where `templateId` maps to `config.cards.templates[templateId]`.

### 2. New module: `packages/runner/src/canvas/renderers/card-template-renderer.ts`

Create a card content rendering module:

- Export `drawCardContent(container, template, fields, dimensions)` function
- `template: CardTemplate` — the layout spec from visual config
- `fields: Record<string, string>` — key-value pairs from token properties to display
- For each field in `template.layout`:
  - Create a PixiJS `Text` element positioned at the layout's `y` offset
  - Apply `fontSize`, `align`, and `wrap` from the field layout
  - Text content comes from `fields[fieldName]`
- Fields not in `template.layout` are not displayed
- Card dimensions come from template `width`/`height`, overriding the default card dimensions

### 3. Wire into token renderer

**File**: `packages/runner/src/canvas/renderers/token-renderer.ts`

In `updateTokenVisuals()`:
- When shape is `card` and a matching card template exists for the token type:
  - Use template dimensions instead of default `CARD_WIDTH`/`CARD_HEIGHT`
  - After drawing the base shape, call `drawCardContent()` with token properties
- When `faceUp === false`, do not render card content (show card back only)
- Token properties (`token.properties` from `RenderToken`) provide the field values

### 4. Map token type to card template

Convention: the card template ID matches the token type ID. If `tokenTypes.card-standard` has `shape: card`, look up `cards.templates.card-standard`.

Alternatively, add an optional `cardTemplate: string` field to `TokenTypeVisualStyleSchema` for explicit mapping.

### 5. Add card templates to Texas Hold'em visual config

**File**: `data/games/texas-holdem/visual-config.yaml`

Add:
```yaml
tokenTypes:
  card-standard:
    shape: card
    color: "#1f2937"

cards:
  templates:
    card-standard:
      width: 48
      height: 68
      layout:
        rank:
          y: 8
          fontSize: 14
          align: center
        suit:
          y: 36
          fontSize: 18
          align: center
```

## Invariants

1. Card-shaped tokens without a matching template render identically to current behavior (plain colored rectangle).
2. Card content is only displayed when `faceUp === true`.
3. Field layout positions are relative to the card's top-left corner.
4. Missing fields in token properties are silently skipped (no error, no placeholder).
5. Template dimensions override default `CARD_WIDTH`/`CARD_HEIGHT` for that token type.
6. Existing FITL visual config (which has no `cards` section) must continue to parse and render.

## Tests

1. **Unit — getCardTemplate returns template**: Configure a provider with `cards.templates.card-standard`, verify `getCardTemplate('card-standard')` returns the template.
2. **Unit — getCardTemplate returns null for missing**: Verify `getCardTemplate('nonexistent')` returns `null`.
3. **Unit — drawCardContent creates Text elements**: Mock container, call with template containing 2 fields, verify 2 Text children added.
4. **Unit — drawCardContent positions fields at correct y**: Template with `rank.y: 8` and `suit.y: 36`, verify Text elements positioned accordingly.
5. **Unit — drawCardContent skips missing properties**: Template has field `rank` but token properties lack `rank`, verify no Text element for that field.
6. **Unit — card template dimensions override defaults**: Token with `shape: card` and matching template `width: 48, height: 68`, verify rendered dimensions are 48x68 not default 24x34.
7. **Integration — Texas Hold'em visual config loads**: Load Texas Hold'em visual config YAML with `cards` section, verify it parses without errors.
8. **Regression**: Existing token renderer and visual config tests still pass.
