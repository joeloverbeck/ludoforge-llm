import { describe, it, expect } from 'vitest';
import { convexHull, type Point } from '../../../src/canvas/geometry/convex-hull.js';

describe('convexHull', () => {
  it('returns empty for empty input', () => {
    expect(convexHull([])).toEqual([]);
  });

  it('returns single point for single input', () => {
    const points: Point[] = [{ x: 5, y: 3 }];
    expect(convexHull(points)).toEqual([{ x: 5, y: 3 }]);
  });

  it('returns both points for two distinct points', () => {
    const points: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    const hull = convexHull(points);
    expect(hull).toHaveLength(2);
  });

  it('returns single point for two identical points', () => {
    const points: Point[] = [{ x: 3, y: 3 }, { x: 3, y: 3 }];
    const hull = convexHull(points);
    expect(hull).toHaveLength(1);
  });

  it('handles collinear points', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    const hull = convexHull(points);
    expect(hull).toHaveLength(2);
    expect(hull[0]).toEqual({ x: 0, y: 0 });
    expect(hull[1]).toEqual({ x: 3, y: 0 });
  });

  it('computes hull for a triangle', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 3 },
    ];
    const hull = convexHull(points);
    expect(hull).toHaveLength(3);
  });

  it('computes hull for a square with interior point', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
      { x: 2, y: 2 }, // interior point
    ];
    const hull = convexHull(points);
    expect(hull).toHaveLength(4);
    // interior point should not be in hull
    expect(hull.some((p) => p.x === 2 && p.y === 2)).toBe(false);
  });

  it('returns CCW-ordered vertices', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    const hull = convexHull(points);
    // Verify CCW by checking cross products are positive
    for (let i = 0; i < hull.length; i += 1) {
      const a = hull[i]!;
      const b = hull[(i + 1) % hull.length]!;
      const c = hull[(i + 2) % hull.length]!;
      const crossProduct = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      expect(crossProduct).toBeGreaterThanOrEqual(0);
    }
  });

  it('handles many random points', () => {
    const points: Point[] = [];
    for (let i = 0; i < 100; i += 1) {
      points.push({ x: Math.cos(i * 0.1) * 50 + Math.random(), y: Math.sin(i * 0.1) * 50 + Math.random() });
    }
    const hull = convexHull(points);
    // Hull should be a subset of all points and form a valid polygon
    expect(hull.length).toBeGreaterThanOrEqual(3);
    expect(hull.length).toBeLessThanOrEqual(points.length);
  });

  it('handles rectangle corner points (single-zone scenario)', () => {
    const points: Point[] = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ];
    const hull = convexHull(points);
    expect(hull).toHaveLength(4);
  });
});
