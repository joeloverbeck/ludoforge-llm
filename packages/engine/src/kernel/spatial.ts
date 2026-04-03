import type { Diagnostic } from './diagnostics.js';
import type { RuntimeZoneId, ZoneId } from './branded.js';
import { evalCondition } from './eval-condition.js';
import type { ReadContext } from './eval-context.js';
import {
  buildZoneRuntimeIndex,
  externRuntimeZoneId,
  internRuntimeZoneId,
  type ZoneRuntimeIndex,
} from './runtime-zone-index.js';
import type { ConditionAST, GameDef, GameState, Token, ZoneDef } from './types.js';

export interface AdjacencyGraph {
  readonly neighbors: Readonly<Record<string, readonly ZoneId[]>>;
  readonly neighborSets: Readonly<Record<string, ReadonlySet<ZoneId>>>;
  readonly runtimeNeighbors: Readonly<Record<string, readonly RuntimeZoneId[]>>;
  readonly runtimeNeighborSets: Readonly<Record<string, ReadonlySet<RuntimeZoneId>>>;
  readonly zoneRuntimeIndex: ZoneRuntimeIndex;
  readonly zoneCount: number;
}

export interface ConnectedQueryOptions {
  readonly includeStart?: boolean;
  readonly allowTargetOutsideVia?: boolean;
  readonly maxDepth?: number;
}

type AdjacencyGraphSource = GameDef | readonly ZoneDef[];

const adjacencyGraphCache = new WeakMap<object, AdjacencyGraph>();

function adjacencyGraphCacheKey(source: AdjacencyGraphSource): object {
  return source;
}

function getZoneRuntimeIndex(source: AdjacencyGraphSource): ZoneRuntimeIndex {
  return buildZoneRuntimeIndex(source);
}

export function buildAdjacencyGraph(source: AdjacencyGraphSource): AdjacencyGraph {
  const cacheKey = adjacencyGraphCacheKey(source);
  const cached = adjacencyGraphCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const zoneRuntimeIndex = getZoneRuntimeIndex(source);
  const runtimeZoneIds = new Set<RuntimeZoneId>(zoneRuntimeIndex.zoneIds);
  const normalizedNeighbors = new Map<RuntimeZoneId, Set<RuntimeZoneId>>();

  zoneRuntimeIndex.zones.forEach((zone) => {
    normalizedNeighbors.set(zone.id, new Set<RuntimeZoneId>());
  });

  zoneRuntimeIndex.zones.forEach((zone) => {
    zone.adjacentTo?.forEach((adjacency) => {
      const adjacentZoneId = adjacency.to;
      if (adjacentZoneId === zone.id || !runtimeZoneIds.has(adjacentZoneId)) {
        return;
      }

      normalizedNeighbors.get(zone.id)?.add(adjacentZoneId);
      if (adjacency.direction !== 'unidirectional') {
        normalizedNeighbors.get(adjacentZoneId)?.add(zone.id);
      }
    });
  });

  const sortedZoneIds = [...normalizedNeighbors.keys()].sort((left, right) => left - right);
  const neighbors: Record<string, readonly ZoneId[]> = {};
  const neighborSets: Record<string, ReadonlySet<ZoneId>> = {};
  const runtimeNeighbors: Record<string, readonly RuntimeZoneId[]> = {};
  const runtimeNeighborSets: Record<string, ReadonlySet<RuntimeZoneId>> = {};

  sortedZoneIds.forEach((runtimeZoneId) => {
    const canonicalZoneId = externRuntimeZoneId(runtimeZoneId, zoneRuntimeIndex);
    const entries = normalizedNeighbors.get(runtimeZoneId) ?? new Set<RuntimeZoneId>();
    const sortedEntries = [...entries].sort((left, right) => left - right);
    runtimeNeighbors[canonicalZoneId] = sortedEntries;
    runtimeNeighborSets[canonicalZoneId] = entries;
    const canonicalNeighbors = sortedEntries.map((neighborZoneId) => externRuntimeZoneId(neighborZoneId, zoneRuntimeIndex));
    neighbors[canonicalZoneId] = canonicalNeighbors;
    neighborSets[canonicalZoneId] = new Set(canonicalNeighbors);
  });

  const result: AdjacencyGraph = {
    neighbors,
    neighborSets,
    runtimeNeighbors,
    runtimeNeighborSets,
    zoneRuntimeIndex,
    zoneCount: zoneRuntimeIndex.zones.length,
  };
  adjacencyGraphCache.set(cacheKey, result);
  return result;
}

export function validateAdjacency(graph: AdjacencyGraph, zones: readonly ZoneDef[]): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const zoneSet = new Set(zones.map((zone) => zone.id));
  const zoneById = new Map(zones.map((zone) => [zone.id, zone] as const));

  zones.forEach((zone, zoneIndex) => {
    const seen = new Map<ZoneId, 'bidirectional' | 'unidirectional'>();
    const adjacentTo = zone.adjacentTo ?? [];

    for (let adjacentIndex = 1; adjacentIndex < adjacentTo.length; adjacentIndex += 1) {
      const previous = adjacentTo[adjacentIndex - 1];
      const current = adjacentTo[adjacentIndex];
      if (previous === undefined || current === undefined) {
        continue;
      }

      const previousDirection = previous.direction ?? 'bidirectional';
      const currentDirection = current.direction ?? 'bidirectional';
      if (
        previous.to.localeCompare(current.to) > 0
        || (previous.to === current.to && previousDirection.localeCompare(currentDirection) > 0)
      ) {
        diagnostics.push({
          code: 'SPATIAL_NEIGHBORS_UNSORTED',
          path: `zones[${zoneIndex}].adjacentTo[${adjacentIndex}].to`,
          severity: 'error',
          message: `Zone "${zone.id}" adjacentTo entries must be lexicographically sorted.`,
          suggestion: `Sort adjacentTo entries for "${zone.id}" in ascending lexicographic order.`,
        });
        break;
      }
    }

    adjacentTo.forEach((adjacency, adjacentIndex) => {
      const adjacentZoneId = adjacency.to;
      const path = `zones[${zoneIndex}].adjacentTo[${adjacentIndex}].to`;
      const directionPath = `zones[${zoneIndex}].adjacentTo[${adjacentIndex}].direction`;

      if (!zoneSet.has(adjacentZoneId)) {
        diagnostics.push({
          code: 'SPATIAL_DANGLING_ZONE_REF',
          path,
          severity: 'error',
          message: `Zone "${zone.id}" references unknown adjacent zone "${adjacentZoneId}".`,
          suggestion: `Use one of the declared zone ids for adjacentTo.`,
        });
        return;
      }

      if (adjacency.direction !== 'bidirectional' && adjacency.direction !== 'unidirectional') {
        diagnostics.push({
          code: 'SPATIAL_ADJACENCY_DIRECTION_REQUIRED',
          path: directionPath,
          severity: 'error',
          message: `Zone "${zone.id}" adjacency to "${adjacentZoneId}" must declare explicit direction.`,
          suggestion: 'Set adjacency.direction to "bidirectional" or "unidirectional".',
        });
        return;
      }

      if (adjacentZoneId === zone.id) {
        diagnostics.push({
          code: 'SPATIAL_SELF_LOOP',
          path,
          severity: 'error',
          message: `Zone "${zone.id}" cannot list itself in adjacentTo.`,
          suggestion: `Remove "${zone.id}" from its own adjacentTo list.`,
        });
      }

      const previousDirection = seen.get(adjacentZoneId);
      if (previousDirection !== undefined && previousDirection !== adjacency.direction) {
        diagnostics.push({
          code: 'SPATIAL_CONFLICTING_NEIGHBOR_DIRECTION',
          path: directionPath,
          severity: 'error',
          message: `Zone "${zone.id}" declares conflicting directions for adjacent zone "${adjacentZoneId}".`,
          suggestion: `Use a single direction for "${adjacentZoneId}" under zone "${zone.id}".`,
        });
      } else if (previousDirection !== undefined) {
        diagnostics.push({
          code: 'SPATIAL_DUPLICATE_NEIGHBOR',
          path,
          severity: 'warning',
          message: `Zone "${zone.id}" declares "${adjacentZoneId}" more than once in adjacentTo.`,
          suggestion: `Keep only one "${adjacentZoneId}" entry in adjacentTo.`,
        });
      } else {
        seen.set(adjacentZoneId, adjacency.direction);
      }

      if (adjacentZoneId === zone.id) {
        return;
      }

      if (adjacency.direction === 'unidirectional') {
        return;
      }

      const reverseDeclared = zoneById.get(adjacentZoneId)?.adjacentTo?.some((candidate) => candidate.to === zone.id) ?? false;
      if (!reverseDeclared) {
        diagnostics.push({
          code: 'SPATIAL_ASYMMETRIC_EDGE_NORMALIZED',
          path,
          severity: 'warning',
          message: `Zone "${zone.id}" lists "${adjacentZoneId}" in adjacentTo, but the reverse edge is missing and will be normalized at runtime.`,
          suggestion: `Add "${zone.id}" to "${adjacentZoneId}" adjacentTo for explicit symmetry.`,
        });
      }
    });

    const graphNeighbors = graph.neighbors[zone.id] ?? [];
    graphNeighbors.forEach((neighborId) => {
      if (!zoneSet.has(neighborId)) {
        diagnostics.push({
          code: 'SPATIAL_DANGLING_ZONE_REF',
          path: `zones[${zoneIndex}].adjacentTo`,
          severity: 'error',
          message: `Zone "${zone.id}" normalized neighbors include unknown zone "${neighborId}".`,
          suggestion: `Ensure all adjacentTo entries reference declared zones.`,
        });
      }
    });
  });

  return diagnostics;
}

function getNeighbors(graph: AdjacencyGraph, zone: ZoneId): readonly ZoneId[] {
  return graph.neighbors[String(zone)] ?? [];
}

function getRuntimeNeighbors(graph: AdjacencyGraph, zone: RuntimeZoneId): readonly RuntimeZoneId[] {
  const canonicalZoneId = externRuntimeZoneId(zone, graph.zoneRuntimeIndex);
  return graph.runtimeNeighbors[canonicalZoneId] ?? [];
}

function normalizeMaxDepth(maxDepth: number | undefined, graph: AdjacencyGraph): number {
  if (maxDepth === undefined) {
    return Math.max(0, graph.zoneCount - 1);
  }

  if (!Number.isFinite(maxDepth)) {
    return 0;
  }

  return Math.max(0, Math.floor(maxDepth));
}

function evaluateVia(
  via: ConditionAST | undefined,
  candidateZone: ZoneId,
  state: GameState,
  evalCtx: ReadContext,
): boolean {
  if (via === undefined) {
    return true;
  }

  return evalCondition(via, {
    ...evalCtx,
    state,
    bindings: {
      ...evalCtx.bindings,
      $zone: candidateZone,
    },
  });
}

export function queryAdjacentZones(graph: AdjacencyGraph, zone: ZoneId): readonly ZoneId[] {
  return [...getNeighbors(graph, zone)];
}

export function queryTokensInAdjacentZones(
  graph: AdjacencyGraph,
  state: GameState,
  zone: ZoneId,
): readonly Token[] {
  const runtimeZoneId = internRuntimeZoneId(zone, graph.zoneRuntimeIndex);
  if (runtimeZoneId === undefined) {
    return [];
  }
  const tokens: Token[] = [];
  for (const neighborZone of getRuntimeNeighbors(graph, runtimeZoneId)) {
    const zoneTokens = state.zones[externRuntimeZoneId(neighborZone, graph.zoneRuntimeIndex)] ?? [];
    tokens.push(...zoneTokens);
  }
  return tokens;
}

export function queryConnectedZones(
  graph: AdjacencyGraph,
  state: GameState,
  zone: ZoneId,
  evalCtx: ReadContext,
  via?: ConditionAST,
  options?: ConnectedQueryOptions,
): readonly ZoneId[] {
  const includeStart = options?.includeStart ?? false;
  const allowTargetOutsideVia = options?.allowTargetOutsideVia ?? false;
  const maxDepth = normalizeMaxDepth(options?.maxDepth, graph);
  const startZone = internRuntimeZoneId(zone, graph.zoneRuntimeIndex);
  if (startZone === undefined) {
    return [];
  }

  const discovered: ZoneId[] = [];
  const visited = new Set<RuntimeZoneId>([startZone]);
  const queue: Array<{ readonly zone: RuntimeZoneId; readonly depth: number }> = [{ zone: startZone, depth: 0 }];
  let cursor = 0;

  if (includeStart) {
    discovered.push(zone);
  }

  while (cursor < queue.length) {
    const entry = queue[cursor];
    cursor += 1;

    if (entry === undefined || entry.depth >= maxDepth) {
      continue;
    }

    for (const neighborZone of getRuntimeNeighbors(graph, entry.zone)) {
      if (visited.has(neighborZone)) {
        continue;
      }

      const canonicalNeighborZone = externRuntimeZoneId(neighborZone, graph.zoneRuntimeIndex);
      const passesVia = evaluateVia(via, canonicalNeighborZone, state, evalCtx);
      if (!passesVia && !allowTargetOutsideVia) {
        continue;
      }

      visited.add(neighborZone);
      discovered.push(canonicalNeighborZone);
      if (passesVia) {
        queue.push({ zone: neighborZone, depth: entry.depth + 1 });
      }
    }
  }

  return discovered;
}
