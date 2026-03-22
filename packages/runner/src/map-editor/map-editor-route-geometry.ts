import type {
  ConnectionEndpoint,
  ConnectionRouteControl,
  ConnectionRouteDefinition,
  ConnectionRouteSegment,
  Position,
} from './map-editor-types.js';
import {
  normalize,
  perpendicular,
  quadraticBezierPoint,
} from '../canvas/geometry/bezier-utils.js';

const DEFAULT_CURVE_SEGMENTS = 24;

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

export function resolveEndpointPosition(
  endpoint: ConnectionEndpoint,
  zonePositions: ReadonlyMap<string, Position>,
  connectionAnchors: ReadonlyMap<string, Position>,
): Position | null {
  if (endpoint.kind === 'zone') {
    return clonePosition(zonePositions.get(endpoint.zoneId));
  }

  return clonePosition(connectionAnchors.get(endpoint.anchorId));
}

export function resolveRouteGeometry(
  route: ConnectionRouteDefinition,
  zonePositions: ReadonlyMap<string, Position>,
  connectionAnchors: ReadonlyMap<string, Position>,
  options: {
    readonly curveSegments?: number;
    readonly hitAreaPadding?: number;
    readonly strokeWidth?: number;
  } = {},
): EditorRouteGeometry | null {
  const points = route.points
    .map((endpoint) => {
      const position = resolveEndpointPosition(endpoint, zonePositions, connectionAnchors);
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
