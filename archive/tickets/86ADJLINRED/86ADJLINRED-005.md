# 86ADJLINRED-005: Hover Highlight for Dashed Adjacency Lines

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/86ADJLINRED/86ADJLINRED-003.md

## Problem

After the dashed white edge-to-edge adjacency redesign landed (86ADJLINRED-003), highlighted adjacencies still render with the same dash cadence as non-highlighted ones. The highlight data flow is correct, and the white highlighted stroke defaults are already in place. The remaining gap is that highlight state does not yet affect the dash pattern, so hover emphasis is weaker than intended.

## Assumption Reassessment (2026-03-27)

1. `packages/runner/src/config/visual-config-provider.ts` already defaults adjacency edges to white `2px` / `0.6 alpha`, and highlighted edges to white `3px` / `0.85 alpha`, before applying any `edges.highlighted` override — confirmed.
2. `packages/runner/src/canvas/renderers/adjacency-renderer.ts` already calls `resolveEdgeStyle(category, isHighlighted)` and already renders via `drawDashedLine(...)` — confirmed. The highlight data flow is intact.
3. `packages/runner/src/canvas/renderers/adjacency-renderer.ts` currently uses a single `DEFAULT_DASH_LENGTH = 6` and `DEFAULT_GAP_LENGTH = 4` for both normal and highlighted lines — confirmed. This is the behavior gap.
4. `data/games/fire-in-the-lake/visual-config.yaml` currently overrides `edges.default` only. It does not define `edges.highlighted`, so there is no FITL-specific highlight override to update.
5. Existing tests already cover the updated default/highlighted edge stroke values in `packages/runner/test/config/visual-config-provider.test.ts`, but there is no test proving highlighted dash cadence differs from the normal cadence.

## Architecture Check

1. The existing highlight plumbing is already the correct architecture: state stays in the render model and styling stays in the runner presentation layer. This ticket should not add new data flow or duplicate highlight state.
2. For this scope, dash cadence belongs in the adjacency renderer because it is specific to dashed adjacency rendering, not a general edge-stroke concern. Extending `VisualConfigProvider` just to thread two renderer-only constants would add configuration surface without a demonstrated need.
3. The more extensible long-term direction, if multiple games eventually need different dash cadences, would be to promote dash pattern into visual-config edge style schema. That is not justified yet by the current codebase, so it remains out of scope for this ticket.
4. No backwards compatibility: highlighted adjacency rendering should change directly to the new cadence and all affected tests should be updated in the same change (Foundation 9).

## What to Change

### 1. Vary Dash Parameters by Highlight State in `adjacency-renderer.ts`

`drawAdjacencyLine()` already calls `drawDashedLine()` with `dashLength` and `gapLength`. Those values should now vary by highlight state:

- **Normal**: `dashLength = 6`, `gapLength = 4`
- **Highlighted**: `dashLength = 8`, `gapLength = 3`

Implement this as explicit renderer constants keyed off `isHighlighted`, keeping the change local to adjacency rendering.

### 2. Strengthen Tests Around Highlighted Dash Rendering

Update adjacency renderer tests to prove:

1. Non-highlighted adjacencies call `drawDashedLine(..., 6, 4)`
2. Highlighted adjacencies call `drawDashedLine(..., 8, 3)`
3. Reversed-pair merge behavior still upgrades the shared rendered pair to highlighted cadence when either direction is highlighted

## Files to Touch

- `packages/runner/src/canvas/renderers/adjacency-renderer.ts` (modify — vary dash/gap by highlight state)
- `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` (modify — verify normal vs highlighted dash cadence)

## Out of Scope

- Dashed line utility (86ADJLINRED-002)
- Edge clipping logic (86ADJLINRED-003)
- Spur line rendering (86ADJLINRED-004)
- Connection route highlight behavior — this ticket only covers adjacency lines
- Adding new highlight states beyond normal/highlighted
- Changing `VisualConfigProvider` or edge-style schema
- Modifying FITL visual config unless a real override is added in the future
- Any engine changes

## Acceptance Criteria

### Tests That Must Pass

1. **Updated unit test**: `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts`
   - When `isHighlighted = false`: `drawDashedLine` is called with `dashLength=6`, `gapLength=4`
   - When `isHighlighted = true`: `drawDashedLine` is called with `dashLength=8`, `gapLength=3`
   - Reversed-pair merge still promotes the rendered pair to highlighted cadence if either input adjacency is highlighted
2. Existing unit test remains green: `packages/runner/test/config/visual-config-provider.test.ts`
   - `resolveEdgeStyle(null, true)` returns `{ color: '#ffffff', width: 3, alpha: 0.85 }`
   - `resolveEdgeStyle(null, false)` returns `{ color: '#ffffff', width: 2, alpha: 0.6 }`
3. Runner lint: `pnpm -F @ludoforge/runner lint`
4. Runner typecheck: `pnpm -F @ludoforge/runner typecheck`
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Highlighted adjacency lines are visually distinct from normal ones — brighter, thicker, tighter dash pattern
2. Highlight data flow is unchanged: `RunnerAdjacency.isHighlighted` → `PresentationAdjacencyNode.isHighlighted` → `drawAdjacencyLine()` — no new plumbing
3. Default highlight style remains white (`#ffffff`), 3px, alpha 0.85 — matching the already-landed adjacency redesign
4. Dash parameters are `6/4` for normal and `8/3` for highlighted adjacencies
5. Dash cadence remains local to the adjacency renderer for now; no new config surface is introduced without demonstrated multi-game need

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` — verify dash/gap parameters vary by highlight state and merged reversed pairs inherit highlighted cadence
2. `packages/runner/test/config/visual-config-provider.test.ts` — regression only; confirms stroke defaults already match the desired values

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner typecheck`

### Visual Verification

1. `pnpm -F @ludoforge/runner dev` → load FITL game
2. Hover a zone → confirm adjacent dashed lines become brighter, thicker, with tighter dash pattern
3. Un-hover → confirm lines return to normal style
4. Hover multiple zones in succession → confirm smooth transitions

## Outcome

- **Completion date**: 2026-03-27
- **What actually changed**:
  - Reassessed the ticket against the live runner code and narrowed scope to the real remaining gap: highlighted adjacencies were already using the correct white stroke styling, but still shared the normal dash cadence.
  - Updated `packages/runner/src/canvas/renderers/adjacency-renderer.ts` so highlighted adjacencies render with dash/gap `8/3`, while normal adjacencies remain `6/4`.
  - Strengthened `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` to prove merged highlighted pairs use the highlighted dash cadence.
- **Deviations from original plan**:
  - No `visual-config-provider.ts` change was needed because the white highlighted stroke defaults were already present.
  - No FITL `visual-config.yaml` change was needed because FITL does not currently override `edges.highlighted`.
  - No new config surface was introduced for dash cadence; the change stayed local to the adjacency renderer because that is the cleanest current architecture.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
