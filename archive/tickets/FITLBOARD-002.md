# FITLBOARD-002: Zone Renderer Reads Visual Hints and Category

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner only
**Deps**: FITLBOARD-001 (completed)

## Problem

`zone-renderer.ts` still hardcodes all zones as 180×110 rounded rectangles with fill color based only on visibility/ownership. It does not consume `zone.visual.shape`, `zone.visual.width`, `zone.visual.height`, `zone.visual.color`, or `zone.visual.label`, so zone-level visual intent from `GameDef` is dropped at draw time.

## Assumption Reassessment

- Verified: `RenderZone` already includes `category`, `attributes`, and `visual` (completed in FITLBOARD-001), and `deriveRenderModel()` already projects these fields from `GameDef`.
- Verified: `zone-renderer.ts` currently always draws a rounded rectangle and always labels with `displayName`.
- Verified: there is existing renderer unit coverage in `packages/runner/test/canvas/renderers/zone-renderer.test.ts`, but no tests for visual-hint-driven shapes, color, or label override.
- Discrepancy fixed: `zone.category` and `zone.attributes` are currently not consumed by renderer and are not required for this ticket’s rendering behavior. Scope should focus on `zone.visual` rendering hints.
- Discrepancy fixed: the original shape dispatch was incomplete vs runtime contract. `ZoneShape` also supports `triangle` and `octagon`; the renderer should support all currently defined zone shape values to avoid silently collapsing supported schema values back to rectangle.

## What to Change

**File**: `packages/runner/src/canvas/renderers/zone-renderer.ts`

### 1. Shape and dimensions from `zone.visual`

Replace the single `roundRect` path in `drawZoneBase()` with shape dispatch using `zone.visual?.shape`, `zone.visual?.width`, and `zone.visual?.height`, with defaults to current constants when hints are absent.

```typescript
function drawZoneBase(base: Graphics, zone: RenderZone): void {
  const fill = resolveFillColor(zone);
  const stroke = resolveStroke(zone);
  const width = zone.visual?.width ?? ZONE_WIDTH;
  const height = zone.visual?.height ?? ZONE_HEIGHT;
  const shape = zone.visual?.shape ?? 'rectangle';

  base.clear();

  // switch supports all runtime ZoneShape values:
  // rectangle, circle, hexagon, diamond, ellipse, triangle, line, octagon

  base.fill({ color: fill }).stroke(stroke);
}
```

### 2. Fill color from `zone.visual.color`

Update `resolveFillColor()` to prefer `zone.visual?.color` first, with strict `#RRGGBB` parsing and fallback to existing visibility/ownership palette when missing or invalid:

```typescript
function resolveFillColor(zone: RenderZone): number {
  const visualColor = parseVisualColor(zone.visual?.color);
  if (visualColor !== null) {
    return visualColor;
  }
  // ... existing visibility/ownership fallback ...
}
```

### 3. Display name from `zone.visual.label`

In `updateZoneVisuals()`, prefer `zone.visual?.label` over `zone.displayName`:

```typescript
visuals.nameLabel.text = zone.visual?.label ?? zone.displayName;
```

### 4. Dynamic label positioning

Adjust label offsets and badge anchor based on effective zone width/height instead of fixed `ZONE_WIDTH`/`ZONE_HEIGHT` constants so text placement remains stable for non-default geometry.

### 5. Keep architecture generic and extensible

- Add small geometry helpers (e.g., regular polygon point generation + shape dispatch) instead of ad-hoc per-case math in `drawZoneBase()`.
- Keep renderer behavior data-driven via `zone.visual`; no FITL-specific branches or identifiers.

## Invariants

- `pnpm turbo build` passes
- `pnpm turbo typecheck` passes
- `pnpm turbo lint` passes
- Zones without `visual` render exactly as before (no visual regression for Texas Hold'em)
- Zones with each supported `visual.shape` value render using the matching primitive/path
- Zones with `visual.color: '#...'` use that fill color

## Tests

- **Existing**: All zone renderer tests pass unchanged (fallback behavior)
- **New test**: each supported shape (`rectangle`, `circle`, `ellipse`, `diamond`, `hexagon`, `triangle`, `octagon`, `line`) dispatches expected draw primitive/path.
- **New test**: zone with `visual: { color: '#e63946' }` produces fill color `0xe63946`.
- **New test**: invalid color string falls back to existing visibility/ownership color logic.
- **New test**: zone with `visual: { label: 'Saigon' }` overrides `displayName`.
- **New test**: label/badge positions use hinted dimensions when present.
- **New test**: zone with `visual: null` still renders default rounded rectangle (regression guard).
- `pnpm -F @ludoforge/runner test` — all tests pass

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Updated `zone-renderer.ts` to consume `zone.visual` hints for:
    - shape dispatch (`rectangle`, `circle`, `ellipse`, `diamond`, `hexagon`, `triangle`, `octagon`, `line`)
    - hinted dimensions (`width` / `height`) with safe fallback to defaults
    - label override (`visual.label`)
    - fill color override (`visual.color`) with strict `#RRGGBB` parsing and fallback palette behavior
  - Added geometry helpers for regular polygon shapes and centralized visual-dimension resolution.
  - Added dynamic label/badge/marker text positioning based on effective zone dimensions.
  - Expanded `zone-renderer` unit coverage for shape dispatch, color fallback, label override, and dimension-driven label layout.
- **Deviation vs original plan**:
  - Scope was tightened to `zone.visual` consumption; `zone.category` and `zone.attributes` were intentionally not wired into renderer behavior because they are not required for drawing semantics in this ticket.
  - Shape support was expanded to include all runtime-supported `ZoneShape` variants (`triangle`, `octagon`), not just a partial subset.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm turbo build` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
  - `pnpm turbo test` ✅
