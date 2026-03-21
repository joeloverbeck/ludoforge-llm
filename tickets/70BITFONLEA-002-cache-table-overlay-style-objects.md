# 70BITFONLEA-002: Cache Table Overlay Marker Style Objects

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: 70BITFONLEA-001

## Problem

In `table-overlay-renderer.ts`, `updateMarkerSlot()` (lines 83–88) reassigns `slot.label.style = { ... }` with a **new object on every update cycle**, even when no style properties have changed. Each reassignment triggers PixiJS's internal font lookup and bitmap font creation logic. Combined with the font name fix from 70BITFONLEA-001, this is the second half of eliminating the bitmap font leak: even with the correct font name, per-tick style object recreation causes unnecessary work.

## Assumption Reassessment (2026-03-21)

1. `updateMarkerSlot()` at lines 83–88 creates `slot.label.style = { fill, fontSize, fontFamily }` unconditionally — **confirmed**.
2. PixiJS BitmapText re-evaluates font lookup when `style` is reassigned (even with identical values) — **confirmed** by the growing "dynamically created N bitmap fonts" count.
3. The three style properties involved are `fill` (string), `fontSize` (number), `fontFamily` (string) — all cheaply comparable with `===`.

## Architecture Check

1. Comparing three primitive values before reassigning is cheaper than creating a new object + triggering PixiJS font lookup every tick.
2. No GameSpecDoc or GameDef boundaries are affected — this is internal renderer optimization.
3. No backwards-compatibility shims — the behavior is identical when properties do change.

## What to Change

### 1. Guard style reassignment in `updateMarkerSlot()`

**File**: `packages/runner/src/canvas/renderers/table-overlay-renderer.ts`

In `updateMarkerSlot()`, before the `slot.label.style = { ... }` assignment (lines 83–88), compare the incoming `fill`, `fontSize`, and `fontFamily` against the current `slot.label.style` properties. Only reassign if at least one property differs.

Pseudocode:
```typescript
const currentStyle = slot.label.style;
const nextFill = resolved.style.textColor;
const nextFontSize = resolved.style.fontSize;
const nextFontFamily = resolved.style.fontFamily;

if (
  currentStyle.fill !== nextFill ||
  currentStyle.fontSize !== nextFontSize ||
  currentStyle.fontFamily !== nextFontFamily
) {
  slot.label.style = {
    fill: nextFill,
    fontSize: nextFontSize,
    fontFamily: nextFontFamily,
  };
}
```

### 2. Add font leak regression test

**File**: `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts`

After canvas initialization with a game state, verify that `BitmapFontManager.install` is not called beyond the 2 pre-installed fonts during a simulated render cycle. This proves the leak is fixed end-to-end.

## Files to Touch

- `packages/runner/src/canvas/renderers/table-overlay-renderer.ts` (modify)
- `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` (modify — add new tests)

## Out of Scope

- Changing font names — that is 70BITFONLEA-001.
- Text reconciliation caching (the `textRuntime.reconcile()` path at lines 103–117) — the keyed reconciler already handles this correctly.
- Game store initialization performance — that is 70BITFONLEA-003.
- Any changes to `project-table-overlay-surface.ts`.
- Any changes to `bitmap-font-registry.ts`.
- Any engine (`packages/engine/`) changes.

## Acceptance Criteria

### Tests That Must Pass

1. **New**: Call `updateMarkerSlot()` twice with identical style properties. Assert that `slot.label.style` setter is NOT invoked on the second call (i.e., the style object reference remains unchanged).
2. **New**: Call `updateMarkerSlot()` with a changed `fill` color. Assert that `slot.label.style` IS reassigned.
3. **New**: Font leak regression — after a full render update cycle (create overlay renderer, call `update()` twice), assert `BitmapFontManager.install` was not called (beyond pre-installed fonts from registry setup).
4. **Existing**: All tests in `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` pass.
5. **Existing**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. `slot.label.style` is only reassigned when at least one of `fill`, `fontSize`, or `fontFamily` has changed.
2. Marker label text (`slot.label.text`) is still updated unconditionally — only style assignment is guarded.
3. Badge shape and color updates remain unconditional (they use `Graphics.clear()` + redraw, which is correct).
4. `pnpm turbo typecheck` and `pnpm turbo lint` pass with zero errors.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` — add "style caching" describe block:
   - "does not reassign style when properties are unchanged"
   - "reassigns style when fill changes"
   - "reassigns style when fontSize changes"
   - "reassigns style when fontFamily changes"
2. `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` — add "font leak regression" test:
   - "no dynamic font creation after overlay render cycle"

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
