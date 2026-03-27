import { describe, expect, it } from 'vitest';

import { buildDashedSegments } from '../../../src/canvas/geometry/dashed-segments.js';
import type { Point2D } from '../../../src/canvas/geometry/point2d.js';

describe('buildDashedSegments', () => {
  it('returns expected dash segments for a horizontal open path', () => {
    expect(buildDashedSegments([{ x: 0, y: 0 }, { x: 20, y: 0 }], 6, 4)).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 6, y: 0 } },
      { from: { x: 10, y: 0 }, to: { x: 16, y: 0 } },
    ]);
  });

  it('truncates the first dash when the line is shorter than one dash', () => {
    expect(buildDashedSegments([{ x: 0, y: 0 }, { x: 3, y: 0 }], 6, 4)).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 3, y: 0 } },
    ]);
  });

  it('returns no segments for zero-length or underspecified paths', () => {
    expect(buildDashedSegments([], 6, 4)).toEqual([]);
    expect(buildDashedSegments([{ x: 0, y: 0 }], 6, 4)).toEqual([]);
    expect(buildDashedSegments([{ x: 5, y: 5 }, { x: 5, y: 5 }], 6, 4)).toEqual([]);
  });

  it('keeps vertical, reversed, and diagonal segments on the source path', () => {
    expect(buildDashedSegments([{ x: 0, y: 20 }, { x: 0, y: 0 }], 6, 4)).toEqual([
      { from: { x: 0, y: 20 }, to: { x: 0, y: 14 } },
      { from: { x: 0, y: 10 }, to: { x: 0, y: 4 } },
    ]);

    expect(buildDashedSegments([{ x: 20, y: 0 }, { x: 0, y: 0 }], 6, 4)).toEqual([
      { from: { x: 20, y: 0 }, to: { x: 14, y: 0 } },
      { from: { x: 10, y: 0 }, to: { x: 4, y: 0 } },
    ]);

    expect(buildDashedSegments([{ x: 0, y: 0 }, { x: 12, y: 16 }], 5, 5)).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 3, y: 4 } },
      { from: { x: 6, y: 8 }, to: { x: 9, y: 12 } },
    ]);
  });

  it('preserves dash state across closed polygon edges', () => {
    const square: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    expect(buildDashedSegments(square, 7, 4, { closed: true })).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 7, y: 0 } },
      { from: { x: 10, y: 1 }, to: { x: 10, y: 8 } },
      { from: { x: 8, y: 10 }, to: { x: 1, y: 10 } },
      { from: { x: 0, y: 7 }, to: { x: 0, y: 0 } },
    ]);
  });

  it('skips degenerate edges without resetting dash state', () => {
    const path: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];

    expect(buildDashedSegments(path, 6, 4)).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 6, y: 0 } },
      { from: { x: 10, y: 0 }, to: { x: 16, y: 0 } },
    ]);
  });

  it('rejects invalid dash patterns', () => {
    expect(() => buildDashedSegments([{ x: 0, y: 0 }, { x: 10, y: 0 }], 0, 4)).toThrow(
      RangeError,
    );
    expect(() => buildDashedSegments([{ x: 0, y: 0 }, { x: 10, y: 0 }], 6, -1)).toThrow(
      RangeError,
    );
    expect(() => buildDashedSegments([{ x: 0, y: 0 }, { x: 10, y: 0 }], Number.NaN, 4)).toThrow(
      RangeError,
    );
  });
});
