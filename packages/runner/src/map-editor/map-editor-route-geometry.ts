import type {
  ConnectionEndpoint,
  ConnectionRouteControl,
  ConnectionRouteDefinition,
  ConnectionRouteSegment,
  Position,
} from './map-editor-types.js';
import type { ZoneShape } from '../config/visual-config-defaults.js';
import {
  normalize,
  perpendicular,
  quadraticBezierPoint,
} from '../canvas/geometry/bezier-utils.js';
import {
  getEdgePointAtAngle,
  resolveVisualDimensions,
} from '../canvas/renderers/shape-utils.js';
import {
  ZONE_RENDER_HEIGHT,
  ZONE_RENDER_WIDTH,
} from '../layout/layout-constants.js';

const DEFAULT_CURVE_SEGMENTS = 24;
const DEFAULT_ZONE_DIMENSIONS = {
  width: ZONE_RENDER_WIDTH,
  height: ZONE_RENDER_HEIGHT,
} as const;

export interface EditorRouteZoneVisual {
  readonly shape?: ZoneShape;
  readonly width?: number;
  readonly height?: number;
}

export interface ResolvedEditorRoutePoint {
  readonly endpoint: ConnectionEndpoint;
  readonly position: Position;
}

export interface ResolvedEditorRouteControlPoint {
  readonly kind: 'anchor' | 'position';
  readonly id: string | null;
  readonly position: Position;
}

export type ResolvedEditorRouteSegment =
  | {
      readonly kind: 'straight';
      readonly start: Position;
      readonly end: Position;
    }
  | {
      readonly kind: 'quadratic';
      readonly start: Position;
      readonly controlPoint: ResolvedEditorRouteControlPoint;
      readonly end: Position;
    };

export interface EditorRouteGeometry {
  readonly points: readonly ResolvedEditorRoutePoint[];
  readonly segments: readonly ResolvedEditorRouteSegment[];
  readonly sampledPath: readonly Position[];
  readonly hitAreaPoints: readonly Position[];
}

export interface RouteSegmentMatch {
  readonly segmentIndex: number;
  readonly position: Position;
  readonly t: number;
  readonly distance: number;
}

export function resolveEndpointPosition(
  endpoint: ConnectionEndpoint,
  zonePositions: ReadonlyMap<string, Position>,
  connectionAnchors: ReadonlyMap<string, Position>,
  zoneVisuals: ReadonlyMap<string, EditorRouteZoneVisual>,
): Position | null {
  if (endpoint.kind === 'zone') {
    const center = clonePosition(zonePositions.get(endpoint.zoneId));
    if (center === null) {
      return null;
    }

    if (endpoint.anchor === undefined) {
      return center;
    }

    const visual = zoneVisuals.get(endpoint.zoneId);
    if (visual === undefined) {
      return null;
    }

    const dimensions = resolveVisualDimensions(visual, DEFAULT_ZONE_DIMENSIONS);
    const offset = getEdgePointAtAngle(visual.shape, dimensions, endpoint.anchor);
    return {
      x: center.x + offset.x,
      y: center.y + offset.y,
    };
  }

  return clonePosition(connectionAnchors.get(endpoint.anchorId));
}

export function resolveRouteGeometry(
  route: ConnectionRouteDefinition,
  zonePositions: ReadonlyMap<string, Position>,
  connectionAnchors: ReadonlyMap<string, Position>,
  zoneVisuals: ReadonlyMap<string, EditorRouteZoneVisual>,
  options: {
    readonly curveSegments?: number;
    readonly hitAreaPadding?: number;
    readonly strokeWidth?: number;
  } = {},
): EditorRouteGeometry | null {
  const points = route.points
    .map((endpoint) => {
      const position = resolveEndpointPosition(endpoint, zonePositions, connectionAnchors, zoneVisuals);
      if (position === null) {
        return null;
      }
      return {
        endpoint,
        position,
      };
    });

  if (points.some((point) => point === null)) {
    return null;
  }

  const resolvedPoints = points as ResolvedEditorRoutePoint[];
  if (resolvedPoints.length < 2 || route.segments.length !== resolvedPoints.length - 1) {
    return null;
  }

  const resolvedSegments: ResolvedEditorRouteSegment[] = [];
  for (let index = 0; index < route.segments.length; index += 1) {
    const segment = route.segments[index];
    const start = resolvedPoints[index]?.position;
    const end = resolvedPoints[index + 1]?.position;
    if (segment === undefined || start === undefined || end === undefined) {
      return null;
    }

    const resolvedSegment = resolveSegment(segment, start, end, connectionAnchors);
    if (resolvedSegment === null) {
      return null;
    }
    resolvedSegments.push(resolvedSegment);
  }

  const sampledPath = sampleRoutePath(resolvedSegments, options.curveSegments ?? DEFAULT_CURVE_SEGMENTS);
  const hitAreaPoints = approximatePolylineHitPolygon(
    sampledPath,
    (options.strokeWidth ?? 4) / 2 + (options.hitAreaPadding ?? 12),
  );

  return {
    points: resolvedPoints,
    segments: resolvedSegments,
    sampledPath,
    hitAreaPoints,
  };
}

export function nearestPointOnStraight(
  p0: Position,
  p1: Position,
  target: Position,
): { position: Position; t: number } {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return {
      position: { x: p0.x, y: p0.y },
      t: 0,
    };
  }

  const projected = ((target.x - p0.x) * dx + (target.y - p0.y) * dy) / lengthSquared;
  const t = clampUnitInterval(projected);
  return {
    position: {
      x: p0.x + dx * t,
      y: p0.y + dy * t,
    },
    t,
  };
}

export function nearestPointOnQuadratic(
  p0: Position,
  cp: Position,
  p2: Position,
  target: Position,
  samples = 50,
): { position: Position; t: number } {
  const sampleCount = Math.max(1, Math.trunc(samples));
  let bestT = 0;
  let bestPoint = quadraticBezierPoint(0, p0, cp, p2);
  let bestDistanceSquared = distanceSquared(bestPoint, target);

  for (let index = 1; index <= sampleCount; index += 1) {
    const t = index / sampleCount;
    const point = quadraticBezierPoint(t, p0, cp, p2);
    const candidateDistanceSquared = distanceSquared(point, target);
    if (candidateDistanceSquared < bestDistanceSquared) {
      bestDistanceSquared = candidateDistanceSquared;
      bestPoint = point;
      bestT = t;
    }
  }

  return {
    position: bestPoint,
    t: bestT,
  };
}

export function findNearestRouteSegment(
  geometry: EditorRouteGeometry,
  target: Position,
): RouteSegmentMatch | null {
  let bestMatch: RouteSegmentMatch | null = null;

  for (let segmentIndex = 0; segmentIndex < geometry.segments.length; segmentIndex += 1) {
    const segment = geometry.segments[segmentIndex];
    if (segment === undefined) {
      continue;
    }

    const nearest = segment.kind === 'straight'
      ? nearestPointOnStraight(segment.start, segment.end, target)
      : nearestPointOnQuadratic(
          segment.start,
          segment.controlPoint.position,
          segment.end,
          target,
        );
    const distance = Math.sqrt(distanceSquared(nearest.position, target));
    if (bestMatch === null || distance < bestMatch.distance) {
      bestMatch = {
        segmentIndex,
        position: nearest.position,
        t: nearest.t,
        distance,
      };
    }
  }

  return bestMatch;
}

function resolveSegment(
  segment: ConnectionRouteSegment,
  start: Position,
  end: Position,
  connectionAnchors: ReadonlyMap<string, Position>,
): ResolvedEditorRouteSegment | null {
  if (segment.kind === 'straight') {
    return {
      kind: 'straight',
      start,
      end,
    };
  }

  const controlPoint = resolveControlPoint(segment.control, connectionAnchors);
  if (controlPoint === null) {
    return null;
  }

  return {
    kind: 'quadratic',
    start,
    controlPoint,
    end,
  };
}

function resolveControlPoint(
  control: ConnectionRouteControl,
  connectionAnchors: ReadonlyMap<string, Position>,
): ResolvedEditorRouteControlPoint | null {
  if (control.kind === 'position') {
    return {
      kind: 'position',
      id: null,
      position: { x: control.x, y: control.y },
    };
  }

  const position = connectionAnchors.get(control.anchorId);
  if (position === undefined) {
    return null;
  }

  return {
    kind: 'anchor',
    id: control.anchorId,
    position: { x: position.x, y: position.y },
  };
}

function sampleRoutePath(
  segments: readonly ResolvedEditorRouteSegment[],
  curveSegments: number,
): readonly Position[] {
  const first = segments[0]?.start;
  if (first === undefined) {
    return [];
  }

  const segmentCount = Math.max(2, Math.trunc(curveSegments));
  const sampled: Position[] = [{ x: first.x, y: first.y }];

  for (const segment of segments) {
    if (segment.kind === 'straight') {
      sampled.push({ x: segment.end.x, y: segment.end.y });
      continue;
    }

    for (let index = 1; index <= segmentCount; index += 1) {
      sampled.push(
        quadraticBezierPoint(
          index / segmentCount,
          segment.start,
          segment.controlPoint.position,
          segment.end,
        ),
      );
    }
  }

  return sampled;
}

function approximatePolylineHitPolygon(
  points: readonly Position[],
  halfWidth: number,
): readonly Position[] {
  if (points.length === 0) {
    return [];
  }

  const leftSide: Position[] = [];
  const rightSide: Position[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point === undefined) {
      continue;
    }
    const normal = resolvePolylineNormal(points, index);
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

function resolvePolylineNormal(points: readonly Position[], index: number): Position {
  const current = points[index];
  if (current === undefined) {
    return { x: 0, y: 1 };
  }

  const previous = index > 0 ? points[index - 1] : undefined;
  const next = index < points.length - 1 ? points[index + 1] : undefined;
  const previousNormal = previous === undefined
    ? null
    : perpendicular(normalize({
        x: current.x - previous.x,
        y: current.y - previous.y,
      }));
  const nextNormal = next === undefined
    ? null
    : perpendicular(normalize({
        x: next.x - current.x,
        y: next.y - current.y,
      }));

  if (previousNormal !== null && nextNormal !== null) {
    const averaged = normalize({
      x: previousNormal.x + nextNormal.x,
      y: previousNormal.y + nextNormal.y,
    });
    if (averaged.x !== 0 || averaged.y !== 0) {
      return averaged;
    }
  }

  return nextNormal ?? previousNormal ?? { x: 0, y: 1 };
}

function clonePosition(position: Position | undefined): Position | null {
  if (position === undefined) {
    return null;
  }

  return {
    x: position.x,
    y: position.y,
  };
}

function clampUnitInterval(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function distanceSquared(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
