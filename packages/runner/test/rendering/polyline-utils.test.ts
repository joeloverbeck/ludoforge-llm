import { describe, expect, it } from 'vitest';

import {
  approximatePolylineHitPolygon,
  flattenPoints,
  getPolylineLength,
  normalizeAngle,
  resolveLabelRotation,
  resolvePolylineNormal,
  resolvePolylinePointAtDistance,
  samplePolylineWavePoints,
} from '../../src/rendering/polyline-utils.js';

describe('getPolylineLength', () => {
  it('returns 0 for empty points', () => {
    expect(getPolylineLength([])).toBe(0);
  });

  it('returns 0 for a single point', () => {
    expect(getPolylineLength([{ x: 5, y: 10 }])).toBe(0);
  });

  it('returns correct length for a horizontal segment', () => {
    expect(getPolylineLength([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe(10);
  });

  it('returns correct length for a multi-segment polyline', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      { x: 3, y: 14 },
    ];
    expect(getPolylineLength(points)).toBe(15);
  });
});

describe('resolvePolylinePointAtDistance', () => {
  it('returns origin with default tangent for empty points', () => {
    const result = resolvePolylinePointAtDistance([], 5);
    expect(result.position).toEqual({ x: 0, y: 0 });
    expect(result.tangent).toEqual({ x: 1, y: 0 });
  });

  it('returns the single point with default tangent', () => {
    const result = resolvePolylinePointAtDistance([{ x: 7, y: 3 }], 0);
    expect(result.position).toEqual({ x: 7, y: 3 });
    expect(result.tangent).toEqual({ x: 1, y: 0 });
  });

  it('interpolates along the first segment', () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const result = resolvePolylinePointAtDistance(points, 5);
    expect(result.position.x).toBeCloseTo(5, 5);
    expect(result.position.y).toBeCloseTo(0, 5);
    expect(result.tangent).toEqual({ x: 10, y: 0 });
  });

  it('clamps to end for distance exceeding total length', () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const result = resolvePolylinePointAtDistance(points, 100);
    expect(result.position.x).toBeCloseTo(10, 5);
    expect(result.position.y).toBeCloseTo(0, 5);
  });

  it('interpolates across multi-segment polylines', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const result = resolvePolylinePointAtDistance(points, 15);
    expect(result.position.x).toBeCloseTo(10, 5);
    expect(result.position.y).toBeCloseTo(5, 5);
  });
});

describe('samplePolylineWavePoints', () => {
  it('returns copy of points when total length is zero', () => {
    const points = [{ x: 5, y: 5 }];
    const config = { waveAmplitude: 4, waveFrequency: 0.08 };
    const result = samplePolylineWavePoints(points, config, 8);
    expect(result).toEqual([{ x: 5, y: 5 }]);
  });

  it('produces correct number of displaced points', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const config = { waveAmplitude: 4, waveFrequency: 0.08 };
    const result = samplePolylineWavePoints(points, config, 10);
    expect(result).toHaveLength(11);
  });

  it('start and end points have zero sine offset at cycle boundaries', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const config = { waveAmplitude: 4, waveFrequency: 0.08 };
    const result = samplePolylineWavePoints(points, config, 10);
    expect(result[0]!.x).toBeCloseTo(0, 2);
    expect(result[result.length - 1]!.x).toBeCloseTo(100, 2);
  });
});

describe('approximatePolylineHitPolygon', () => {
  it('returns empty for empty points', () => {
    expect(approximatePolylineHitPolygon([], 5)).toEqual([]);
  });

  it('returns a polygon wider than the original line', () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const result = approximatePolylineHitPolygon(points, 5);
    expect(result.length).toBeGreaterThan(0);
    const ys = result.map((p) => p.y);
    expect(Math.max(...ys)).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeLessThan(0);
  });
});

describe('resolvePolylineNormal', () => {
  it('returns default normal for undefined index', () => {
    const result = resolvePolylineNormal([], 0);
    expect(result).toEqual({ x: 0, y: 1 });
  });

  it('returns perpendicular for a horizontal two-point line at start', () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const result = resolvePolylineNormal(points, 0);
    expect(result.x).toBeCloseTo(0, 5);
    expect(Math.abs(result.y)).toBeCloseTo(1, 5);
  });

  it('averages normals at interior points', () => {
    const points = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }];
    const result = resolvePolylineNormal(points, 1);
    expect(result.x).toBeCloseTo(0, 5);
    expect(Math.abs(result.y)).toBeCloseTo(1, 5);
  });
});

describe('resolveLabelRotation', () => {
  it('returns the angle unchanged when not upside-down', () => {
    const result = resolveLabelRotation(0);
    expect(result).toBeCloseTo(0, 5);
  });

  it('flips angles in the upside-down range', () => {
    const result = resolveLabelRotation(Math.PI);
    expect(result).toBeCloseTo(0, 5);
  });

  it('does not flip angles at exactly the boundary', () => {
    const justBelow = Math.PI / 2 - 0.01;
    const result = resolveLabelRotation(justBelow);
    expect(result).toBeCloseTo(justBelow, 2);
  });
});

describe('normalizeAngle', () => {
  it('returns 0 for 0', () => {
    expect(normalizeAngle(0)).toBe(0);
  });

  it('wraps negative angles', () => {
    const result = normalizeAngle(-Math.PI / 2);
    expect(result).toBeCloseTo(Math.PI * 1.5, 5);
  });

  it('wraps angles >= 2*PI', () => {
    const result = normalizeAngle(Math.PI * 3);
    expect(result).toBeCloseTo(Math.PI, 5);
  });
});

describe('flattenPoints', () => {
  it('returns empty for empty input', () => {
    expect(flattenPoints([])).toEqual([]);
  });

  it('flattens points to x,y pairs', () => {
    const points = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    expect(flattenPoints(points)).toEqual([1, 2, 3, 4]);
  });
});
