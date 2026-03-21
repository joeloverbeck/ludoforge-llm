import type { Position } from '../canvas/geometry.js';
import type { ConnectionEndpointPair, ConnectionPath } from '../config/visual-config-types.js';
import type {
  PresentationAdjacencyNode,
  PresentationZoneNode,
} from './presentation-scene.js';

export interface ResolvedConnectionPoint {
  readonly kind: 'zone' | 'anchor';
  readonly id: string;
  readonly position: Position;
}

export interface ConnectionRouteNode {
  readonly zoneId: string;
  readonly displayName: string;
  readonly path: readonly ResolvedConnectionPoint[];
  readonly touchingZoneIds: readonly string[];
  readonly connectedConnectionIds: readonly string[];
  readonly connectionStyleKey: string | null;
  readonly zone: PresentationZoneNode;
}

export interface JunctionNode {
  readonly id: string;
  readonly connectionIds: readonly [string, string];
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
  readonly endpointDefinitions?: ReadonlyMap<string, ConnectionEndpointPair>;
  readonly pathDefinitions?: ReadonlyMap<string, ConnectionPath>;
  readonly anchorPositions?: ReadonlyMap<string, Position>;
}

export function resolveConnectionRoutes(
  options: ResolveConnectionRoutesOptions,
): ConnectionRouteResolution {
  const { zones, adjacencies, positions, endpointDefinitions, pathDefinitions, anchorPositions } = options;
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
    const path = resolveRoutePath(
      zone.id,
      nonConnectionNeighbors,
      connectionZoneIds,
      endpointDefinitions,
      pathDefinitions,
      anchorPositions,
      positions,
      zoneById,
    );

    if (path === null) {
      continue;
    }

    const pathZoneIds = path
      .filter((point): point is ResolvedConnectionPoint & { kind: 'zone' } => point.kind === 'zone')
      .map((point) => point.id);
    const pathZoneIdSet = new Set(pathZoneIds);
    const touchingZoneIds = nonConnectionNeighbors
      .filter((neighborId) => !pathZoneIdSet.has(neighborId))
      .sort(compareStrings);

    resolvedRoutes.push({
      zoneId: zone.id,
      displayName: zone.displayName,
      path,
      touchingZoneIds,
      connectedConnectionIds,
      connectionStyleKey: zone.visual.connectionStyleKey,
      zone,
    });
  }

  const resolvedRouteIds = new Set(resolvedRoutes.map((route) => route.zoneId));
  const junctions = resolveJunctions(resolvedRoutes, positions, resolvedRouteIds);

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

function resolveRoutePath(
  zoneId: string,
  nonConnectionNeighbors: readonly string[],
  connectionZoneIds: ReadonlySet<string>,
  endpointDefinitions: ReadonlyMap<string, ConnectionEndpointPair> | undefined,
  pathDefinitions: ReadonlyMap<string, ConnectionPath> | undefined,
  anchorPositions: ReadonlyMap<string, Position> | undefined,
  positions: ReadonlyMap<string, Position>,
  zoneById: ReadonlyMap<string, PresentationZoneNode>,
): readonly ResolvedConnectionPoint[] | null {
  const explicitPath = pathDefinitions?.get(zoneId);
  if (explicitPath !== undefined) {
    return validateConnectionPath(explicitPath, zoneById, positions, anchorPositions);
  }

  const definition = endpointDefinitions?.get(zoneId);
  if (definition !== undefined) {
    return validateEndpointDefinition(
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

  return resolveZoneEndpoints(sortPair(left, right), positions);
}

function validateEndpointDefinition(
  endpoints: ConnectionEndpointPair,
  nonConnectionNeighbors: readonly string[],
  connectionZoneIds: ReadonlySet<string>,
  zoneById: ReadonlyMap<string, PresentationZoneNode>,
  positions: ReadonlyMap<string, Position>,
  anchorPositions: ReadonlyMap<string, Position> | undefined,
): readonly [ResolvedConnectionPoint, ResolvedConnectionPoint] | null {
  const [left, right] = endpoints;
  const leftResolved = resolveConfiguredEndpoint(
    left,
    nonConnectionNeighbors,
    connectionZoneIds,
    zoneById,
    positions,
    anchorPositions,
  );
  const rightResolved = resolveConfiguredEndpoint(
    right,
    nonConnectionNeighbors,
    connectionZoneIds,
    zoneById,
    positions,
    anchorPositions,
  );

  if (leftResolved === null || rightResolved === null) {
    return null;
  }
  if (leftResolved.kind === rightResolved.kind && leftResolved.id === rightResolved.id) {
    return null;
  }

  return [leftResolved, rightResolved];
}

function resolveConfiguredEndpoint(
  endpoint: ConnectionEndpointPair[number],
  nonConnectionNeighbors: readonly string[],
  connectionZoneIds: ReadonlySet<string>,
  zoneById: ReadonlyMap<string, PresentationZoneNode>,
  positions: ReadonlyMap<string, Position>,
  anchorPositions: ReadonlyMap<string, Position> | undefined,
): ResolvedConnectionPoint | null {
  if (endpoint.kind === 'zone') {
    const neighborSet = new Set(nonConnectionNeighbors);
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

function validateConnectionPath(
  path: ConnectionPath,
  zoneById: ReadonlyMap<string, PresentationZoneNode>,
  positions: ReadonlyMap<string, Position>,
  anchorPositions: ReadonlyMap<string, Position> | undefined,
): readonly ResolvedConnectionPoint[] | null {
  const resolvedPath: ResolvedConnectionPoint[] = [];

  for (const point of path) {
    const resolvedPoint = resolvePathPoint(point, zoneById, positions, anchorPositions);
    if (resolvedPoint === null) {
      return null;
    }
    resolvedPath.push(resolvedPoint);
  }

  return resolvedPath.length >= 2 ? resolvedPath : null;
}

function resolvePathPoint(
  point: ConnectionPath[number],
  zoneById: ReadonlyMap<string, PresentationZoneNode>,
  positions: ReadonlyMap<string, Position>,
  anchorPositions: ReadonlyMap<string, Position> | undefined,
): ResolvedConnectionPoint | null {
  if (point.kind === 'zone') {
    if (!zoneById.has(point.zoneId)) {
      return null;
    }

    const position = positions.get(point.zoneId);
    if (position === undefined) {
      return null;
    }

    return {
      kind: 'zone',
      id: point.zoneId,
      position,
    };
  }

  const position = anchorPositions?.get(point.anchorId);
  if (position === undefined) {
    return null;
  }

  return {
    kind: 'anchor',
    id: point.anchorId,
    position,
  };
}

function resolveJunctions(
  routes: readonly ConnectionRouteNode[],
  positions: ReadonlyMap<string, Position>,
  resolvedRouteIds: ReadonlySet<string>,
): readonly JunctionNode[] {
  const routeById = new Map(routes.map((route) => [route.zoneId, route]));
  const junctions: JunctionNode[] = [];
  const seenPairs = new Set<string>();

  for (const route of routes) {
    for (const connectedRouteId of route.connectedConnectionIds) {
      if (!resolvedRouteIds.has(connectedRouteId)) {
        continue;
      }

      const pair = sortPair(route.zoneId, connectedRouteId);
      const pairKey = `${pair[0]}::${pair[1]}`;
      if (seenPairs.has(pairKey)) {
        continue;
      }

      const leftPosition = positions.get(pair[0]);
      const rightPosition = positions.get(pair[1]);
      if (leftPosition === undefined || rightPosition === undefined) {
        continue;
      }
      if (!routeById.has(pair[0]) || !routeById.has(pair[1])) {
        continue;
      }

      seenPairs.add(pairKey);
      junctions.push({
        id: `junction:${pairKey}`,
        connectionIds: pair,
        position: {
          x: (leftPosition.x + rightPosition.x) / 2,
          y: (leftPosition.y + rightPosition.y) / 2,
        },
      });
    }
  }

  return junctions.sort((left, right) => left.id.localeCompare(right.id));
}

function sortPair(left: string, right: string): readonly [string, string] {
  return left.localeCompare(right) <= 0 ? [left, right] : [right, left];
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}
