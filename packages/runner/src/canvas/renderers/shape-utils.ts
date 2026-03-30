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
        base.poly([...options.vertices]);
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
        return rayPolygonIntersection(angleDeg, vertices);
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
