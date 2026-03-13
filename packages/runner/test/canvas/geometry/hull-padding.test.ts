import { describe, it, expect } from 'vitest';
import type { Point } from '../../../src/canvas/geometry/convex-hull.js';
import { padHull, roundHullCorners } from '../../../src/canvas/geometry/hull-padding.js';

describe('padHull', () => {
  it('returns empty for empty input', () => {
    expect(padHull([], 10)).toEqual([]);
  });

  it('returns padded rectangle for single point', () => {
    const result = padHull([{ x: 50, y: 50 }], 10);
    expect(result).toHaveLength(4);
    // Should be a 20x20 rectangle centered on the point
    expect(result[0]).toEqual({ x: 40, y: 40 });
    expect(result[1]).toEqual({ x: 60, y: 40 });
    expect(result[2]).toEqual({ x: 60, y: 60 });
    expect(result[3]).toEqual({ x: 40, y: 60 });
  });

  it('returns padded capsule for two points', () => {
    const result = padHull([{ x: 0, y: 0 }, { x: 100, y: 0 }], 20);
    expect(result).toHaveLength(4);
    // Should produce a rectangle around the line segment
    const ys = result.map((p) => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    expect(minY).toBeLessThan(0);
    expect(maxY).toBeGreaterThan(0);
  });

  it('pads a triangle outward', () => {
    const triangle: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 80 },
    ];
    const padded = padHull(triangle, 10);
    expect(padded).toHaveLength(3);

    // Bounding box of padded hull should be larger than original
    const origMinX = Math.min(...triangle.map((p) => p.x));
    const origMaxX = Math.max(...triangle.map((p) => p.x));
    const paddedMinX = Math.min(...padded.map((p) => p.x));
    const paddedMaxX = Math.max(...padded.map((p) => p.x));
    expect(paddedMinX).toBeLessThan(origMinX);
    expect(paddedMaxX).toBeGreaterThan(origMaxX);
  });

  it('pads a square uniformly', () => {
    // Use CCW-ordered square (as convexHull would produce)
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const padded = padHull(square, 10);
    expect(padded).toHaveLength(4);
    // Bounding box should be expanded by ~10 in each direction
    const minX = Math.min(...padded.map((p) => p.x));
    const maxX = Math.max(...padded.map((p) => p.x));
    const minY = Math.min(...padded.map((p) => p.y));
    const maxY = Math.max(...padded.map((p) => p.y));
    expect(minX).toBeCloseTo(-10, 0);
    expect(maxX).toBeCloseTo(110, 0);
    expect(minY).toBeCloseTo(-10, 0);
    expect(maxY).toBeCloseTo(110, 0);
  });
});

describe('roundHullCorners', () => {
  it('returns hull unchanged for less than 3 points', () => {
    const twoPoints: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    expect(roundHullCorners(twoPoints, 10)).toEqual(twoPoints);
  });

  it('produces more points than original hull', () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const rounded = roundHullCorners(square, 20);
    // 4 corners * (8+1) samples per corner = 36 points
    expect(rounded.length).toBeGreaterThan(square.length);
    expect(rounded.length).toBe(36);
  });

  it('all rounded points lie within padded bounds', () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const rounded = roundHullCorners(square, 20);
    for (const p of rounded) {
      expect(p.x).toBeGreaterThanOrEqual(-1);
      expect(p.x).toBeLessThanOrEqual(101);
      expect(p.y).toBeGreaterThanOrEqual(-1);
      expect(p.y).toBeLessThanOrEqual(101);
    }
  });
});
