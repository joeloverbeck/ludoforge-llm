# LEGACTTOO-022: Display Node Renderer Isolation and Exhaustive Type Guard

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/LEGACTTOO-009-runner-ui-progressive-disclosure-tooltip.md

## Problem

`display-node-renderers.tsx` has two issues that reduce its robustness and reusability:

1. **CSS coupling**: It imports `ActionTooltip.module.css` for all its styling (`group`, `groupLabel`, `line`, `keyword`, `operator`, `value`, `reference`, `punctuation`, `annotation*`). This couples the generic renderer to the tooltip's stylesheet. If these renderers are reused outside the tooltip (e.g., in a detail inspector panel or debug view), they drag along tooltip-specific CSS.

2. **Unsafe type cast**: `renderNode` handles `group` and `line` kinds explicitly, then falls through with `node as DisplayInlineNode` (line 60). If a new `DisplayNode` variant is added to the engine, the cast silently coerces it to `DisplayInlineNode` instead of producing a compile-time error. An exhaustive check would catch this at build time.

## Assumption Reassessment (2026-03-07)

1. `display-node-renderers.tsx` at line 9 imports `styles from './ActionTooltip.module.css'`. **Confirmed in worktree source.**
2. `renderNode` default branch at line 60 uses `node as DisplayInlineNode`. **Confirmed in worktree source.**
3. `DisplayNode` union is `DisplayGroupNode | DisplayLineNode | DisplayInlineNode` defined in `packages/engine/src/kernel/display-node.ts`. **Confirmed — three variants.**
4. Existing runner tests (`ActionTooltip.test.ts`, `RawAstToggle.test.ts`) cover rendered output paths but do not explicitly enforce renderer stylesheet ownership boundaries. **Confirmed in test source.**

## Architecture Check

1. Extracting renderer styles into a dedicated CSS module follows the "many small files" convention and keeps the renderer reusable across UI contexts without pulling in tooltip-specific class names.
2. An exhaustive type guard is a zero-cost compile-time safety net and catches future `DisplayNode` variants at build time.
3. No game-specific logic; purely runner UI infrastructure.
4. Scope is a refactor only: preserve rendered content and semantics while reducing coupling.

## What to Change

### 1. Extract renderer CSS into `DisplayNodeRenderers.module.css`

Move the style classes used by `display-node-renderers.tsx` (`group`, `groupLabel`, `line`, `keyword`, `operator`, `value`, `reference`, `punctuation`, `annotation`, `annotationPass`, `annotationFail`, `annotationValue`, `annotationUsage`) from `ActionTooltip.module.css` into a new `DisplayNodeRenderers.module.css`. Update the import in `display-node-renderers.tsx`. Remove the moved classes from `ActionTooltip.module.css`.

### 2. Add exhaustive type guard in `renderNode`

Replace the unsafe cast with a compile-time exhaustive check:

```typescript
default: {
  const exhaustive: DisplayInlineNode = node;
  return renderInlineNode(exhaustive, key);
}
```

This ensures that if a new `DisplayNode` kind is added without updating `renderNode`, the TypeScript compiler emits an error rather than silently falling through.

### 3. Update `RawAstToggle` import if affected

`RawAstToggle.tsx` imports `renderGroup` from `display-node-renderers.tsx`. Verify it does not directly reference `ActionTooltip.module.css` classes — it uses its own CSS module, so no change expected.

## Files to Touch

- `packages/runner/src/ui/DisplayNodeRenderers.module.css` (new — extracted styles)
- `packages/runner/src/ui/display-node-renderers.tsx` (modify — import new CSS module, add exhaustive guard)
- `packages/runner/src/ui/ActionTooltip.module.css` (modify — remove migrated classes)

## Out of Scope

- Renderer functionality changes (rendering logic stays identical)
- Adding new `DisplayNode` variants (this ticket just adds the safety net)
- Accessibility improvements for rendered nodes

## Acceptance Criteria

### Tests That Must Pass

1. Existing `ActionTooltip.test.ts` passes — rendered output unchanged.
2. Existing `RawAstToggle.test.ts` passes — no import breakage.
3. `pnpm -F @ludoforge/runner typecheck` passes — exhaustive guard compiles.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Rendered HTML output is identical before and after — pure refactor.
2. No class name collisions between `DisplayNodeRenderers.module.css` and `ActionTooltip.module.css`.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/RawAstToggle.test.ts` (modified comment) — remove stale note implying renderer depends on `ActionTooltip.module.css`.
2. No new behavioral tests required; existing tooltip/raw-AST rendering tests already validate output parity.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-07
- What changed:
  - Added `packages/runner/src/ui/DisplayNodeRenderers.module.css` and moved renderer-specific classes out of `ActionTooltip.module.css`.
  - Updated `packages/runner/src/ui/display-node-renderers.tsx` to import `DisplayNodeRenderers.module.css`.
  - Replaced unsafe `node as DisplayInlineNode` cast with exhaustive inline assignment in `renderNode`.
  - Updated runner CSS contract test to assert wrapping in `DisplayNodeRenderers.module.css`.
  - Updated stale comment in `RawAstToggle.test.ts` to reflect decoupled renderer styling.
- Deviations from original plan:
  - Added one additional test update (`ActionTooltip.test.ts`) to reflect new CSS ownership; behavior remained unchanged.
- Verification results:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
