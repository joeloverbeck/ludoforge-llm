import { describe, expect, it } from 'vitest';

import {
  buildRegularPolygonPoints,
  drawZoneShape,
  getEdgePointAtAngle,
  resolveVisualDimensions,
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

  it('drawZoneShape renders polygon when vertices are provided', () => {
    const options = { rectangleCornerRadius: 12, lineCornerRadius: 4, vertices: [0, -50, 40, 25, -40, 25] };
    const base = new MockGraphics();

    drawZoneShape(base, 'polygon', { width: 80, height: 80 }, options);
    expect(base.polyArgs).toEqual([0, -50, 40, 25, -40, 25]);
    expect(base.roundRectArgs).toBeNull();
  });

  it('drawZoneShape falls back to rectangle for polygon without vertices', () => {
    const options = { rectangleCornerRadius: 12, lineCornerRadius: 4 };
    const base = new MockGraphics();

    drawZoneShape(base, 'polygon', { width: 100, height: 80 }, options);
    expect(base.roundRectArgs).toBeTruthy();
    expect(base.polyArgs).toBeNull();
  });

  it('getEdgePointAtAngle computes ray intersection for polygon with vertices', () => {
    const vertices = [0, -50, 50, 0, 0, 50, -50, 0];
    const point = getEdgePointAtAngle('polygon', { width: 100, height: 100 }, 0, vertices);
    expect(point.x).toBeCloseTo(50, 6);
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
});
