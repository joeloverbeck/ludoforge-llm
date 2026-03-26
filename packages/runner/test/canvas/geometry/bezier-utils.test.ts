import { describe, expect, it } from 'vitest';

import {
  approximateBezierHitPolygon,
  computeControlPoint,
  deriveCurvatureControl,
  normalize,
  perpendicular,
  quadraticBezierMidpoint,
  quadraticBezierMidpointTangent,
  quadraticBezierPoint,
  quadraticBezierTangent,
  resolveCurvatureControlPoint,
} from '../../../src/canvas/geometry/bezier-utils.js';
import type { Point2D } from '../../../src/canvas/geometry/point2d.js';

function dot(a: Point2D, b: Point2D): number {
  return a.x * b.x + a.y * b.y;
}

function magnitude(v: Point2D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

describe('bezier-utils', () => {
  it('returns the exact endpoints at t=0 and t=1', () => {
    const p0 = { x: 0, y: 0 };
    const cp = { x: 5, y: 10 };
    const p2 = { x: 10, y: 0 };

    expect(quadraticBezierPoint(0, p0, cp, p2)).toEqual(p0);
    expect(quadraticBezierPoint(1, p0, cp, p2)).toEqual(p2);
  });

  it('midpoint helpers match the t=0.5 curve point and tangent', () => {
    const p0 = { x: 0, y: 0 };
    const cp = { x: 4, y: 6 };
    const p2 = { x: 10, y: 2 };

    expect(quadraticBezierMidpoint(p0, cp, p2)).toEqual(quadraticBezierPoint(0.5, p0, cp, p2));
    expect(quadraticBezierMidpointTangent(p0, cp, p2)).toEqual(quadraticBezierTangent(0.5, p0, cp, p2));
  });

  it('returns endpoint tangents that follow the adjacent control handles', () => {
    const p0 = { x: 1, y: 2 };
    const cp = { x: 4, y: 8 };
    const p2 = { x: 10, y: 5 };

    expect(quadraticBezierTangent(0, p0, cp, p2)).toEqual({ x: 6, y: 12 });
    expect(quadraticBezierTangent(1, p0, cp, p2)).toEqual({ x: 12, y: -6 });
  });

  it('computes a midpoint control point for zero curvature', () => {
    expect(computeControlPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toEqual({ x: 5, y: 0 });
  });

  it('offsets the control point perpendicular to the endpoint segment', () => {
    const p0 = { x: 0, y: 0 };
    const p2 = { x: 10, y: 0 };
    const controlPoint = computeControlPoint(p0, p2, 3);
    const segment = { x: p2.x - p0.x, y: p2.y - p0.y };
    const offset = { x: controlPoint.x - 5, y: controlPoint.y };

    expect(dot(segment, offset)).toBeCloseTo(0);
    expect(controlPoint).toEqual({ x: 5, y: 3 });
  });

  it('resolves curvature controls relative to endpoint span', () => {
    expect(resolveCurvatureControlPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.3)).toEqual({ x: 5, y: 3 });
  });

  it('resolves zero curvature to the midpoint for vertical endpoints', () => {
    expect(resolveCurvatureControlPoint({ x: 0, y: 0 }, { x: 0, y: 10 }, 0)).toEqual({ x: 0, y: 5 });
  });

  it('resolves negative curvature offsets on the opposite perpendicular side', () => {
    expect(resolveCurvatureControlPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, -0.3)).toEqual({ x: 5, y: -3 });
  });

  it('resolves curvature angles in screen coordinates', () => {
    const point = resolveCurvatureControlPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.5, 90);
    expect(point.x).toBeCloseTo(5);
    expect(point.y).toBeCloseTo(-5);
  });

  it('derives signed perpendicular curvature controls without angle aliases', () => {
    expect(deriveCurvatureControl(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: -5 },
    )).toEqual({ offset: -0.5 });
    expect(deriveCurvatureControl(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 5 },
    )).toEqual({ offset: 0.5 });
  });

  it('derives explicit angles only for non-perpendicular curvature controls', () => {
    const derived = deriveCurvatureControl(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 8, y: -4 },
    );

    expect(derived.offset).toBeCloseTo(0.5);
    expect(derived.angle).toBeCloseTo(53.13010235415598);
  });

  it('returns an orthogonal perpendicular vector', () => {
    const vector = { x: 3, y: 4 };
    const rotated = perpendicular(vector);

    expect(rotated).toEqual({ x: -4, y: 3 });
    expect(dot(vector, rotated)).toBeCloseTo(0);
  });

  it('normalizes non-zero vectors and preserves zero vectors', () => {
    expect(normalize({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    expect(magnitude(normalize({ x: 3, y: 4 }))).toBeCloseTo(1);
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('builds a deterministic hit polygon with one vertex per side per segment sample', () => {
    const p0 = { x: 0, y: 0 };
    const cp = { x: 5, y: 10 };
    const p2 = { x: 10, y: 0 };
    const polygon = approximateBezierHitPolygon(p0, cp, p2, 2, 4);

    expect(polygon).toHaveLength(10);
    expect(polygon[0]!.x).toBeCloseTo(-4 / Math.sqrt(5));
    expect(polygon[0]!.y).toBeCloseTo(2 / Math.sqrt(5));
    expect(polygon[4]!.x).toBeCloseTo(10 + (4 / Math.sqrt(5)));
    expect(polygon[4]!.y).toBeCloseTo(2 / Math.sqrt(5));
    expect(polygon[5]!.x).toBeCloseTo(10 - (4 / Math.sqrt(5)));
    expect(polygon[5]!.y).toBeCloseTo(-2 / Math.sqrt(5));
    expect(polygon[9]!.x).toBeCloseTo(4 / Math.sqrt(5));
    expect(polygon[9]!.y).toBeCloseTo(-2 / Math.sqrt(5));
  });

  it('collapses a zero-width hit polygon onto sampled curve points', () => {
    const p0 = { x: 0, y: 0 };
    const cp = { x: 6, y: 12 };
    const p2 = { x: 12, y: 0 };
    const polygon = approximateBezierHitPolygon(p0, cp, p2, 0, 3);

    const expectedForward = [
      quadraticBezierPoint(0, p0, cp, p2),
      quadraticBezierPoint(1 / 3, p0, cp, p2),
      quadraticBezierPoint(2 / 3, p0, cp, p2),
      quadraticBezierPoint(1, p0, cp, p2),
    ];

    expect(polygon.slice(0, 4)).toEqual(expectedForward);
    expect(polygon.slice(4)).toEqual([...expectedForward].reverse());
  });
});
