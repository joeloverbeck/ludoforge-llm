# VISCONF2-004: Card Template Rendering

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner + visual config YAML
**Deps**: VISCONF2-001 (card shape rendering baseline)

## Reassessed Baseline (validated against current code/tests)

1. `cards.templates` schema is already present in `packages/runner/src/config/visual-config-types.ts`, but unused at runtime.
2. `VisualConfigProvider` currently exposes token/faction/layout/animation/variables lookups, but no card template lookup.
3. `createTokenRenderer` currently renders card-shaped tokens as rounded rectangles with optional symbol/backSymbol only; it does not render structured card fields from token properties.
4. Texas Hold'em token types are per-card IDs (`card-2S`, `card-3S`, ...), not a shared `card-standard` type.
5. Existing tests already cover baseline card shape/symbol rendering in `packages/runner/test/canvas/renderers/token-renderer.test.ts`.

## Problem

The visual config contract supports card templates, but the rendering pipeline ignores them. This leaves card tokens unable to display structured face content (`rank`, `suit`, etc.) even though token properties are available in `RenderToken.properties`.

## Scope (updated)

### 1. Extend token visual config with explicit template mapping

**File**: `packages/runner/src/config/visual-config-types.ts`

Add optional field to `TokenTypeVisualStyleSchema`:

```typescript
cardTemplate: z.string().optional()
```

Rationale: explicit mapping is robust and avoids brittle coupling to token type naming. No aliasing or fallback conventions.

### 2. Add provider methods for card templates

**File**: `packages/runner/src/config/visual-config-provider.ts`

Add:

```typescript
getCardTemplate(templateId: string): CardTemplate | null
getTokenCardTemplateId(tokenTypeId: string): string | null
```

`getTokenCardTemplateId` reads `tokenTypes[tokenTypeId].cardTemplate`.
`getCardTemplate` resolves `cards.templates[templateId]`.

### 3. Introduce dedicated card face renderer module

**File**: `packages/runner/src/canvas/renderers/card-template-renderer.ts` (new)

Create reusable card-face rendering logic:

- `drawCardContent(container, template, fields)`
- uses template layout entries to render Pixi `Text`
- supports `y`, `fontSize`, `align`, `wrap`
- ignores layout fields that are missing in `fields`
- clears/reuses prior field text nodes per update (no unbounded child growth)

### 4. Wire card template rendering into token renderer

**File**: `packages/runner/src/canvas/renderers/token-renderer.ts`

Update token rendering flow:

- when resolved token shape is `card`, resolve template via:
  `tokenType -> cardTemplate id -> template`
- if template exists, template dimensions replace default card dimensions
- render card face fields only when `faceUp === true`
- when face down, hide card face fields (back remains as today)
- when template missing or mapping missing, preserve current card rendering behavior

### 5. Add Texas Hold'em template + explicit mapping

**File**: `data/games/texas-holdem/visual-config.yaml`

Use explicit per-token-type mapping for all card token types (likely via YAML anchor/merge to avoid duplication) to one shared template, for example `poker-card`.

Add:

- `tokenTypes.card-*` entries with `shape: card` and `cardTemplate: poker-card`
- `cards.templates.poker-card` with `width`, `height`, and layout for rank/suit fields

No implicit prefix-based template lookup in runtime code.

## Invariants

1. Card tokens with no configured template mapping continue rendering exactly as current (shape + symbol/backSymbol only).
2. Card template content renders only when `faceUp === true`.
3. Missing token properties for configured fields are skipped silently.
4. Template dimensions override default card dimensions only when a template resolves.
5. FITL config (no `cards` section) remains valid and unaffected.
6. Mapping is explicit (`cardTemplate`) and deterministic; no name-based inference.

## Tests (updated)

1. **Schema**: `TokenTypeVisualStyleSchema` accepts optional `cardTemplate`.
2. **Provider**: `getTokenCardTemplateId` returns configured ID and null when unset.
3. **Provider**: `getCardTemplate` returns configured template and null when missing.
4. **Card template renderer**: creates text for mapped fields and positions by `y`.
5. **Card template renderer**: skips missing properties and supports alignment/wrap options.
6. **Token renderer**: card template dimensions override default card dimensions when mapping/template exists.
7. **Token renderer**: card template text hidden on face-down tokens and shown on face-up tokens.
8. **Config loader/schema regression**: Texas and FITL visual configs still validate.
9. **Regression**: existing token renderer/config tests continue to pass.

## Outcome

- **Completion date**: 2026-02-19
- **What actually changed**:
  - Added selector-based `cards.assignments` support to visual config schema/types.
  - Added `VisualConfigProvider.getCardTemplateForTokenType()` and `VisualConfigProvider.getCardTemplate()`.
  - Added new card face rendering module: `packages/runner/src/canvas/renderers/card-template-renderer.ts`.
  - Wired token renderer to:
    - resolve card templates through selector-based `cards.assignments`,
    - apply template width/height for card dimensions,
    - render template fields from `RenderToken.properties` only when `faceUp === true`.
  - Extended faction color provider contract/implementations to expose card-template lookups.
  - Updated Texas visual config to map all `card-*` token types through one selector assignment to shared `poker-card` template.
  - Added/updated unit tests for schema/provider/renderer behavior and card template rendering.
- **Deviation from original ticket draft**:
  - Removed implicit template-id inference and adopted selector-based template assignment for long-term clarity, lower config duplication, and deterministic behavior.
  - Corrected Texas assumptions (`card-2S`... token types instead of `card-standard`) and used an id-prefix assignment instead of 52 repeated token entries.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed (98 files, 773 tests).
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
