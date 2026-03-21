import type { Position } from '../canvas/geometry.js';
import type {
  PresentationAdjacencyNode,
  PresentationZoneNode,
} from './presentation-scene.js';

export interface ConnectionRouteNode {
  readonly zoneId: string;
  readonly displayName: string;
  readonly endpointZoneIds: readonly [string, string];
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
  readonly endpointOverrides?: ReadonlyMap<string, readonly [string, string]>;
}

export function resolveConnectionRoutes(
  options: ResolveConnectionRoutesOptions,
): ConnectionRouteResolution {
  const { zones, adjacencies, positions, endpointOverrides } = options;
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
    const endpointZoneIds = resolveEndpointZoneIds(
      zone.id,
      nonConnectionNeighbors,
      connectionZoneIds,
      endpointOverrides,
      zoneById,
    );

    if (endpointZoneIds === null) {
      continue;
    }

    const endpointSet = new Set(endpointZoneIds);
    const touchingZoneIds = nonConnectionNeighbors
      .filter((neighborId) => !endpointSet.has(neighborId))
      .sort(compareStrings);

    resolvedRoutes.push({
      zoneId: zone.id,
      displayName: zone.displayName,
      endpointZoneIds,
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

function resolveEndpointZoneIds(
  zoneId: string,
  nonConnectionNeighbors: readonly string[],
  connectionZoneIds: ReadonlySet<string>,
  endpointOverrides: ReadonlyMap<string, readonly [string, string]> | undefined,
  zoneById: ReadonlyMap<string, PresentationZoneNode>,
): readonly [string, string] | null {
  const override = endpointOverrides?.get(zoneId);
  if (override !== undefined) {
    return validateEndpointPair(override, nonConnectionNeighbors, connectionZoneIds, zoneById);
  }

  if (nonConnectionNeighbors.length === 2) {
    const left = nonConnectionNeighbors[0];
    const right = nonConnectionNeighbors[1];
    if (left === undefined || right === undefined) {
      return null;
    }
    return sortPair(left, right);
  }

  const parsedMatch = resolveEndpointsByZoneIdParsing(zoneId, nonConnectionNeighbors);
  if (parsedMatch !== null) {
    return parsedMatch;
  }

  return null;
}

function validateEndpointPair(
  endpoints: readonly [string, string],
  nonConnectionNeighbors: readonly string[],
  connectionZoneIds: ReadonlySet<string>,
  zoneById: ReadonlyMap<string, PresentationZoneNode>,
): readonly [string, string] | null {
  const [left, right] = endpoints;
  if (left === right) {
    return null;
  }
  const neighborSet = new Set(nonConnectionNeighbors);
  if (!neighborSet.has(left) || !neighborSet.has(right)) {
    return null;
  }
  if (connectionZoneIds.has(left) || connectionZoneIds.has(right)) {
    return null;
  }
  if (!zoneById.has(left) || !zoneById.has(right)) {
    return null;
  }
  return [left, right];
}

function resolveEndpointsByZoneIdParsing(
  zoneId: string,
  nonConnectionNeighbors: readonly string[],
): readonly [string, string] | null {
  const normalizedZoneId = normalizeZoneId(zoneId);
  const matches = nonConnectionNeighbors.filter((neighborId) => {
    const normalizedNeighborId = normalizeZoneId(neighborId);
    return new RegExp(`(^|-)${escapeRegExp(normalizedNeighborId)}(-|$)`).test(normalizedZoneId);
  });

  if (matches.length !== 2) {
    return null;
  }

  const left = matches[0];
  const right = matches[1];
  if (left === undefined || right === undefined) {
    return null;
  }
  return sortPair(left, right);
}

function normalizeZoneId(zoneId: string): string {
  return zoneId
    .replace(/:[^:]+$/, '')
    .toLowerCase();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
