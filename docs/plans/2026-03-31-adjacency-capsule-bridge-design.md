# Adjacency Capsule Bridge Design

**Date**: 2026-03-31
**Status**: Approved

## Problem

Province-to-province adjacencies on the FITL game map are currently rendered as
single semi-transparent white dots (8px, 0.6 alpha). These are too subtle and
read as visual noise rather than intentional connections. Players cannot tell at
a glance which provinces are adjacent.

## Solution: Solid Capsule Bridge

Replace the single dot with a capsule (pill) shape spanning the gap between two
neighboring provinces. The capsule connects the closest edge points of the two
province polygons, creating a clear "bridge" metaphor.

### Rendering Approach

Use a thick line with round caps between the two closest polygon edge points.
PixiJS `lineCap: 'round'` naturally produces a capsule shape — no complex
geometry needed.

### Visual Specifications

| Property       | Default    | Highlighted |
|----------------|------------|-------------|
| Color          | `#ffffff`  | `#ffffff`   |
| Alpha          | 0.7        | 1.0         |
| Line width     | 14px       | 18px        |
| Line cap       | `round`    | `round`     |

The closest points (`pointA`, `pointB`) are already computed by
`closestPointsBetweenPolygons()` in `shape-utils.ts`. Currently only the
midpoint is used for the single dot; the capsule uses both endpoints directly.

### Code Changes

**Primary file**: `packages/runner/src/canvas/renderers/adjacency-renderer.ts`

Replace `drawBridgeDot()` with `drawBridgeCapsule()`:

```typescript
// Before: single dot at midpoint
g.circle(midX, midY, 8).fill({ color: 0xffffff, alpha: 0.6 });

// After: capsule between closest edge points
g.moveTo(pointA.x, pointA.y);
g.lineTo(pointB.x, pointB.y);
g.stroke({ color: 0xffffff, alpha: 0.7, width: 14, cap: 'round' });
```

Highlighted state uses alpha 1.0 and width 18px, resolved through the existing
`resolveEdgeStyle()` pipeline.

### Testing

Update existing bridge-dot tests in adjacency renderer test file:

- Capsule renders between two close polygon edges
- Capsule orientation matches the angle between closest points
- Highlighted capsule uses brightened style (alpha 1.0, width 18)
- Very short distances (provinces nearly touching) produce a visible capsule
- Very long distances produce a proportionally correct capsule

### Verification

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner dev` — visual inspection, capture screenshot
