import type {
  ConnectionRouteControl,
  ConnectionRouteDefinition,
  ConnectionRouteSegment,
} from './visual-config-types.js';

export function cloneConnectionRouteControl(control: ConnectionRouteControl): ConnectionRouteControl {
  switch (control.kind) {
    case 'anchor':
      return { kind: 'anchor', anchorId: control.anchorId };
    case 'position':
      return { kind: 'position', x: control.x, y: control.y };
    case 'curvature':
      return control.angle === undefined
        ? { kind: 'curvature', offset: control.offset }
        : { kind: 'curvature', offset: control.offset, angle: control.angle };
  }
}

export function cloneConnectionRouteSegment(segment: ConnectionRouteSegment): ConnectionRouteSegment {
  return segment.kind === 'straight'
    ? { kind: 'straight' }
    : {
        kind: 'quadratic',
        control: cloneConnectionRouteControl(segment.control),
      };
}

export function cloneConnectionRouteDefinition(route: ConnectionRouteDefinition): ConnectionRouteDefinition {
  return {
    points: route.points.map((point) => ({ ...point })),
    segments: route.segments.map(cloneConnectionRouteSegment),
  };
}

export function connectionRouteControlsEqual(left: ConnectionRouteControl, right: ConnectionRouteControl): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  switch (left.kind) {
    case 'anchor':
      return left.anchorId === (right as Extract<ConnectionRouteControl, { kind: 'anchor' }>).anchorId;
    case 'position':
      return left.x === (right as Extract<ConnectionRouteControl, { kind: 'position' }>).x
        && left.y === (right as Extract<ConnectionRouteControl, { kind: 'position' }>).y;
    case 'curvature':
      return left.offset === (right as Extract<ConnectionRouteControl, { kind: 'curvature' }>).offset
        && left.angle === (right as Extract<ConnectionRouteControl, { kind: 'curvature' }>).angle;
  }
}

export function connectionRouteSegmentsEqual(left: ConnectionRouteSegment, right: ConnectionRouteSegment): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  switch (left.kind) {
    case 'straight':
      return true;
    case 'quadratic':
      return connectionRouteControlsEqual(
        left.control,
        (right as Extract<ConnectionRouteSegment, { kind: 'quadratic' }>).control,
      );
  }
}
