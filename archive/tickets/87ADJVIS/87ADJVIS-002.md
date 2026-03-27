# 87ADJVIS-002: Set production adjacency line values for visual prominence

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/87ADJVIS/87ADJVIS-001.md

## Problem

Adjacency lines must be visually prominent — dashed white lines that rival road/river connectors (4px, 0.85 alpha) in width and visibility. The current values (white, 2px, 0.6 alpha, 6/4 dash) produce near-invisible lines on the beige game background. Additionally, the FITL `visual-config.yaml` contains an unused `categoryStyles.loc` entry that doesn't match any zone category ("city" and "province" are the actual FITL zone categories).

## Assumption Reassessment (2026-03-27)

1. `adjacency-renderer.ts` no longer owns separate hardcoded edge-style defaults. It uses shared defaults exported from `visual-config-provider.ts` for invalid-color fallback, while still preserving resolved width/alpha.
2. `visual-config-provider.ts` now owns the shared default and highlighted adjacency edge values, then layers `edges.default`, `categoryStyles[category]`, and `highlighted` overrides.
3. `visual-config.yaml` `edges.default` currently specifies `color: "#ffffff"`, `width: 2`, `alpha: 0.6`.
4. `categoryStyles.loc` has `color: "#8b7355"`, `width: 2` — but no FITL zone has category `loc`. Zone categories are "city" and "province" (confirmed in `fitl-game-def.json`). This entry is dead config.
5. Road/river connectors use `DEFAULT_ROUTE_STROKE` at `{ color: 0x6b7280, width: 4, alpha: 0.85 }` in `connection-route-renderer.ts` — the target visual weight to rival.

## Architecture Check

1. Styling stays in `visual-config.yaml` consumed through `VisualConfigProvider` (Foundation 3). Shared defaults should be updated in one place so provider resolution and renderer fallback remain aligned for games without a visual config.
2. No game-specific logic introduced. The renderer remains agnostic — it resolves styles through the generic `resolveEdgeStyle()` API.
3. Removing unused `categoryStyles.loc` aligns with Foundation 9 (no backwards-compat shims for dead config).

## What to Change

### 1. Update shared adjacency edge defaults

In `packages/runner/src/config/visual-config-provider.ts`:

```typescript
export const DEFAULT_EDGE_STYLE = {
  color: '#ffffff',
  width: 3.5,   // was 2 — now rivals connection routes (4px)
  alpha: 0.85,  // was 0.6 — matches connection route opacity
} as const;

export const HIGHLIGHTED_EDGE_STYLE = {
  color: '#ffffff',
  width: 4.5,   // was 3
  alpha: 1.0,   // was 0.85
} as const;
```

### 2. Update adjacency renderer dash cadence

In `packages/runner/src/canvas/renderers/adjacency-renderer.ts`:

```typescript
const DEFAULT_DASH_LENGTH = 10;      // was 6 — larger, clearly visible dashes
const DEFAULT_GAP_LENGTH = 5;        // was 4
const HIGHLIGHTED_DASH_LENGTH = 12;  // was 8
const HIGHLIGHTED_GAP_LENGTH = 4;    // was 3
```

### 3. Update FITL visual-config.yaml

In `data/games/fire-in-the-lake/visual-config.yaml`:

```yaml
edges:
  default:
    color: "#ffffff"
    width: 3.5
    alpha: 0.85
```

Remove the unused `categoryStyles` block:

```yaml
# REMOVE:
  categoryStyles:
    loc:
      color: "#8b7355"
      width: 2
```

### 4. Update adjacency renderer unit tests

Update test expectations that reference the old default values (width 2, alpha 0.6) to the new values (width 3.5, alpha 0.85).

## Files to Touch

- `packages/runner/src/config/visual-config-provider.ts` (modify)
- `packages/runner/src/canvas/renderers/adjacency-renderer.ts` (modify)
- `data/games/fire-in-the-lake/visual-config.yaml` (modify)
- `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` (modify)
- `packages/runner/test/config/visual-config-provider.test.ts` (modify)

## Out of Scope

- Connection route styling (already at desired visual weight)
- Adding new `categoryStyles` entries for "city" or "province" (unnecessary — default style applies to all adjacency edges equally)
- Highlighted adjacency line behavior beyond the updated highlighted defaults and dash cadence

## Acceptance Criteria

### Tests That Must Pass

1. Adjacency renderer resolves default stroke with width 3.5 and alpha 0.85.
2. Adjacency renderer resolves highlighted stroke with width 4.5 and alpha 1.0.
3. Visual-config-provider `resolveEdgeStyle(null, false)` returns `{ color: '#ffffff', width: 3.5, alpha: 0.85 }`.
4. Visual-config-provider `resolveEdgeStyle(null, true)` returns `{ color: '#ffffff', width: 4.5, alpha: 1.0 }`.
5. Default dash pattern uses 10/5 segment lengths.
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No engine/kernel files modified.
2. `VisualConfigProvider.resolveEdgeStyle()` API shape unchanged — only default values updated.
3. Visual-config.yaml `edges` schema shape unchanged — only values updated.
4. No game-specific logic in the renderer.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` — update expected default/highlighted width and alpha values
2. `packages/runner/test/config/visual-config-provider.test.ts` — update expected edge style defaults

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner dev` — visual verification: adjacency lines should appear as clearly visible white dashed lines, comparable in weight to road/river connectors

## Outcome

- **Completion date**: 2026-03-27
- **What changed**:
  - `visual-config-provider.ts`: `DEFAULT_EDGE_STYLE` width 2→3.5, alpha 0.6→0.85; `HIGHLIGHTED_EDGE_STYLE` width 3→4.5, alpha 0.85→1.0
  - `adjacency-renderer.ts`: dash cadence 6/4→10/5 (default), 8/3→12/4 (highlighted)
  - `visual-config.yaml`: edge defaults updated, dead `categoryStyles.loc` removed
  - `adjacency-renderer.test.ts`: updated dash and stroke expectations
  - `visual-config-provider.test.ts`: updated edge style default expectations
  - `visual-config-files.test.ts`: updated FITL YAML assertions, removed `categoryStyles.loc` assertion
- **Deviations**: None — implemented as specified
- **Verification**: 2016/2016 runner tests pass, typecheck clean, lint clean
