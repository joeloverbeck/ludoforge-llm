import type { Diagnostic } from './diagnostics.js';
import type { ZoneId } from './branded.js';
import { evalCondition } from './eval-condition.js';
import type { EvalContext } from './eval-context.js';
import type { ConditionAST, GameState, Token, ZoneDef } from './types.js';

export interface AdjacencyGraph {
  readonly neighbors: Readonly<Record<string, readonly ZoneId[]>>;
  readonly zoneCount: number;
}

export interface ConnectedQueryOptions {
  readonly includeStart?: boolean;
  readonly maxDepth?: number;
}

export function buildAdjacencyGraph(zones: readonly ZoneDef[]): AdjacencyGraph {
  const zoneIds = new Set<ZoneId>(zones.map((zone) => zone.id));
  const normalizedNeighbors = new Map<ZoneId, Set<ZoneId>>();

  zones.forEach((zone) => {
    normalizedNeighbors.set(zone.id, new Set<ZoneId>());
  });

  zones.forEach((zone) => {
    zone.adjacentTo?.forEach((adjacentZoneId) => {
      if (adjacentZoneId === zone.id || !zoneIds.has(adjacentZoneId)) {
        return;
      }

      normalizedNeighbors.get(zone.id)?.add(adjacentZoneId);
      normalizedNeighbors.get(adjacentZoneId)?.add(zone.id);
    });
  });

  const sortedZoneIds = [...normalizedNeighbors.keys()].sort((left, right) => left.localeCompare(right));
  const neighbors: Record<string, readonly ZoneId[]> = {};

  sortedZoneIds.forEach((zoneId) => {
    const entries = normalizedNeighbors.get(zoneId) ?? new Set<ZoneId>();
    neighbors[zoneId] = [...entries].sort((left, right) => left.localeCompare(right));
  });

  return {
    neighbors,
    zoneCount: zones.length,
  };
}

export function validateAdjacency(graph: AdjacencyGraph, zones: readonly ZoneDef[]): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const zoneSet = new Set(zones.map((zone) => zone.id));
  const zoneById = new Map(zones.map((zone) => [zone.id, zone] as const));

  zones.forEach((zone, zoneIndex) => {
    const seen = new Set<ZoneId>();
    const adjacentTo = zone.adjacentTo ?? [];

    for (let adjacentIndex = 1; adjacentIndex < adjacentTo.length; adjacentIndex += 1) {
      const previous = adjacentTo[adjacentIndex - 1];
      const current = adjacentTo[adjacentIndex];
      if (previous === undefined || current === undefined) {
        continue;
      }

      if (previous.localeCompare(current) > 0) {
        diagnostics.push({
          code: 'SPATIAL_NEIGHBORS_UNSORTED',
          path: `zones[${zoneIndex}].adjacentTo[${adjacentIndex}]`,
          severity: 'error',
          message: `Zone "${zone.id}" adjacentTo entries must be lexicographically sorted.`,
          suggestion: `Sort adjacentTo entries for "${zone.id}" in ascending lexicographic order.`,
        });
        break;
      }
    }

    adjacentTo.forEach((adjacentZoneId, adjacentIndex) => {
      const path = `zones[${zoneIndex}].adjacentTo[${adjacentIndex}]`;

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

      if (adjacentZoneId === zone.id) {
        diagnostics.push({
          code: 'SPATIAL_SELF_LOOP',
          path,
          severity: 'error',
          message: `Zone "${zone.id}" cannot list itself in adjacentTo.`,
          suggestion: `Remove "${zone.id}" from its own adjacentTo list.`,
        });
      }

      if (seen.has(adjacentZoneId)) {
        diagnostics.push({
          code: 'SPATIAL_DUPLICATE_NEIGHBOR',
          path,
          severity: 'warning',
          message: `Zone "${zone.id}" declares "${adjacentZoneId}" more than once in adjacentTo.`,
          suggestion: `Keep only one "${adjacentZoneId}" entry in adjacentTo.`,
        });
      } else {
        seen.add(adjacentZoneId);
      }

      if (adjacentZoneId === zone.id) {
        return;
      }

      const reverseDeclared = zoneById.get(adjacentZoneId)?.adjacentTo?.includes(zone.id) ?? false;
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
  evalCtx: EvalContext,
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
  const tokens: Token[] = [];
  for (const neighborZone of getNeighbors(graph, zone)) {
    const zoneTokens = state.zones[String(neighborZone)] ?? [];
    tokens.push(...zoneTokens);
  }
  return tokens;
}

export function queryConnectedZones(
  graph: AdjacencyGraph,
  state: GameState,
  zone: ZoneId,
  evalCtx: EvalContext,
  via?: ConditionAST,
  options?: ConnectedQueryOptions,
): readonly ZoneId[] {
  const includeStart = options?.includeStart ?? false;
  const maxDepth = normalizeMaxDepth(options?.maxDepth, graph);

  const discovered: ZoneId[] = [];
  const visited = new Set<ZoneId>([zone]);
  const queue: Array<{ readonly zone: ZoneId; readonly depth: number }> = [{ zone, depth: 0 }];
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

    for (const neighborZone of getNeighbors(graph, entry.zone)) {
      if (visited.has(neighborZone)) {
        continue;
      }

      if (!evaluateVia(via, neighborZone, state, evalCtx)) {
        continue;
      }

      visited.add(neighborZone);
      discovered.push(neighborZone);
      queue.push({ zone: neighborZone, depth: entry.depth + 1 });
    }
  }

  return discovered;
}
