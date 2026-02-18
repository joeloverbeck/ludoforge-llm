# REACTUI-016: TooltipLayer
**Status**: ✅ COMPLETED

**Spec**: 39 (React DOM UI Layer) — Deliverable D19
**Priority**: P2
**Depends on**: REACTUI-003
**Estimated complexity**: M

---

## Summary

Create `TooltipLayer` to anchor DOM tooltips to hovered PixiJS zone/token sprites using Floating UI virtual elements and the existing coordinate bridge.

---

## Reassessed Assumptions (2026-02-18)

- `UIOverlay` is a structural shell; floating feature composition is handled in `GameContainer` (`WarningsToast`, `PlayerHandPanel`).
- `GameCanvas` already emits `onCoordinateBridgeReady`, but no hover event pipeline currently exists from canvas interactions to React UI.
- `coordinate-bridge.ts` exposes `canvasToScreen()` and `worldBoundsToScreenRect()` (not `worldToScreen()`).
- Canvas interaction handlers currently use `pointerover`/`pointerout` only for cursor state; they do not report hovered entities.
- `renderModel` contains zones/tokens data, but tooltip anchor geometry must come from canvas runtime sprite bounds, not guessed in UI.

### Scope corrections

- Mount `TooltipLayer` via `GameContainer` floating composition, not by hardcoding feature logic into `UIOverlay`.
- Add a minimal, generic hover bridge from canvas interactions to `GameContainer` local state.
- Keep hover state out of Zustand global store (ephemeral UI concern).

### Architectural rationale

- This is cleaner and more extensible than storing hover in global state: tooltip behavior remains UI-local, avoids extra store churn, and preserves clear separation between game state and transient pointer state.
- Using sprite bounds from canvas runtime + coordinate bridge is more robust than manual positioning constants and remains renderer-agnostic.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/TooltipLayer.tsx` | Floating UI tooltips anchored to hovered canvas entities |
| `packages/runner/src/ui/TooltipLayer.module.css` | Tooltip styling |
| `packages/runner/test/ui/TooltipLayer.test.ts` | Tooltip rendering/positioning contract tests |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/GameContainer.tsx` | Manage canvas hover + coordinate bridge state, compose `TooltipLayer` in floating region |
| `packages/runner/src/canvas/GameCanvas.tsx` | Expose hover events and hovered-entity world bounds resolver callbacks |
| `packages/runner/src/canvas/interactions/zone-select.ts` | Emit hover enter/leave callbacks alongside existing selection behavior |
| `packages/runner/src/canvas/interactions/token-select.ts` | Emit hover enter/leave callbacks alongside existing selection behavior |
| `packages/runner/test/canvas/interactions/zone-select.test.ts` | Add hover-callback behavior tests |
| `packages/runner/test/canvas/interactions/token-select.test.ts` | Add hover-callback behavior tests |
| `packages/runner/test/canvas/GameCanvas.test.ts` | Verify hover-bridge wiring and lifecycle cleanup |
| `packages/runner/test/ui/GameContainer.test.ts` | Verify `TooltipLayer` composition/wiring |
| `packages/runner/package.json` | Add `@floating-ui/react-dom` dependency |

---

## Detailed Requirements

- **Dependency**: add `@floating-ui/react-dom` in runner dependencies.
- **Store data** (`TooltipLayer`): read `renderModel.zones` and `renderModel.tokens` via Zustand selectors.
- **Canvas integration**:
  - `GameCanvas` emits hovered target events (`zone`/`token` IDs).
  - `GameCanvas` provides a resolver that returns hovered entity world bounds.
  - `GameContainer` converts world bounds to screen rect using `CoordinateBridge.worldBoundsToScreenRect()`.
- **Virtual Element pattern**:
  - `TooltipLayer` builds a Floating UI virtual element with `getBoundingClientRect()` from current screen rect.
  - Positioning uses Floating UI middleware: `offset()`, `flip()`, `shift()`.
- **Tooltip triggers**:
  - Show when a hovered zone/token is reported.
  - Hide on hover leave and when hover target changes to null.
- **Tooltip content**:
  - Zone: `displayName`, token count, visibility, marker summary.
  - Token: `type`, `ownerID`, `faceUp`, generic property key/value rows.
- **Interaction**:
  - Tooltip element uses `pointer-events: auto` to allow text selection.

---

## Out of Scope

- Adding game-specific tooltip fields or formatting rules.
- Tooltip support for non-canvas DOM elements.
- Animated tooltip transitions (Spec 40).
- Mobile touch-and-hold tooltip behavior.
- Refactoring renderer visual styles unrelated to tooltip anchoring.

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/TooltipLayer.test.ts` | Returns null when hover target is null |
| `packages/runner/test/ui/TooltipLayer.test.ts` | Renders zone details for hovered zone target |
| `packages/runner/test/ui/TooltipLayer.test.ts` | Renders token details for hovered token target |
| `packages/runner/test/ui/TooltipLayer.test.ts` | Uses Floating UI middleware configuration |
| `packages/runner/test/ui/TooltipLayer.test.ts` | Repositions from updated anchor rect |
| `packages/runner/test/canvas/interactions/zone-select.test.ts` | Emits hover enter/leave callbacks |
| `packages/runner/test/canvas/interactions/token-select.test.ts` | Emits hover enter/leave callbacks |
| `packages/runner/test/canvas/GameCanvas.test.ts` | Forwards hover target updates to callback and clears on destroy |
| `packages/runner/test/ui/GameContainer.test.ts` | Composes `TooltipLayer` in floating region with hover/bridge-derived anchor data |

### Invariants

- Uses Zustand selectors for RenderModel data.
- Uses the existing coordinate bridge API (`worldBoundsToScreenRect`) for screen-space anchoring.
- Floating UI is the only tooltip positioning library.
- No game-specific logic in tooltip rendering.
- Canvas selection behavior remains unchanged.
- Hover state is local UI/canvas plumbing; no global store contract expansion.
- `@floating-ui/react-dom` is a runtime dependency.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added `packages/runner/src/ui/TooltipLayer.tsx` and `packages/runner/src/ui/TooltipLayer.module.css` with Floating UI virtual-element anchoring, zone/token tooltip content, and pointer-active tooltip interaction.
  - Extended `packages/runner/src/canvas/GameCanvas.tsx` with hover-target and hover-bounds callbacks, reusing runtime sprite bounds and the existing coordinate bridge.
  - Extended canvas interaction handlers in `packages/runner/src/canvas/interactions/zone-select.ts` and `packages/runner/src/canvas/interactions/token-select.ts` to emit hover enter/leave signals without changing selection dispatch behavior.
  - Updated `packages/runner/src/ui/GameContainer.tsx` to compose `TooltipLayer` in floating content, deriving screen anchor rect from `worldBoundsToScreenRect`.
  - Added `@floating-ui/react-dom` in `packages/runner/package.json`.
  - Added/updated tests across UI and canvas integration points.
- **Deviations from original plan**:
  - Integration point was corrected from `UIOverlay` to `GameContainer` floating composition to preserve overlay-shell architecture.
  - Tooltip anchoring uses `worldBoundsToScreenRect` instead of a non-existent `worldToScreen` API.
  - Scope explicitly included new canvas hover plumbing because no hover-to-UI contract previously existed.
- **Verification**:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm turbo test`
  - `pnpm turbo lint`
