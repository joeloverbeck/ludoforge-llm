import type { Point2D } from './point2d.js';

const EPSILON = 1e-10;
const CANONICAL_COMPONENT_EPSILON = 1e-6;

export function quadraticBezierPoint(t: number, p0: Point2D, cp: Point2D, p2: Point2D): Point2D {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * cp.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * cp.y + t * t * p2.y,
  };
}

export function quadraticBezierTangent(t: number, p0: Point2D, cp: Point2D, p2: Point2D): Point2D {
  const mt = 1 - t;
  return {
    x: 2 * mt * (cp.x - p0.x) + 2 * t * (p2.x - cp.x),
    y: 2 * mt * (cp.y - p0.y) + 2 * t * (p2.y - cp.y),
  };
}

export function quadraticBezierMidpoint(p0: Point2D, cp: Point2D, p2: Point2D): Point2D {
  return quadraticBezierPoint(0.5, p0, cp, p2);
}

export function quadraticBezierMidpointTangent(p0: Point2D, cp: Point2D, p2: Point2D): Point2D {
  return quadraticBezierTangent(0.5, p0, cp, p2);
}

export function computeControlPoint(p0: Point2D, p2: Point2D, curvature: number): Point2D {
  const midpoint = {
    x: (p0.x + p2.x) / 2,
    y: (p0.y + p2.y) / 2,
  };
  const direction = normalize({
    x: p2.x - p0.x,
    y: p2.y - p0.y,
  });
  const normal = perpendicular(direction);
  return {
    x: midpoint.x + normal.x * curvature,
    y: midpoint.y + normal.y * curvature,
  };
}

export function resolveCurvatureControlPoint(
  p0: Point2D,
  p2: Point2D,
  offset: number,
  angle?: number,
): Point2D {
  const midpoint = {
    x: (p0.x + p2.x) / 2,
    y: (p0.y + p2.y) / 2,
  };
  const span = Math.sqrt(((p2.x - p0.x) ** 2) + ((p2.y - p0.y) ** 2));
  const direction = angle === undefined
    ? perpendicular(normalize({
        x: p2.x - p0.x,
        y: p2.y - p0.y,
      }))
    : directionFromScreenAngle(angle);

  return {
    x: midpoint.x + (direction.x * offset * span),
    y: midpoint.y + (direction.y * offset * span),
  };
}

export function deriveCurvatureControl(
  p0: Point2D,
  p2: Point2D,
  controlPoint: Point2D,
): { readonly offset: number; readonly angle?: number } {
  const midpoint = {
    x: (p0.x + p2.x) / 2,
    y: (p0.y + p2.y) / 2,
  };
  const vector = {
    x: controlPoint.x - midpoint.x,
    y: controlPoint.y - midpoint.y,
  };
  const span = Math.sqrt(((p2.x - p0.x) ** 2) + ((p2.y - p0.y) ** 2));
  if (span < EPSILON || isZeroVector(vector)) {
    return { offset: 0 };
  }

  const tangent = normalize({
    x: p2.x - p0.x,
    y: p2.y - p0.y,
  });
  const normal = perpendicular(tangent);
  const tangentComponent = dot(vector, tangent);
  const normalComponent = dot(vector, normal);
  const canonicalTolerance = CANONICAL_COMPONENT_EPSILON * Math.max(1, span, Math.abs(normalComponent));

  if (Math.abs(tangentComponent) <= canonicalTolerance) {
    return { offset: normalComponent / span };
  }

  return {
    offset: Math.sqrt((vector.x ** 2) + (vector.y ** 2)) / span,
    angle: normalizeScreenAngle(Math.atan2(-vector.y, vector.x) * (180 / Math.PI)),
  };
}

export function approximateBezierHitPolygon(
  p0: Point2D,
  cp: Point2D,
  p2: Point2D,
  halfWidth: number,
  segments: number,
): readonly Point2D[] {
  const segmentCount = Math.max(1, Math.trunc(segments));
  const leftSide: Point2D[] = [];
  const rightSide: Point2D[] = [];

  for (let index = 0; index <= segmentCount; index += 1) {
    const t = index / segmentCount;
    const point = quadraticBezierPoint(t, p0, cp, p2);
    const direction = resolveCurveDirection(t, p0, cp, p2);
    const normal = perpendicular(normalize(direction));

    leftSide.push({
      x: point.x + normal.x * halfWidth,
      y: point.y + normal.y * halfWidth,
    });
    rightSide.push({
      x: point.x - normal.x * halfWidth,
      y: point.y - normal.y * halfWidth,
    });
  }

  rightSide.reverse();
  return [...leftSide, ...rightSide];
}

export function perpendicular(v: Point2D): Point2D {
  return { x: -v.y, y: v.x };
}

export function normalize(v: Point2D): Point2D {
  const length = Math.sqrt(v.x * v.x + v.y * v.y);
  if (length < EPSILON) {
    return { x: 0, y: 0 };
  }
  return {
    x: v.x / length,
    y: v.y / length,
  };
}

function directionFromScreenAngle(angle: number): Point2D {
  const radians = angle * (Math.PI / 180);
  return {
    x: Math.cos(radians),
    y: -Math.sin(radians),
  };
}

function normalizeScreenAngle(angle: number): number {
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function dot(a: Point2D, b: Point2D): number {
  return (a.x * b.x) + (a.y * b.y);
}

function resolveCurveDirection(t: number, p0: Point2D, cp: Point2D, p2: Point2D): Point2D {
  const tangent = quadraticBezierTangent(t, p0, cp, p2);
  if (!isZeroVector(tangent)) {
    return tangent;
  }

  const startHandle = { x: cp.x - p0.x, y: cp.y - p0.y };
  if (!isZeroVector(startHandle)) {
    return startHandle;
  }

  const endHandle = { x: p2.x - cp.x, y: p2.y - cp.y };
  if (!isZeroVector(endHandle)) {
    return endHandle;
  }

  return { x: p2.x - p0.x, y: p2.y - p0.y };
}

function isZeroVector(v: Point2D): boolean {
  return Math.abs(v.x) < EPSILON && Math.abs(v.y) < EPSILON;
}
