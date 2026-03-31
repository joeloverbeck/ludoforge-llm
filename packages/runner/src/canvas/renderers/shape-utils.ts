import type { ZoneShape } from '../../config/visual-config-defaults.js';
import type { Position } from '../../spatial/position-types.js';

export interface ShapeDimensions {
  readonly width: number;
  readonly height: number;
}

export interface ShapeGraphics {
  roundRect(x: number, y: number, width: number, height: number, radius: number): ShapeGraphics;
  circle(x: number, y: number, radius: number): ShapeGraphics;
  ellipse(x: number, y: number, halfWidth: number, halfHeight: number): ShapeGraphics;
  poly(points: number[]): ShapeGraphics;
}

interface DrawZoneShapeOptions {
  readonly rectangleCornerRadius: number;
  readonly lineCornerRadius: number;
  readonly vertices?: readonly number[] | undefined;
}

export function resolveVisualDimensions(
  visual: { readonly width?: number; readonly height?: number } | null | undefined,
  defaults: ShapeDimensions,
): ShapeDimensions {
  return {
    width: sanitizePositiveDimension(visual?.width, defaults.width),
    height: sanitizePositiveDimension(visual?.height, defaults.height),
  };
}

export function sanitizePositiveDimension(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

export function drawZoneShape(
  base: ShapeGraphics,
  shape: ZoneShape | undefined,
  dimensions: ShapeDimensions,
  options: DrawZoneShapeOptions,
): void {
  const { width, height } = dimensions;

  switch (shape) {
    case 'circle': {
      const radius = Math.min(width, height) / 2;
      base.circle(0, 0, radius);
      return;
    }
    case 'ellipse':
      base.ellipse(0, 0, width / 2, height / 2);
      return;
    case 'diamond':
      base.poly([0, -height / 2, width / 2, 0, 0, height / 2, -width / 2, 0]);
      return;
    case 'hexagon':
      base.poly(buildRegularPolygonPoints(6, width, height));
      return;
    case 'triangle':
      base.poly(buildRegularPolygonPoints(3, width, height));
      return;
    case 'octagon':
      base.poly(buildRegularPolygonPoints(8, width, height));
      return;
    case 'line':
      base.roundRect(-width / 2, -height / 2, width, height, options.lineCornerRadius);
      return;
    case 'polygon':
      if (options.vertices !== undefined && options.vertices.length >= 6) {
        base.poly(smoothPolygonVertices(options.vertices, 2));
      } else {
        base.roundRect(-width / 2, -height / 2, width, height, options.rectangleCornerRadius);
      }
      return;
    case 'connection':
      return;
    case 'rectangle':
    default:
      base.roundRect(-width / 2, -height / 2, width, height, options.rectangleCornerRadius);
  }
}

export function getEdgePointAtAngle(
  shape: ZoneShape | undefined,
  dimensions: ShapeDimensions,
  angleDeg: number,
  vertices?: readonly number[],
): Position {
  const direction = directionForAngle(angleDeg);

  switch (shape) {
    case 'circle': {
      const radius = Math.min(dimensions.width, dimensions.height) / 2;
      return canonicalizePosition({
        x: direction.x * radius,
        y: direction.y * radius,
      });
    }
    case 'ellipse':
      return ellipseIntersection(direction, dimensions.width / 2, dimensions.height / 2);
    case 'diamond':
      return rayPolygonIntersection(angleDeg, [0, -dimensions.height / 2, dimensions.width / 2, 0, 0, dimensions.height / 2, -dimensions.width / 2, 0]);
    case 'hexagon':
      return rayPolygonIntersection(angleDeg, buildRegularPolygonPoints(6, dimensions.width, dimensions.height));
    case 'triangle':
      return rayPolygonIntersection(angleDeg, buildRegularPolygonPoints(3, dimensions.width, dimensions.height));
    case 'octagon':
      return rayPolygonIntersection(angleDeg, buildRegularPolygonPoints(8, dimensions.width, dimensions.height));
    case 'polygon':
      if (vertices !== undefined && vertices.length >= 6) {
        return rayPolygonIntersection(angleDeg, smoothPolygonVertices(vertices, 2));
      }
      return { x: 0, y: 0 };
    case 'connection':
      return { x: 0, y: 0 };
    case 'line':
    case 'rectangle':
    default:
      return rectangleIntersection(direction, dimensions.width / 2, dimensions.height / 2);
  }
}

export function buildRegularPolygonPoints(sides: number, width: number, height: number): number[] {
  const points: number[] = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = ((Math.PI * 2) / sides) * index - Math.PI / 2;
    points.push(Math.cos(angle) * (width / 2), Math.sin(angle) * (height / 2));
  }
  return points;
}

/**
 * Chaikin's corner-cutting algorithm: smooths a closed polygon by replacing
 * each vertex with two points at 25% and 75% along each edge per iteration.
 * A 6-vertex polygon becomes ~24 vertices after 2 iterations.
 */
export function smoothPolygonVertices(
  vertices: readonly number[],
  iterations: number = 2,
): number[] {
  if (vertices.length < 6 || iterations <= 0) {
    return [...vertices];
  }

  let current = vertices;
  for (let iter = 0; iter < iterations; iter += 1) {
    const pointCount = Math.trunc(current.length / 2);
    const smoothed: number[] = [];
    for (let i = 0; i < pointCount; i += 1) {
      const ax = current[i * 2]!;
      const ay = current[i * 2 + 1]!;
      const bx = current[((i + 1) % pointCount) * 2]!;
      const by = current[((i + 1) % pointCount) * 2 + 1]!;
      smoothed.push(
        ax * 0.75 + bx * 0.25,
        ay * 0.75 + by * 0.25,
        ax * 0.25 + bx * 0.75,
        ay * 0.25 + by * 0.75,
      );
    }
    current = smoothed;
  }
  return [...current];
}

function directionForAngle(angleDeg: number): Position {
  const radians = normalizeAngleDegrees(angleDeg) * (Math.PI / 180);
  return canonicalizePosition({
    x: Math.cos(radians),
    y: -Math.sin(radians),
  });
}

function normalizeAngleDegrees(angleDeg: number): number {
  return ((angleDeg % 360) + 360) % 360;
}

function rectangleIntersection(direction: Position, halfWidth: number, halfHeight: number): Position {
  const scaleX = Math.abs(direction.x) < Number.EPSILON ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(direction.x);
  const scaleY = Math.abs(direction.y) < Number.EPSILON ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(direction.y);
  const scale = Math.min(scaleX, scaleY);
  return canonicalizePosition({
    x: direction.x * scale,
    y: direction.y * scale,
  });
}

function ellipseIntersection(direction: Position, semiMajorX: number, semiMajorY: number): Position {
  const scale = 1 / Math.sqrt(
    ((direction.x * direction.x) / (semiMajorX * semiMajorX))
      + ((direction.y * direction.y) / (semiMajorY * semiMajorY)),
  );
  return canonicalizePosition({
    x: direction.x * scale,
    y: direction.y * scale,
  });
}

function rayPolygonIntersection(
  angleDeg: number,
  polygonPoints: readonly number[],
): Position {
  const direction = directionForAngle(angleDeg);
  const pointCount = Math.trunc(polygonPoints.length / 2);
  const epsilon = 1e-9;
  let bestScale = Number.POSITIVE_INFINITY;

  for (let index = 0; index < pointCount; index += 1) {
    const startIndex = index * 2;
    const endIndex = ((index + 1) % pointCount) * 2;
    const ax = polygonPoints[startIndex];
    const ay = polygonPoints[startIndex + 1];
    const bx = polygonPoints[endIndex];
    const by = polygonPoints[endIndex + 1];
    if (
      ax === undefined
      || ay === undefined
      || bx === undefined
      || by === undefined
    ) {
      continue;
    }

    const segmentX = bx - ax;
    const segmentY = by - ay;
    const denominator = cross(direction.x, direction.y, segmentX, segmentY);
    if (Math.abs(denominator) < epsilon) {
      continue;
    }

    const scale = cross(ax, ay, segmentX, segmentY) / denominator;
    const segmentT = cross(ax, ay, direction.x, direction.y) / denominator;
    if (scale < -epsilon || segmentT < -epsilon || segmentT > 1 + epsilon) {
      continue;
    }

    bestScale = Math.min(bestScale, scale);
  }

  if (!Number.isFinite(bestScale)) {
    return { x: 0, y: 0 };
  }

  return canonicalizePosition({
    x: direction.x * bestScale,
    y: direction.y * bestScale,
  });
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return (ax * by) - (ay * bx);
}

function canonicalizePosition(position: Position): Position {
  return {
    x: canonicalizeCoordinate(position.x),
    y: canonicalizeCoordinate(position.y),
  };
}

/**
 * Finds the closest pair of points between two closed polygons (flat vertex arrays).
 * Uses brute-force edge-to-edge closest-point calculation.
 */
export function closestPointsBetweenPolygons(
  verticesA: readonly number[],
  verticesB: readonly number[],
): { pointA: Position; pointB: Position } {
  const countA = Math.trunc(verticesA.length / 2);
  const countB = Math.trunc(verticesB.length / 2);
  let bestDistSq = Number.POSITIVE_INFINITY;
  let bestA: Position = { x: 0, y: 0 };
  let bestB: Position = { x: 0, y: 0 };

  for (let i = 0; i < countA; i++) {
    const a1x = verticesA[i * 2]!;
    const a1y = verticesA[i * 2 + 1]!;
    const a2x = verticesA[((i + 1) % countA) * 2]!;
    const a2y = verticesA[((i + 1) % countA) * 2 + 1]!;

    for (let j = 0; j < countB; j++) {
      const b1x = verticesB[j * 2]!;
      const b1y = verticesB[j * 2 + 1]!;
      const b2x = verticesB[((j + 1) % countB) * 2]!;
      const b2y = verticesB[((j + 1) % countB) * 2 + 1]!;

      const result = closestPointsOnSegments(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y);
      if (result.distSq < bestDistSq) {
        bestDistSq = result.distSq;
        bestA = { x: result.ax, y: result.ay };
        bestB = { x: result.bx, y: result.by };
      }
    }
  }

  return { pointA: bestA, pointB: bestB };
}

function closestPointsOnSegments(
  a1x: number, a1y: number, a2x: number, a2y: number,
  b1x: number, b1y: number, b2x: number, b2y: number,
): { ax: number; ay: number; bx: number; by: number; distSq: number } {
  const dax = a2x - a1x;
  const day = a2y - a1y;
  const dbx = b2x - b1x;
  const dby = b2y - b1y;
  const r = a1x - b1x;
  const s = a1y - b1y;

  const lenASq = dax * dax + day * day;
  const lenBSq = dbx * dbx + dby * dby;
  const f = dbx * r + dby * s;

  let sN: number, sD: number, tN: number, tD: number;

  if (lenASq < 1e-12 && lenBSq < 1e-12) {
    const dx = a1x - b1x;
    const dy = a1y - b1y;
    return { ax: a1x, ay: a1y, bx: b1x, by: b1y, distSq: dx * dx + dy * dy };
  }

  if (lenASq < 1e-12) {
    sN = 0; sD = 1;
    tN = f; tD = lenBSq;
  } else {
    const c = dax * r + day * s;
    if (lenBSq < 1e-12) {
      tN = 0; tD = 1;
      sN = -c; sD = lenASq;
    } else {
      const b = dax * dbx + day * dby;
      const denom = lenASq * lenBSq - b * b;
      sN = denom !== 0 ? (b * f - lenBSq * c) : 0;
      sD = denom !== 0 ? denom : 1;
      tN = b * sN + f * sD;
      tD = lenBSq * sD;
    }
  }

  if (sN < 0) { sN = 0; tN = f; tD = lenBSq; }
  else if (sN > sD) { sN = sD; tN = f + dax * dbx + day * dby; tD = lenBSq; }

  if (tN < 0) {
    tN = 0;
    sN = Math.max(0, Math.min(lenASq, -(dax * r + day * s)));
    sD = lenASq;
  } else if (tN > tD) {
    tN = tD;
    sN = Math.max(0, Math.min(lenASq, -(dax * r + day * s) + dax * dbx + day * dby));
    sD = lenASq;
  }

  const sc = Math.abs(sN) < 1e-12 ? 0 : sN / sD;
  const tc = Math.abs(tN) < 1e-12 ? 0 : tN / tD;

  const ax = a1x + sc * dax;
  const ay = a1y + sc * day;
  const bx = b1x + tc * dbx;
  const by = b1y + tc * dby;
  const dx = ax - bx;
  const dy = ay - by;
  return { ax, ay, bx, by, distSq: dx * dx + dy * dy };
}

function canonicalizeCoordinate(value: number): number {
  if (Object.is(value, -0) || Math.abs(value) < 1e-12) {
    return 0;
  }

  const roundedInteger = Math.round(value);
  if (Math.abs(value - roundedInteger) < 1e-12) {
    return roundedInteger;
  }

  return value;
}
