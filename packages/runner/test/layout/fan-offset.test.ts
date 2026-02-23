import { describe, expect, it } from 'vitest';

import { computeFanOffset } from '../../src/layout/fan-offset';

describe('computeFanOffset', () => {
  it('centers a single item at x=0', () => {
    const result = computeFanOffset(0, 1, 24);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('spreads two items symmetrically', () => {
    const itemWidth = 24;
    const gap = 4;
    const spacing = itemWidth + gap;

    const left = computeFanOffset(0, 2, itemWidth, gap);
    const right = computeFanOffset(1, 2, itemWidth, gap);

    expect(left.x).toBe(-spacing / 2);
    expect(right.x).toBe(spacing / 2);
    expect(left.y).toBe(0);
    expect(right.y).toBe(0);
  });

  it('spreads three items symmetrically around center', () => {
    const itemWidth = 24;
    const gap = 4;
    const spacing = itemWidth + gap;

    const offsets = [0, 1, 2].map((i) => computeFanOffset(i, 3, itemWidth, gap));

    expect(offsets[0]!.x).toBe(-spacing);
    expect(offsets[1]!.x).toBe(0);
    expect(offsets[2]!.x).toBe(spacing);
  });

  it('respects custom itemWidth', () => {
    const wide = computeFanOffset(0, 2, 100, 4);
    const narrow = computeFanOffset(0, 2, 10, 4);
    expect(Math.abs(wide.x)).toBeGreaterThan(Math.abs(narrow.x));
  });

  it('respects custom gap parameter', () => {
    const wideGap = computeFanOffset(0, 2, 24, 20);
    const narrowGap = computeFanOffset(0, 2, 24, 2);
    expect(Math.abs(wideGap.x)).toBeGreaterThan(Math.abs(narrowGap.x));
  });

  it('uses default gap of 4 when not specified', () => {
    const withDefault = computeFanOffset(0, 2, 24);
    const withExplicit = computeFanOffset(0, 2, 24, 4);
    expect(withDefault).toEqual(withExplicit);
  });

  it('always returns y=0', () => {
    for (let i = 0; i < 5; i++) {
      expect(computeFanOffset(i, 5, 24).y).toBe(0);
    }
  });
});
