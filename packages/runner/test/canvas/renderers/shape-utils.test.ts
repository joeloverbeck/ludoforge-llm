import { describe, expect, it } from 'vitest';

import {
  buildRegularPolygonPoints,
  drawZoneShape,
  parseHexColor,
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
  it('parseHexColor enforces strict #RRGGBB by default and supports optional #RGB mode', () => {
    expect(parseHexColor('#e63946')).toBe(0xe63946);
    expect(parseHexColor('#abc')).toBeNull();
    expect(parseHexColor('#abc', { allowShortHex: true })).toBe(0xaabbcc);
    expect(parseHexColor('invalid')).toBeNull();
  });

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
});
