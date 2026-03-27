# 87ADJVIS-001: Diagnostic high-contrast adjacency line rendering test

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The 86ADJLINRED ticket series changed adjacency line styling from gray/solid to white/dashed, but the visual result appears unchanged. White (#ffffff) at 0.6 alpha on the beige game background (~#f0ebe0) composites to ~#f9f7f2 — nearly indistinguishable from the background. Before committing to production style values, we must confirm that the rendering pipeline (dashed-line drawing, PixiJS 8 `Graphics.stroke()`, edge-clipping geometry) is actually executing and producing visible output.

## Assumption Reassessment (2026-03-27)

1. `adjacency-renderer.ts` calls `drawDashedLine()` then `graphics.stroke(strokeStyle)` — confirmed at lines 143-145.
2. `resolveStrokeStyle()` correctly converts `ResolvedEdgeVisual` to `EdgeStrokeStyle` with numeric color — confirmed at lines 174-188.
3. PixiJS 8 `Graphics.stroke()` accepts `{ color: number, width: number, alpha: number }` — needs runtime verification. The `EdgeStrokeStyle` interface matches this shape, but PixiJS 8's `StrokeInput` type may expect additional fields or different property names.
4. `drawDashedPath()` uses `moveTo`/`lineTo` without calling `stroke()` internally — confirmed in `dashed-path.ts`.

## Architecture Check

1. This is a diagnostic-only change: temporarily modify hardcoded fallback constants to high-contrast values (red, thick, full opacity) to visually confirm the adjacency rendering pipeline produces output. No architectural changes.
2. All changes stay within the runner package — no engine/kernel impact. Visual Separation (Foundation 3) preserved.
3. No backwards-compatibility shims. Diagnostic values are temporary and will be replaced by 87ADJVIS-002.

## What to Change

### 1. Temporarily set high-contrast adjacency defaults

In `packages/runner/src/canvas/renderers/adjacency-renderer.ts`, change `DEFAULT_LINE_STYLE` to:

```typescript
const DEFAULT_LINE_STYLE = {
  color: 0xff0000,  // Bright red — diagnostic
  width: 5,         // Thick — clearly visible
  alpha: 1.0,       // Full opacity — no blending ambiguity
} as const;
```

### 2. Visually verify

Run `pnpm -F @ludoforge/runner dev`, open the FITL game, and observe:

- **If red thick dashed lines appear**: The rendering pipeline works. The 86ADJLINRED values (white, 2px, 0.6 alpha) were simply too subtle for the beige background. Proceed to 87ADJVIS-002.
- **If lines remain thin gray**: The rendering pipeline has a deeper issue. Investigate:
  - Whether PixiJS 8's `Graphics.stroke()` ignores the style object (test with `graphics.setStrokeStyle({ ... })` builder pattern instead)
  - Whether `graphics.clear()` properly resets the path state
  - Whether `drawDashedPath()` adds geometry to the graphics at all (add a `console.log` for dash segment count)
  - Whether the adjacency layer container has unexpected alpha/visibility overrides

### 3. Document findings

Record which hypothesis was confirmed in a code comment or commit message for 87ADJVIS-002 to reference.

## Files to Touch

- `packages/runner/src/canvas/renderers/adjacency-renderer.ts` (modify — temporary diagnostic values)

## Out of Scope

- Setting production style values (deferred to 87ADJVIS-002)
- Modifying visual-config.yaml (not needed for diagnostics)
- Fixing PixiJS API issues (if discovered, scope a follow-up or expand 87ADJVIS-002)

## Acceptance Criteria

### Tests That Must Pass

1. Adjacency renderer unit tests pass with the temporary constants (color value change doesn't affect test logic — tests mock positions/zones, not visual output).
2. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No engine/kernel files modified.
2. The adjacency renderer continues to use `VisualConfigProvider.resolveEdgeStyle()` for category/highlight resolution — only the fallback constants change.

## Test Plan

### New/Modified Tests

1. No new tests — this is a diagnostic change. Visual verification is manual.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner dev` — visual inspection
