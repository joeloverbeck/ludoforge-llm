import { describe, it, expect } from 'vitest';

import { poleOfInaccessibility } from '../../src/map-editor/polygon-centroid.js';

/** Helper: returns true if point (px, py) is inside the polygon defined by flat vertices. */
function isInsidePolygon(px: number, py: number, vertices: readonly number[]): boolean {
  const pointCount = Math.trunc(vertices.length / 2);
  let inside = false;
  for (let i = 0, j = pointCount - 1; i < pointCount; j = i++) {
    const ax = vertices[i * 2]!;
    const ay = vertices[i * 2 + 1]!;
    const bx = vertices[j * 2]!;
    const by = vertices[j * 2 + 1]!;
    if ((ay > py) !== (by > py) && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) {
      inside = !inside;
    }
  }
  return inside;
}

describe('poleOfInaccessibility', () => {
  it('returns (0,0) for fewer than 3 vertices', () => {
    const result = poleOfInaccessibility([10, 20, 30, 40]);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('returns a point inside a square centered at origin', () => {
    // Square: (-50, -50), (50, -50), (50, 50), (-50, 50)
    const vertices = [-50, -50, 50, -50, 50, 50, -50, 50];
    const result = poleOfInaccessibility(vertices);
    expect(isInsidePolygon(result.x, result.y, vertices)).toBe(true);
    // Should be near the center (0, 0).
    expect(Math.abs(result.x)).toBeLessThan(5);
    expect(Math.abs(result.y)).toBeLessThan(5);
  });

  it('returns a point inside a triangle', () => {
    // Triangle: (0, -60), (60, 40), (-60, 40)
    const vertices = [0, -60, 60, 40, -60, 40];
    const result = poleOfInaccessibility(vertices);
    expect(isInsidePolygon(result.x, result.y, vertices)).toBe(true);
  });

  it('returns a point inside a concave L-shaped polygon', () => {
    // L-shape:
    //   (0,0) -- (100,0) -- (100,50) -- (50,50) -- (50,100) -- (0,100)
    const vertices = [0, 0, 100, 0, 100, 50, 50, 50, 50, 100, 0, 100];
    const result = poleOfInaccessibility(vertices);
    expect(isInsidePolygon(result.x, result.y, vertices)).toBe(true);
    // The centroid of this L-shape would be outside the polygon — pole must not be.
  });

  it('returns a point inside an offset polygon (not centered at origin)', () => {
    // Square offset to (200, 300).
    const vertices = [180, 280, 220, 280, 220, 320, 180, 320];
    const result = poleOfInaccessibility(vertices);
    expect(isInsidePolygon(result.x, result.y, vertices)).toBe(true);
    expect(result.x).toBeGreaterThan(180);
    expect(result.x).toBeLessThan(220);
    expect(result.y).toBeGreaterThan(280);
    expect(result.y).toBeLessThan(320);
  });

  it('handles a degenerate polygon (all vertices at the same point)', () => {
    const vertices = [5, 5, 5, 5, 5, 5];
    const result = poleOfInaccessibility(vertices);
    expect(result.x).toBe(5);
    expect(result.y).toBe(5);
  });
});
