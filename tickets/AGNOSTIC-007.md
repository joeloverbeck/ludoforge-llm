# AGNOSTIC-007: Owner-Safe Token Stack Grouping in Runner Renderer

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Runner only
**Deps**: None

## What Needs to Change

1. Update token stack grouping key in `token-renderer` to prevent merging tokens that are visually/semantically distinct by ownership.
2. Ensure grouping dimensions align with color/interaction semantics (at minimum include `ownerID` when relevant).
3. Preserve current optimization behavior: non-selectable, non-selected compatible tokens may still stack into one container with count badge.
4. Keep container map semantics deterministic for hover/select dispatch.

## Invariants

1. Tokens that should render with different ownership semantics are never merged into the same stack.
2. Tokens that are equivalent under render semantics continue stacking.
3. Stacked token counts remain accurate after add/remove/reorder updates.
4. Selectable/selected tokens remain unstacked and individually targetable.

## Tests That Should Pass

1. `packages/runner/test/canvas/renderers/token-renderer.test.ts`
   - New case: same `zone/type/faction` but different `ownerID` do not merge when ownership affects render semantics.
   - Regression case: equivalent non-selectable tokens still merge and show count badge.
   - Regression case: handler rebinding remains correct when representative token changes.
2. `packages/runner/test/canvas/GameCanvas.test.ts`
   - New/updated case verifying hover/select target identity remains stable for stacked vs unstacked tokens.
3. `pnpm -F @ludoforge/runner test`

