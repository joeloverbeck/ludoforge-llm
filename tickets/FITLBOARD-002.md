# FITLBOARD-002: Zone Renderer Reads Visual Hints and Category

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner only
**Deps**: FITLBOARD-001

## Problem

`zone-renderer.ts` hardcodes all zones as 180×110 rounded rectangles with fill color based solely on visibility/ownership flags (`resolveFillColor` at line 191). It never reads `zone.category`, `zone.attributes`, or `zone.visual`. Cities, provinces, and LoCs all look identical.

## What to Change

**File**: `packages/runner/src/canvas/renderers/zone-renderer.ts`

### 1. Shape from `zone.visual`

Replace the single `roundRect` call in `drawZoneBase()` (~line 186) with shape dispatch:

```typescript
function drawZoneBase(base: Graphics, zone: RenderZone): void {
  const fill = resolveFillColor(zone);
  const stroke = resolveStroke(zone);
  const width = zone.visual?.width ?? ZONE_WIDTH;
  const height = zone.visual?.height ?? ZONE_HEIGHT;
  const shape = zone.visual?.shape ?? 'rectangle';

  base.clear();

  switch (shape) {
    case 'circle':
    case 'ellipse':
      base.ellipse(0, 0, width / 2, height / 2);
      break;
    case 'diamond':
      base.poly([0, -height / 2, width / 2, 0, 0, height / 2, -width / 2, 0]);
      break;
    case 'hexagon': {
      const r = width / 2;
      const points: number[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        points.push(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      base.poly(points);
      break;
    }
    case 'line': {
      base.roundRect(-width / 2, -height / 2, width, height, 4);
      break;
    }
    default:
      base.roundRect(-width / 2, -height / 2, width, height, ZONE_CORNER_RADIUS);
      break;
  }

  base.fill({ color: fill }).stroke(stroke);
}
```

### 2. Fill color from `zone.visual.color`

Update `resolveFillColor()` to check `zone.visual?.color` first:

```typescript
function resolveFillColor(zone: RenderZone): number {
  if (zone.visual?.color !== undefined) {
    return parseInt(zone.visual.color.replace('#', ''), 16);
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

Adjust label offsets based on actual zone dimensions (instead of hardcoded `ZONE_WIDTH * 0.44`).

## Invariants

- `pnpm turbo build` passes
- `pnpm turbo typecheck` passes
- `pnpm turbo lint` passes
- Zones without `visual` render exactly as before (no visual regression for Texas Hold'em)
- Zones with `visual.shape: 'circle'` render as ellipses
- Zones with `visual.color: '#...'` use that fill color

## Tests

- **Existing**: All zone renderer tests pass unchanged (fallback behavior)
- **New test**: Zone with `visual: { shape: 'circle', width: 100, height: 100 }` calls `base.ellipse()` (verify via Graphics mock/spy)
- **New test**: Zone with `visual: { color: '#e63946' }` produces fill color `0xe63946`
- **New test**: Zone with `visual: { label: 'Saigon' }` overrides display name
- **New test**: Zone with `visual: null` renders default rounded rectangle (regression guard)
- `pnpm -F @ludoforge/runner test` — all tests pass
