# VISCONF2-002: Remove Auto-Generated Labels and Add Symbol Icons

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Schema addition (`backSymbol` on token type) — runner + visual config YAML
**Deps**: VISCONF2-001 (depends on shape dispatch being in place)

## Problem

Token labels are auto-generated from token type IDs by `toTokenLabel()` at `packages/runner/src/canvas/renderers/token-renderer.ts:447-450`:

```typescript
function toTokenLabel(type: string): string {
  const base = type.split('-').pop() ?? type;
  return base.slice(0, 3).toUpperCase();
}
```

This produces unwanted text like "TRO", "BAS", "GUE" etc. overlaid on tokens. In the FITL map, tokens should display **symbol icons** (star, diamond, cross, circle-dot) — not truncated type name strings.

Additionally, `tokenLabel()` (line 369-375) and `tokenBackLabel()` (line 377-384) use PixiJS `Text` elements. For small symbols at token scale, `Graphics`-based drawing is cleaner and more scalable than text rendering.

The visual config schema already has `symbol: string` on `TokenTypeVisualStyleSchema` (line 87), but there is no `backSymbol` field for face-down state.

## What to Change

### 1. Delete label generation functions

**File**: `packages/runner/src/canvas/renderers/token-renderer.ts`

- Delete `toTokenLabel()` (line 447-450)
- Delete `tokenLabel()` (line 369-375)
- Delete `tokenBackLabel()` (line 377-384)

### 2. Replace Text elements with Graphics in `createTokenVisualElements()`

**File**: `packages/runner/src/canvas/renderers/token-renderer.ts`

In `createTokenVisualElements()` (line 191-241):
- Remove `frontLabel` Text element (lines 195-206)
- Remove `backLabel` Text element (lines 208-219)
- Replace both with `frontSymbol: Graphics` and `backSymbol: Graphics` elements
- Update `TokenVisualElements` interface (line 38-44) to match
- Keep `countBadge` Text as-is (it shows stack count, not token identity)

### 3. New module: `packages/runner/src/canvas/renderers/token-symbol-drawer.ts`

Create a Graphics-based symbol drawing module:

- Export `drawTokenSymbol(graphics, symbolId, size, color)` function
- Symbol registry with these symbols:
  - `star` — 5-pointed star polygon (used by FITL irregulars/guerrillas)
  - `diamond` — rotated square
  - `cross` — plus-sign shape
  - `circle-dot` — circle with center dot
  - `none` / empty — no symbol drawn
- Each symbol is drawn centered at (0, 0) within the given size bounds
- Symbol color defaults to white (`0xf8fafc`) for contrast on colored token fills

### 4. Add `backSymbol` to schema

**File**: `packages/runner/src/config/visual-config-types.ts`

In `TokenTypeVisualStyleSchema` (line 83-88):
```typescript
const TokenTypeVisualStyleSchema = z.object({
  shape: TokenShapeSchema.optional(),
  color: z.string().optional(),
  size: z.number().optional(),
  symbol: z.string().optional(),
  backSymbol: z.string().optional(),  // NEW
});
```

**File**: `packages/runner/src/config/visual-config-provider.ts`

In `ResolvedTokenVisual` interface (line 28-33) and `getTokenTypeVisual()` (line 85-94):
- Add `backSymbol: string | null` field

### 5. Wire symbols into `updateTokenVisuals()`

**File**: `packages/runner/src/canvas/renderers/token-renderer.ts`

In `updateTokenVisuals()` (line 243-271):
- When `faceUp === true`: draw `tokenVisual.symbol` into `frontSymbol` Graphics (if non-null)
- When `faceUp === false`: draw `tokenVisual.backSymbol` into `backSymbol` Graphics (if non-null); if `backSymbol` is null, draw nothing (blank back)
- Remove text assignment lines (265-266)

### 6. No changes to FITL YAML

The FITL `visual-config.yaml` already specifies `symbol: star` for irregulars/guerrillas. No `backSymbol` is needed for FITL tokens (they don't have face-down symbols).

## Invariants

1. No `Text` elements exist in the token visual hierarchy except `countBadge`.
2. `toTokenLabel()` function must not exist anywhere in the codebase.
3. Symbol rendering uses only `Graphics` calls — no font dependencies.
4. When `symbol` is null/undefined, the front face shows no symbol (just the shape + fill).
5. When `backSymbol` is null/undefined, the back face shows no symbol.
6. `backSymbol` is optional and backward-compatible (existing YAML without it still parses).
7. Symbol drawing is size-proportional — symbols scale with token `size` parameter.

## Tests

1. **Unit — symbol registry completeness**: Every declared symbol ID (`star`, `diamond`, `cross`, `circle-dot`) has a registered draw function.
2. **Unit — drawTokenSymbol smoke test**: For each symbol, call with mock Graphics and verify draw calls execute without throwing.
3. **Unit — star symbol geometry**: Mock Graphics, draw `star`, verify `poly()` called with 10 points (5-pointed star = 10 vertices).
4. **Unit — no symbol when null**: Call `drawTokenSymbol()` with `null`/`undefined`, verify no draw calls on Graphics.
5. **Unit — backSymbol schema parsing**: Parse a `TokenTypeVisualStyleSchema` with `backSymbol: "diamond"`, verify it's included in output.
6. **Unit — backSymbol schema optional**: Parse a `TokenTypeVisualStyleSchema` without `backSymbol`, verify it defaults to `undefined`.
7. **Unit — ResolvedTokenVisual includes backSymbol**: Call `getTokenTypeVisual()` with a config that has `backSymbol`, verify the resolved object contains it.
8. **Integration — FITL tokens have no Text children**: After rendering FITL tokens, verify no child of any token container is a `Text` instance (except countBadge).
9. **Regression**: Existing token renderer and visual config tests still pass.
