# 87ADJVIS-001: Align Adjacency Edge Defaults with Visual Config and Prove Style Resolution

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The original ticket assumed the adjacency restyle from the 86ADJLINRED series had not materially taken effect and proposed temporarily changing renderer fallback constants to bright red for diagnosis. That assumption does not match the current codebase.

The runner already renders adjacencies as dashed, edge-clipped lines, and `VisualConfigProvider` already defaults edge styling to white. The real architectural gap is smaller and more important: adjacency edge defaults are duplicated in two places (`VisualConfigProvider` and `adjacency-renderer.ts`), and the renderer's copy is only used when color parsing fails. That duplication is brittle. If edge defaults change again, the provider and renderer can silently drift.

Before touching live styling again, we should make the default/fallback path single-sourced and add proof tests that cover both the real FITL config and the renderer fallback path.

## Assumption Reassessment (2026-03-27)

1. `packages/runner/src/canvas/renderers/adjacency-renderer.ts` already draws dashed, edge-clipped adjacency lines via `drawDashedLine(...)` followed by `graphics.stroke(...)` — confirmed.
2. `packages/runner/src/config/visual-config-provider.ts` already defaults edge styles to white `#ffffff`, width `2`, alpha `0.6`, and highlighted edges to white `#ffffff`, width `3`, alpha `0.85` — confirmed.
3. `data/games/fire-in-the-lake/visual-config.yaml` already overrides `edges.default` to the same white `2 / 0.6` values, and also defines `edges.categoryStyles.loc.color = "#8b7355"` — confirmed.
4. The original proposal to change `DEFAULT_LINE_STYLE` in `adjacency-renderer.ts` would **not** reliably diagnose FITL rendering. The renderer uses `visualConfigProvider.resolveEdgeStyle(...)` first, and the hardcoded numeric fallback is only used if the resolved color string cannot be parsed.
5. The ticket's claimed `dashed-path.ts` location was stale. The current file is `packages/runner/src/canvas/geometry/dashed-path.ts`.
6. There is already good unit coverage for adjacency stroke selection under normal configs, but there is no targeted test proving the invalid-color fallback path, and no real-FITL test that locks edge-style expectations to the checked-in visual config.

## Architecture Check

1. A temporary renderer-code diagnostic is not better than the current architecture. Styling belongs in `VisualConfigProvider` and `visual-config.yaml` (Foundation 3: Visual Separation), not in ad hoc renderer constants that must later be reverted.
2. The cleaner long-term architecture is to keep edge defaults single-sourced and have the renderer consume that source for parse fallbacks instead of duplicating visual defaults locally.
3. Proof should come from automated tests, not from a temporary visual hack. If a future styling change is needed, it should happen in visual config or in the shared edge-style defaults, with tests updated in the same change.
4. No backwards compatibility or aliasing. Remove duplication directly rather than preserving parallel "provider defaults" and "renderer defaults" that can diverge.

## What to Change

### 1. Single-source Adjacency Edge Defaults

Refactor the runner so the default and highlighted adjacency edge values are defined in one place and reused by both:

- `VisualConfigProvider.resolveEdgeStyle(...)`
- `adjacency-renderer.ts` color-parse fallback path

The fallback semantics should stay the same:

- valid resolved color string → parsed numeric color is used
- invalid/unparseable resolved color string → fall back to the shared default numeric color for the current highlight state
- resolved width/alpha are still honored

### 2. Add Proof Tests for the Real and Fallback Paths

Strengthen tests to cover the assumptions that were previously only guessed:

1. Real FITL visual config resolves the expected adjacency edge styles:
   - default edge: white `#ffffff`, width `2`, alpha `0.6`
   - `loc` category edge: brown `#8b7355`, width `2`, alpha `0.6`
2. The adjacency renderer falls back to the shared default numeric color when `resolveEdgeStyle(...)` returns an invalid color string, while preserving width/alpha.
3. Highlighted invalid-color fallback uses the highlighted shared default color, not the normal one.

## Files to Touch

- `packages/runner/src/config/visual-config-provider.ts`
- `packages/runner/src/canvas/renderers/adjacency-renderer.ts`
- `packages/runner/test/config/visual-config-provider.test.ts`
- `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts`

## Out of Scope

- Temporary diagnostic colors in renderer code
- FITL visual restyling beyond what is already in `visual-config.yaml`
- Manual `console.log` instrumentation
- PixiJS API rewrites unless the tests expose a real incompatibility
- Connection route styling changes
- Engine/kernel changes

## Acceptance Criteria

### Tests That Must Pass

1. Updated unit test: `packages/runner/test/config/visual-config-provider.test.ts`
   - proves real FITL edge-style resolution for default and `loc` category edges
2. Updated unit test: `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts`
   - proves invalid-color fallback uses the shared default numeric color for normal and highlighted states while preserving width/alpha
3. Runner tests: `pnpm -F @ludoforge/runner test`
4. Runner lint: `pnpm -F @ludoforge/runner lint`
5. Runner typecheck: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Adjacency edge defaults are defined in one place, not duplicated across provider and renderer.
2. Visual styling remains in runner presentation/config layers; no game-specific logic is introduced.
3. Invalid visual-config colors degrade safely to the shared default numeric edge color.
4. FITL edge-style expectations are locked by automated tests.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-provider.test.ts`
   Verify the real FITL visual config resolves the expected default and `loc` edge styles.
2. `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts`
   Verify invalid resolved colors fall back to the shared normal/highlighted numeric colors while preserving resolved width/alpha.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-27
- What actually changed:
  - Corrected the ticket assumptions before implementation to match the current runner architecture and FITL visual config.
  - Replaced duplicated adjacency edge defaults with shared defaults exported from `VisualConfigProvider` and reused by the adjacency renderer fallback path.
  - Added proof tests for real FITL edge-style resolution and for invalid-color fallback behavior in normal and highlighted adjacency rendering.
- Deviations from original plan:
  - Did **not** add temporary diagnostic colors to `adjacency-renderer.ts`.
  - Did **not** modify FITL styling values in `visual-config.yaml`.
  - Treated the problem as an architectural drift/coverage issue rather than a manual visual-debug ticket, because the renderer pipeline and white defaults were already in place.
- Verification results:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
