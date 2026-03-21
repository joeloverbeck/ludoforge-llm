import type { Position } from '../canvas/geometry.js';
import type {
  ConnectionEndpoint,
  ConnectionRouteControl,
  ConnectionRouteDefinition,
  ConnectionRouteSegment,
} from '../config/visual-config-types.js';
import type {
  PresentationAdjacencyNode,
  PresentationZoneNode,
} from './presentation-scene.js';

export interface ResolvedConnectionPoint {
  readonly kind: 'zone' | 'anchor';
  readonly id: string;
  readonly position: Position;
}

export interface ResolvedConnectionRouteControlPoint {
  readonly kind: 'anchor' | 'position';
  readonly id: string | null;
  readonly position: Position;
}

export type ResolvedConnectionRouteSegment =
  | { readonly kind: 'straight' }
  | {
      readonly kind: 'quadratic';
      readonly controlPoint: ResolvedConnectionRouteControlPoint;
    };

export interface ConnectionRouteNode {
  readonly zoneId: string;
  readonly displayName: string;
  readonly path: readonly ResolvedConnectionPoint[];
  readonly segments: readonly ResolvedConnectionRouteSegment[];
  readonly touchingZoneIds: readonly string[];
  readonly connectedConnectionIds: readonly string[];
  readonly connectionStyleKey: string | null;
  readonly zone: PresentationZoneNode;
}

export interface JunctionNode {
  readonly id: string;
  readonly connectionIds: readonly string[];
  readonly position: Position;
}

export interface ConnectionRouteResolution {
  readonly connectionRoutes: readonly ConnectionRouteNode[];
  readonly junctions: readonly JunctionNode[];
  readonly filteredZones: readonly PresentationZoneNode[];
  readonly filteredAdjacencies: readonly PresentationAdjacencyNode[];
}

export interface ResolveConnectionRoutesOptions {
  readonly zones: readonly PresentationZoneNode[];
  readonly adjacencies: readonly PresentationAdjacencyNode[];
  readonly positions: ReadonlyMap<string, Position>;
  readonly routeDefinitions?: ReadonlyMap<string, ConnectionRouteDefinition>;
  readonly anchorPositions?: ReadonlyMap<string, Position>;
}

export function resolveConnectionRoutes(
  options: ResolveConnectionRoutesOptions,
): ConnectionRouteResolution {
  const { zones, adjacencies, positions, routeDefinitions, anchorPositions } = options;
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
  const connectionZoneIds = new Set(
    zones
      .filter((zone) => zone.visual.shape === 'connection')
      .map((zone) => zone.id),
  );
  const adjacencyIndex = buildAdjacencyIndex(adjacencies);
  const resolvedRoutes: ConnectionRouteNode[] = [];

  for (const zone of zones) {
    if (!connectionZoneIds.has(zone.id)) {
      continue;
    }

    const neighbors = [...(adjacencyIndex.get(zone.id) ?? [])];
    const nonConnectionNeighbors = neighbors.filter((neighborId) => !connectionZoneIds.has(neighborId));
    const connectedConnectionIds = neighbors
      .filter((neighborId) => connectionZoneIds.has(neighborId))
      .sort(compareStrings);
    const resolvedGeometry = resolveRouteGeometry(
      zone.id,
      nonConnectionNeighbors,
      connectionZoneIds,
      routeDefinitions,
      anchorPositions,
      positions,
      zoneById,
    );

    if (resolvedGeometry === null) {
      continue;
    }

    const pathZoneIds = resolvedGeometry.path
      .filter((point): point is ResolvedConnectionPoint & { kind: 'zone' } => point.kind === 'zone')
      .map((point) => point.id);
    const pathZoneIdSet = new Set(pathZoneIds);
    const touchingZoneIds = nonConnectionNeighbors
      .filter((neighborId) => !pathZoneIdSet.has(neighborId))
      .sort(compareStrings);

    resolvedRoutes.push({
      zoneId: zone.id,
      displayName: zone.displayName,
      path: resolvedGeometry.path,
      segments: resolvedGeometry.segments,
      touchingZoneIds,
      connectedConnectionIds,
      connectionStyleKey: zone.visual.connectionStyleKey,
      zone,
    });
  }

  const resolvedRouteIds = new Set(resolvedRoutes.map((route) => route.zoneId));
  const junctions = resolveJunctions(resolvedRoutes);

  return {
    connectionRoutes: resolvedRoutes,
    junctions,
    filteredZones: zones.filter((zone) => !resolvedRouteIds.has(zone.id)),
    filteredAdjacencies: adjacencies.filter(
      (adjacency) => !resolvedRouteIds.has(adjacency.from) && !resolvedRouteIds.has(adjacency.to),
    ),
  };
}

function buildAdjacencyIndex(
  adjacencies: readonly PresentationAdjacencyNode[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const index = new Map<string, Set<string>>();
  for (const adjacency of adjacencies) {
    addNeighbor(index, adjacency.from, adjacency.to);
    addNeighbor(index, adjacency.to, adjacency.from);
  }
  return index;
}

function addNeighbor(index: Map<string, Set<string>>, from: string, to: string): void {
  let neighbors = index.get(from);
  if (neighbors === undefined) {
    neighbors = new Set<string>();
    index.set(from, neighbors);
  }
  neighbors.add(to);
}

function resolveRouteGeometry(
  zoneId: string,
  nonConnectionNeighbors: readonly string[],
  connectionZoneIds: ReadonlySet<string>,
  routeDefinitions: ReadonlyMap<string, ConnectionRouteDefinition> | undefined,
  anchorPositions: ReadonlyMap<string, Position> | undefined,
  positions: ReadonlyMap<string, Position>,
  zoneById: ReadonlyMap<string, PresentationZoneNode>,
): { readonly path: readonly ResolvedConnectionPoint[]; readonly segments: readonly ResolvedConnectionRouteSegment[] } | null {
  const definition = routeDefinitions?.get(zoneId);
  if (definition !== undefined) {
    return validateRouteDefinition(
      definition,
      nonConnectionNeighbors,
      connectionZoneIds,
      zoneById,
      positions,
      anchorPositions,
    );
  }

  if (nonConnectionNeighbors.length !== 2) {
    return null;
  }

  const left = nonConnectionNeighbors[0];
  const right = nonConnectionNeighbors[1];
  if (left === undefined || right === undefined) {
    return null;
  }

  const path = resolveZoneEndpoints(sortPair(left, right), positions);
  if (path === null) {
    return null;
  }

  return {
    path,
    segments: [{ kind: 'straight' }],
  };
}

function validateRouteDefinition(
  definition: ConnectionRouteDefinition,
  nonConnectionNeighbors: readonly string[],
  connectionZoneIds: ReadonlySet<string>,
  zoneById: ReadonlyMap<string, PresentationZoneNode>,
  positions: ReadonlyMap<string, Position>,
  anchorPositions: ReadonlyMap<string, Position> | undefined,
): { readonly path: readonly ResolvedConnectionPoint[]; readonly segments: readonly ResolvedConnectionRouteSegment[] } | null {
  const path = validateRoutePoints(
    definition.points,
    nonConnectionNeighbors,
    connectionZoneIds,
    zoneById,
    positions,
    anchorPositions,
  );
  if (path === null || definition.segments.length !== path.length - 1) {
    return null;
  }

  const segments: ResolvedConnectionRouteSegment[] = [];
  for (const segment of definition.segments) {
    const resolvedSegment = resolveSegment(segment, anchorPositions);
    if (resolvedSegment === null) {
      return null;
    }
    segments.push(resolvedSegment);
  }

  return { path, segments };
}

function validateRoutePoints(
  points: readonly ConnectionEndpoint[],
  nonConnectionNeighbors: readonly string[],
  connectionZoneIds: ReadonlySet<string>,
  zoneById: ReadonlyMap<string, PresentationZoneNode>,
  positions: ReadonlyMap<string, Position>,
  anchorPositions: ReadonlyMap<string, Position> | undefined,
): readonly ResolvedConnectionPoint[] | null {
  const resolvedPath: ResolvedConnectionPoint[] = [];
  const neighborSet = new Set(nonConnectionNeighbors);

  for (const point of points) {
    const resolvedPoint = resolveConfiguredEndpoint(
      point,
      neighborSet,
      connectionZoneIds,
      zoneById,
      positions,
      anchorPositions,
    );
    if (resolvedPoint === null) {
      return null;
    }
    resolvedPath.push(resolvedPoint);
  }

  if (resolvedPath.length < 2) {
    return null;
  }

  for (let index = 1; index < resolvedPath.length; index += 1) {
    const previous = resolvedPath[index - 1];
    const current = resolvedPath[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      previous.kind === current.kind &&
      previous.id === current.id
    ) {
      return null;
    }
  }

  return resolvedPath;
}

function resolveConfiguredEndpoint(
  endpoint: ConnectionEndpoint,
  neighborSet: ReadonlySet<string>,
  connectionZoneIds: ReadonlySet<string>,
  zoneById: ReadonlyMap<string, PresentationZoneNode>,
  positions: ReadonlyMap<string, Position>,
  anchorPositions: ReadonlyMap<string, Position> | undefined,
): ResolvedConnectionPoint | null {
  if (endpoint.kind === 'zone') {
    if (!neighborSet.has(endpoint.zoneId) || connectionZoneIds.has(endpoint.zoneId) || !zoneById.has(endpoint.zoneId)) {
      return null;
    }

    const position = positions.get(endpoint.zoneId);
    if (position === undefined) {
      return null;
    }

    return {
      kind: 'zone',
      id: endpoint.zoneId,
      position,
    };
  }

  const position = anchorPositions?.get(endpoint.anchorId);
  if (position === undefined) {
    return null;
  }
  return {
    kind: 'anchor',
    id: endpoint.anchorId,
    position,
  };
}

function resolveSegment(
  segment: ConnectionRouteSegment,
  anchorPositions: ReadonlyMap<string, Position> | undefined,
): ResolvedConnectionRouteSegment | null {
  if (segment.kind === 'straight') {
    return { kind: 'straight' };
  }

  const controlPoint = resolveControlPoint(segment.control, anchorPositions);
  if (controlPoint === null) {
    return null;
  }

  return {
    kind: 'quadratic',
    controlPoint,
  };
}

function resolveControlPoint(
  control: ConnectionRouteControl,
  anchorPositions: ReadonlyMap<string, Position> | undefined,
): ResolvedConnectionRouteControlPoint | null {
  if (control.kind === 'position') {
    return {
      kind: 'position',
      id: null,
      position: { x: control.x, y: control.y },
    };
  }

  const position = anchorPositions?.get(control.anchorId);
  if (position === undefined) {
    return null;
  }

  return {
    kind: 'anchor',
    id: control.anchorId,
    position,
  };
}

function resolveZoneEndpoints(
  endpointZoneIds: readonly [string, string],
  positions: ReadonlyMap<string, Position>,
): readonly [ResolvedConnectionPoint, ResolvedConnectionPoint] | null {
  const [left, right] = endpointZoneIds;
  const leftPosition = positions.get(left);
  const rightPosition = positions.get(right);
  if (leftPosition === undefined || rightPosition === undefined) {
    return null;
  }
  return [
    { kind: 'zone', id: left, position: leftPosition },
    { kind: 'zone', id: right, position: rightPosition },
  ];
}

function resolveJunctions(
  routes: readonly ConnectionRouteNode[],
): readonly JunctionNode[] {
  const routeIdsByAnchorId = new Map<string, Set<string>>();
  const anchorPositionById = new Map<string, Position>();

  for (const route of routes) {
    const seenAnchorIds = new Set<string>();
    for (const point of route.path) {
      if (point.kind !== 'anchor' || seenAnchorIds.has(point.id)) {
        continue;
      }

      seenAnchorIds.add(point.id);
      anchorPositionById.set(point.id, point.position);
      let routeIds = routeIdsByAnchorId.get(point.id);
      if (routeIds === undefined) {
        routeIds = new Set<string>();
        routeIdsByAnchorId.set(point.id, routeIds);
      }
      routeIds.add(route.zoneId);
    }
  }

  const junctions: JunctionNode[] = [];
  for (const [anchorId, routeIds] of routeIdsByAnchorId) {
    if (routeIds.size < 2) {
      continue;
    }

    const position = anchorPositionById.get(anchorId);
    if (position === undefined) {
      continue;
    }

    junctions.push({
      id: `junction:anchor:${anchorId}`,
      connectionIds: [...routeIds].sort(compareStrings),
      position,
    });
  }

  return junctions.sort((left, right) => left.id.localeCompare(right.id));
}

function sortPair(left: string, right: string): readonly [string, string] {
  return left.localeCompare(right) <= 0 ? [left, right] : [right, left];
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}
