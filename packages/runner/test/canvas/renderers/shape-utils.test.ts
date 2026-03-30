import { describe, expect, it } from 'vitest';

import {
  buildRegularPolygonPoints,
  drawZoneShape,
  getEdgePointAtAngle,
  resolveVisualDimensions,
  smoothPolygonVertices,
} from '../../../src/canvas/renderers/shape-utils';

class MockGraphics {
  roundRectArgs: [number, number, number, number, number] | null = null;

  circleArgs: [number, number, number] | null = null;

  ellipseArgs: [number, number, number, number] | null = null;

  polyArgs: number[] | null = null;

  roundRect(x: number, y: number, width: number, height: number, radius: number): this {
    this.roundRectArgs = [x, y, width, height, radius];
    return this;
  }

  circle(x: number, y: number, radius: number): this {
    this.circleArgs = [x, y, radius];
    return this;
  }

  ellipse(x: number, y: number, halfWidth: number, halfHeight: number): this {
    this.ellipseArgs = [x, y, halfWidth, halfHeight];
    return this;
  }

  poly(points: number[]): this {
    this.polyArgs = points;
    return this;
  }
}

describe('shape-utils', () => {
  it('resolveVisualDimensions sanitizes missing and invalid dimensions', () => {
    expect(resolveVisualDimensions({ width: 120, height: 80 }, { width: 180, height: 110 })).toEqual({
      width: 120,
      height: 80,
    });
    expect(resolveVisualDimensions({ width: -2, height: Number.NaN }, { width: 180, height: 110 })).toEqual({
      width: 180,
      height: 110,
    });
    expect(resolveVisualDimensions(null, { width: 180, height: 110 })).toEqual({
      width: 180,
      height: 110,
    });
  });

  it('buildRegularPolygonPoints returns 2 entries per side', () => {
    expect(buildRegularPolygonPoints(3, 60, 60)).toHaveLength(6);
    expect(buildRegularPolygonPoints(6, 60, 60)).toHaveLength(12);
    expect(buildRegularPolygonPoints(8, 60, 60)).toHaveLength(16);
  });

  it('drawZoneShape dispatches to expected primitive for each supported shape', () => {
    const options = { rectangleCornerRadius: 12, lineCornerRadius: 4 };
    const base = new MockGraphics();

    drawZoneShape(base, 'rectangle', { width: 100, height: 80 }, options);
    expect(base.roundRectArgs?.[4]).toBe(12);

    drawZoneShape(base, 'line', { width: 100, height: 20 }, options);
    expect(base.roundRectArgs?.[4]).toBe(4);

    drawZoneShape(base, 'circle', { width: 80, height: 40 }, options);
    expect(base.circleArgs).toEqual([0, 0, 20]);

    drawZoneShape(base, 'ellipse', { width: 80, height: 40 }, options);
    expect(base.ellipseArgs).toEqual([0, 0, 40, 20]);

    drawZoneShape(base, 'diamond', { width: 80, height: 40 }, options);
    expect(base.polyArgs).toHaveLength(8);

    drawZoneShape(base, 'hexagon', { width: 80, height: 40 }, options);
    expect(base.polyArgs).toHaveLength(12);

    drawZoneShape(base, 'triangle', { width: 80, height: 40 }, options);
    expect(base.polyArgs).toHaveLength(6);

    drawZoneShape(base, 'octagon', { width: 80, height: 40 }, options);
    expect(base.polyArgs).toHaveLength(16);
  });

  it('drawZoneShape treats connection as a no-op', () => {
    const options = { rectangleCornerRadius: 12, lineCornerRadius: 4 };
    const base = new MockGraphics();

    drawZoneShape(base, 'connection', { width: 80, height: 40 }, options);

    expect(base.roundRectArgs).toBeNull();
    expect(base.circleArgs).toBeNull();
    expect(base.ellipseArgs).toBeNull();
    expect(base.polyArgs).toBeNull();
  });

  it('computes circle edge points at cardinal angles using the smaller dimension as the radius', () => {
    expect(getEdgePointAtAngle('circle', { width: 80, height: 40 }, 0)).toEqual({ x: 20, y: 0 });
    expect(getEdgePointAtAngle('circle', { width: 80, height: 40 }, 90)).toEqual({ x: 0, y: -20 });
    expect(getEdgePointAtAngle('circle', { width: 80, height: 40 }, 180)).toEqual({ x: -20, y: 0 });
    expect(getEdgePointAtAngle('circle', { width: 80, height: 40 }, 270)).toEqual({ x: 0, y: 20 });
  });

  it('normalizes angles outside the canonical range', () => {
    expect(getEdgePointAtAngle('rectangle', { width: 60, height: 40 }, -90)).toEqual({ x: 0, y: 20 });
    expect(getEdgePointAtAngle('rectangle', { width: 60, height: 40 }, 450)).toEqual({ x: 0, y: -20 });
  });

  it('computes true ray intersections for ellipses', () => {
    const point = getEdgePointAtAngle('ellipse', { width: 120, height: 80 }, 45);
    const semiX = 60;
    const semiY = 40;

    expect((point.x * point.x) / (semiX * semiX) + (point.y * point.y) / (semiY * semiY)).toBeCloseTo(1, 6);
    expect(point.y / point.x).toBeCloseTo(-1, 6);
  });

  it('treats rectangles and lines as box intersections from the center ray', () => {
    expect(getEdgePointAtAngle('rectangle', { width: 80, height: 40 }, 0)).toEqual({ x: 40, y: 0 });
    expect(getEdgePointAtAngle('rectangle', { width: 80, height: 40 }, 90)).toEqual({ x: 0, y: -20 });
    expect(getEdgePointAtAngle('rectangle', { width: 80, height: 40 }, 180)).toEqual({ x: -40, y: 0 });
    expect(getEdgePointAtAngle('rectangle', { width: 80, height: 40 }, 270)).toEqual({ x: 0, y: 20 });
    expect(getEdgePointAtAngle('rectangle', { width: 80, height: 80 }, 45)).toEqual({ x: 40, y: -40 });
    expect(getEdgePointAtAngle('rectangle', { width: 80, height: 80 }, 135)).toEqual({ x: -40, y: -40 });
    expect(getEdgePointAtAngle('rectangle', { width: 80, height: 80 }, 225)).toEqual({ x: -40, y: 40 });
    expect(getEdgePointAtAngle('rectangle', { width: 80, height: 80 }, 315)).toEqual({ x: 40, y: 40 });
    expect(getEdgePointAtAngle('line', { width: 100, height: 20 }, 0)).toEqual({ x: 50, y: 0 });
    expect(getEdgePointAtAngle(undefined, { width: 100, height: 20 }, 180)).toEqual({ x: -50, y: 0 });
  });

  it('computes polygon intersections for diamond, triangle, hexagon, and octagon', () => {
    expect(getEdgePointAtAngle('diamond', { width: 80, height: 40 }, 0)).toEqual({ x: 40, y: 0 });
    const diamondDiagonal = getEdgePointAtAngle('diamond', { width: 80, height: 40 }, 45);
    expect(diamondDiagonal.x).toBeCloseTo(13.333333333333334, 6);
    expect(diamondDiagonal.y).toBeCloseTo(-13.333333333333334, 6);

    const triangleTop = getEdgePointAtAngle('triangle', { width: 80, height: 80 }, 90);
    expect(triangleTop.x).toBeCloseTo(0, 6);
    expect(triangleTop.y).toBeCloseTo(-40, 6);

    const hexagonRight = getEdgePointAtAngle('hexagon', { width: 80, height: 80 }, 0);
    expect(hexagonRight.x).toBeCloseTo(34.64101615137755, 6);
    expect(hexagonRight.y).toBeCloseTo(0, 6);

    const octagonTop = getEdgePointAtAngle('octagon', { width: 80, height: 80 }, 90);
    expect(octagonTop.x).toBeCloseTo(0, 6);
    expect(octagonTop.y).toBeCloseTo(-40, 6);
  });

  it('returns the center for connection zones', () => {
    expect(getEdgePointAtAngle('connection', { width: 80, height: 40 }, 123)).toEqual({ x: 0, y: 0 });
  });

  it('drawZoneShape renders polygon with smoothed vertices when vertices are provided', () => {
    const vertices = [0, -50, 40, 25, -40, 25];
    const options = { rectangleCornerRadius: 12, lineCornerRadius: 4, vertices };
    const base = new MockGraphics();

    drawZoneShape(base, 'polygon', { width: 80, height: 80 }, options);
    // Smoothing with 2 iterations: 3 vertices → 6 after iter 1 → 12 after iter 2 = 24 values
    expect(base.polyArgs).not.toBeNull();
    expect(base.polyArgs!.length).toBe(24);
    expect(base.polyArgs).toEqual(smoothPolygonVertices(vertices, 2));
    expect(base.roundRectArgs).toBeNull();
  });

  it('drawZoneShape falls back to rectangle for polygon without vertices', () => {
    const options = { rectangleCornerRadius: 12, lineCornerRadius: 4 };
    const base = new MockGraphics();

    drawZoneShape(base, 'polygon', { width: 100, height: 80 }, options);
    expect(base.roundRectArgs).toBeTruthy();
    expect(base.polyArgs).toBeNull();
  });

  it('getEdgePointAtAngle computes ray intersection for polygon with smoothed vertices', () => {
    const vertices = [0, -50, 50, 0, 0, 50, -50, 0];
    const point = getEdgePointAtAngle('polygon', { width: 100, height: 100 }, 0, vertices);
    // Smoothing rounds the diamond corners inward, so the rightmost edge is < 50
    expect(point.x).toBeCloseTo(37.5, 6);
    expect(point.y).toBeCloseTo(0, 6);
  });

  it('getEdgePointAtAngle returns center for polygon without vertices', () => {
    expect(getEdgePointAtAngle('polygon', { width: 80, height: 40 }, 45)).toEqual({ x: 0, y: 0 });
  });

  it('does not mutate the provided dimensions object and returns stable values across calls', () => {
    const dimensions = { width: 120, height: 80 };

    const first = getEdgePointAtAngle('ellipse', dimensions, 33);
    const second = getEdgePointAtAngle('ellipse', dimensions, 33);

    expect(first).toEqual(second);
    expect(dimensions).toEqual({ width: 120, height: 80 });
  });

  describe('smoothPolygonVertices', () => {
    it('returns original vertices when iterations is 0', () => {
      const vertices = [0, -50, 50, 0, 0, 50, -50, 0];
      expect(smoothPolygonVertices(vertices, 0)).toEqual(vertices);
    });

    it('doubles vertex count per iteration for a triangle', () => {
      const triangle = [0, -50, 40, 25, -40, 25];
      const after1 = smoothPolygonVertices(triangle, 1);
      // 3 vertices → 6 vertices (2 per edge × 3 edges) = 12 values
      expect(after1).toHaveLength(12);
      const after2 = smoothPolygonVertices(triangle, 2);
      // 6 vertices → 12 vertices = 24 values
      expect(after2).toHaveLength(24);
    });

    it('returns a copy for arrays too short to smooth', () => {
      expect(smoothPolygonVertices([10, 20], 2)).toEqual([10, 20]);
      expect(smoothPolygonVertices([], 2)).toEqual([]);
    });

    it('produces matching absolute points for shared edges between adjacent polygons', () => {
      // Two polygons sharing edge P1→P2 in absolute world coords
      // Polygon A centered at (100, 100), Polygon B centered at (200, 100)
      // Shared edge absolute: (150, 50) → (150, 150)
      // A relative: (50, -50) → (50, 50); B relative: (-50, -50) → (-50, 50)
      const polyA = [50, -50, 50, 50, -50, 50, -50, -50]; // CW: shares edge [0,1]→[2,3]
      const polyB = [-50, 50, -50, -50, 50, -50, 50, 50]; // CW: shares edge [0,1]→[2,3] (reversed)

      const smoothA = smoothPolygonVertices(polyA, 2);
      const smoothB = smoothPolygonVertices(polyB, 2);

      // Extract absolute world coords for shared edge from both polygons
      // In polyA, edge from vertex 0 to vertex 1 (indices 0-3) produces smoothed points
      // In polyB, edge from vertex 0 to vertex 1 (indices 0-3) is the reverse direction
      // The smoothed points along a shared edge should produce the same absolute positions
      const centerA = { x: 100, y: 100 };
      const centerB = { x: 200, y: 100 };

      // Verify that the smoothed output doesn't produce NaN or degenerate values
      for (let i = 0; i < smoothA.length; i += 1) {
        expect(Number.isFinite(smoothA[i])).toBe(true);
      }
      for (let i = 0; i < smoothB.length; i += 1) {
        expect(Number.isFinite(smoothB[i])).toBe(true);
      }

      // Verify shared edge alignment: extract the first edge's smoothed points from each polygon
      // and convert to absolute coords
      const aAbsPoint0 = { x: smoothA[0]! + centerA.x, y: smoothA[1]! + centerA.y };
      const aAbsPoint1 = { x: smoothA[2]! + centerA.x, y: smoothA[3]! + centerA.y };
      const bAbsPoint0 = { x: smoothB[0]! + centerB.x, y: smoothB[1]! + centerB.y };
      const bAbsPoint1 = { x: smoothB[2]! + centerB.x, y: smoothB[3]! + centerB.y };

      // polyA's first edge goes (50,-50)→(50,50), polyB's first edge goes (-50,50)→(-50,-50)
      // After smoothing, polyA's first two output points should match polyB's first two (reversed)
      expect(aAbsPoint0.x).toBeCloseTo(bAbsPoint1.x, 6);
      expect(aAbsPoint0.y).toBeCloseTo(bAbsPoint1.y, 6);
      expect(aAbsPoint1.x).toBeCloseTo(bAbsPoint0.x, 6);
      expect(aAbsPoint1.y).toBeCloseTo(bAbsPoint0.y, 6);
    });

    it('does not mutate the input array', () => {
      const vertices = [0, -50, 50, 0, 0, 50, -50, 0];
      const copy = [...vertices];
      smoothPolygonVertices(vertices, 2);
      expect(vertices).toEqual(copy);
    });
  });
});
