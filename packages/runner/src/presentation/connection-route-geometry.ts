import type { Position } from '../canvas/geometry.js';
import { quadraticBezierPoint } from '../canvas/geometry/bezier-utils.js';

export const DEFAULT_CONNECTION_ROUTE_CURVE_SEGMENTS = 24;

export type ResolvedRouteSegmentLike =
  | { readonly kind: 'straight' }
  | {
      readonly kind: 'quadratic';
      readonly controlPoint: {
        readonly position: Position;
      };
    };

export function sampleResolvedRoutePath(
  points: readonly Position[],
  segments: readonly ResolvedRouteSegmentLike[],
  curveSegments: number = DEFAULT_CONNECTION_ROUTE_CURVE_SEGMENTS,
): readonly Position[] {
  if (points.length === 0) {
    return [];
  }

  const sampled: Position[] = [points[0] ?? { x: 0, y: 0 }];
  const segmentCount = Math.max(2, Math.trunc(curveSegments));

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const start = points[index];
    const end = points[index + 1];
    if (segment === undefined || start === undefined || end === undefined) {
      continue;
    }

    if (segment.kind === 'straight') {
      sampled.push(end);
      continue;
    }

    for (let sampleIndex = 1; sampleIndex <= segmentCount; sampleIndex += 1) {
      sampled.push(
        quadraticBezierPoint(
          sampleIndex / segmentCount,
          start,
          segment.controlPoint.position,
          end,
        ),
      );
    }
  }

  return sampled;
}

export function nearestPointOnPolyline(
  polyline: readonly Position[],
  target: Position,
): Position | null {
  if (polyline.length === 0) {
    return null;
  }
  if (polyline.length === 1) {
    return polyline[0] ?? null;
  }

  let nearestPoint: Position | null = null;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (let index = 1; index < polyline.length; index += 1) {
    const start = polyline[index - 1];
    const end = polyline[index];
    if (start === undefined || end === undefined) {
      continue;
    }

    const projected = projectPointOntoSegment(start, end, target);
    const distanceSquared = getDistanceSquared(projected, target);
    if (distanceSquared < nearestDistanceSquared) {
      nearestPoint = projected;
      nearestDistanceSquared = distanceSquared;
    }
  }

  return nearestPoint;
}

function projectPointOntoSegment(
  start: Position,
  end: Position,
  target: Position,
): Position {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSquared = (segmentX * segmentX) + (segmentY * segmentY);
  if (segmentLengthSquared === 0) {
    return start;
  }

  const targetX = target.x - start.x;
  const targetY = target.y - start.y;
  const t = Math.min(
    1,
    Math.max(0, ((targetX * segmentX) + (targetY * segmentY)) / segmentLengthSquared),
  );

  return {
    x: start.x + (segmentX * t),
    y: start.y + (segmentY * t),
  };
}

function getDistanceSquared(left: Position, right: Position): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return (dx * dx) + (dy * dy);
}
