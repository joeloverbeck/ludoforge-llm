import type { Diagnostic } from './diagnostics.js';
import { RouteGraphPayloadSchema } from './schemas.js';
import type { RouteGraphPayload } from './types.js';

export interface RouteGraphProvider {
  readonly defaultMaxHops: number;
  adjacent(a: string, b: string, routeClass?: string): boolean;
  reachable(a: string, b: string, routeClass?: string, maxHops?: number): boolean;
  serialize(): RouteGraphProviderSnapshot;
}

export interface RouteGraphProviderSnapshot {
  readonly defaultMaxHops: number;
  readonly adjacencyByClass: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
}

export interface RouteGraphDiagnosticContext {
  readonly assetPath?: string;
  readonly entityId?: string;
  readonly pathPrefix?: string;
}

const ANY_ROUTE_CLASS = '*';

export function compileRouteGraphProvider(payload: RouteGraphPayload): RouteGraphProvider {
  const adjacencyByClass = buildAdjacencyByClass(payload);
  const snapshot = materializeSnapshot(payload.defaultMaxHops, adjacencyByClass);

  return {
    defaultMaxHops: payload.defaultMaxHops,
    adjacent(a, b, routeClass) {
      return adjacencyByClass.get(routeClass ?? ANY_ROUTE_CLASS)?.get(a)?.has(b) ?? false;
    },
    reachable(a, b, routeClass, maxHops) {
      return isReachable(adjacencyByClass.get(routeClass ?? ANY_ROUTE_CLASS), a, b, maxHops ?? payload.defaultMaxHops);
    },
    serialize() {
      return snapshot;
    },
  };
}

export function validateRouteGraphPayload(
  payload: unknown,
  context: RouteGraphDiagnosticContext = {},
): readonly Diagnostic[] {
  const parseResult = RouteGraphPayloadSchema.safeParse(payload);
  if (!parseResult.success) {
    return parseResult.error.issues.map((issue) => ({
      code: 'ROUTE_GRAPH_SCHEMA_INVALID',
      path: remapPayloadPath(issue.path.length > 0 ? `asset.payload.${issue.path.join('.')}` : 'asset.payload', context),
      severity: 'error' as const,
      message: issue.message,
      ...(context.assetPath === undefined ? {} : { assetPath: context.assetPath }),
      ...(context.entityId === undefined ? {} : { entityId: context.entityId }),
    }));
  }

  const routeGraph = parseResult.data as RouteGraphPayload;
  const diagnostics: Diagnostic[] = [];
  const routeClassIds = new Set<string>();
  routeGraph.routeClasses.forEach((routeClass, index) => {
    if (routeClassIds.has(routeClass.id)) {
      diagnostics.push(withContext({
        code: 'ROUTE_GRAPH_ROUTE_CLASS_DUPLICATE',
        path: `asset.payload.routeClasses[${index}].id`,
        severity: 'error',
        message: `Duplicate route class "${routeClass.id}" in routeGraph payload.`,
      }, context));
      return;
    }
    routeClassIds.add(routeClass.id);
  });

  routeGraph.edges.forEach((edge, edgeIndex) => {
    const edgeClassIds = new Set<string>();
    edge.classes.forEach((routeClassId, classIndex) => {
      if (edgeClassIds.has(routeClassId)) {
        diagnostics.push(withContext({
          code: 'ROUTE_GRAPH_EDGE_CLASS_DUPLICATE',
          path: `asset.payload.edges[${edgeIndex}].classes[${classIndex}]`,
          severity: 'error',
          message: `RouteGraph edge "${edge.from}" to "${edge.to}" repeats route class "${routeClassId}".`,
        }, context));
      }
      edgeClassIds.add(routeClassId);
      if (!routeClassIds.has(routeClassId)) {
        diagnostics.push(withContext({
          code: 'ROUTE_GRAPH_ROUTE_CLASS_UNRESOLVED',
          path: `asset.payload.edges[${edgeIndex}].classes[${classIndex}]`,
          severity: 'error',
          message: `RouteGraph edge "${edge.from}" to "${edge.to}" references unknown route class "${routeClassId}".`,
          alternatives: [...routeClassIds].sort(),
        }, context));
      }
    });
  });

  return diagnostics;
}

function buildAdjacencyByClass(payload: RouteGraphPayload): ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>> {
  const mutable = new Map<string, Map<string, Set<string>>>();
  mutable.set(ANY_ROUTE_CLASS, new Map());
  for (const routeClass of [...payload.routeClasses].sort((left, right) => compareStable(left.id, right.id))) {
    mutable.set(routeClass.id, new Map());
  }

  const sortedEdges = [...payload.edges].sort((left, right) => compareStable(edgeSortKey(left), edgeSortKey(right)));
  for (const edge of sortedEdges) {
    const classes = [...edge.classes].sort(compareStable);
    addUndirectedEdge(mutable.get(ANY_ROUTE_CLASS)!, edge.from, edge.to);
    for (const routeClass of classes) {
      const classAdjacency = mutable.get(routeClass);
      if (classAdjacency !== undefined) {
        addUndirectedEdge(classAdjacency, edge.from, edge.to);
      }
    }
  }

  return freezeAdjacency(mutable);
}

function addUndirectedEdge(adjacency: Map<string, Set<string>>, from: string, to: string): void {
  addDirectedEdge(adjacency, from, to);
  addDirectedEdge(adjacency, to, from);
}

function addDirectedEdge(adjacency: Map<string, Set<string>>, from: string, to: string): void {
  const neighbors = adjacency.get(from) ?? new Set<string>();
  neighbors.add(to);
  adjacency.set(from, neighbors);
}

function freezeAdjacency(source: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>): ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>> {
  const result = new Map<string, ReadonlyMap<string, ReadonlySet<string>>>();
  for (const [routeClass, adjacency] of [...source.entries()].sort(([left], [right]) => compareStable(left, right))) {
    const sortedAdjacency = new Map<string, ReadonlySet<string>>();
    for (const [zone, neighbors] of [...adjacency.entries()].sort(([left], [right]) => compareStable(left, right))) {
      sortedAdjacency.set(zone, new Set([...neighbors].sort(compareStable)));
    }
    result.set(routeClass, sortedAdjacency);
  }
  return result;
}

function isReachable(
  adjacency: ReadonlyMap<string, ReadonlySet<string>> | undefined,
  from: string,
  to: string,
  maxHops: number,
): boolean {
  if (adjacency === undefined || maxHops < 0) {
    return false;
  }
  if (from === to) {
    return true;
  }
  let frontier = [from];
  const visited = new Set([from]);
  for (let hops = 0; hops < maxHops; hops += 1) {
    const next: string[] = [];
    for (const zone of frontier) {
      for (const neighbor of adjacency.get(zone) ?? []) {
        if (neighbor === to) {
          return true;
        }
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return false;
}

function materializeSnapshot(
  defaultMaxHops: number,
  adjacencyByClass: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>,
): RouteGraphProviderSnapshot {
  const snapshot: Record<string, Record<string, readonly string[]>> = {};
  for (const [routeClass, adjacency] of adjacencyByClass) {
    snapshot[routeClass] = {};
    for (const [zone, neighbors] of adjacency) {
      snapshot[routeClass][zone] = [...neighbors];
    }
  }
  return { defaultMaxHops, adjacencyByClass: snapshot };
}

function edgeSortKey(edge: { readonly from: string; readonly to: string; readonly classes: readonly string[] }): string {
  const [left, right] = [edge.from, edge.to].sort(compareStable);
  return `${left}\u0000${right}\u0000${[...edge.classes].sort(compareStable).join('\u0000')}`;
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function withContext(diagnostic: Diagnostic, context: RouteGraphDiagnosticContext): Diagnostic {
  return {
    ...diagnostic,
    path: remapPayloadPath(diagnostic.path, context),
    ...(context.assetPath === undefined ? {} : { assetPath: context.assetPath }),
    ...(context.entityId === undefined ? {} : { entityId: context.entityId }),
  };
}

function remapPayloadPath(path: string, context: RouteGraphDiagnosticContext): string {
  const targetPrefix = context.pathPrefix ?? 'asset.payload';
  if (targetPrefix === 'asset.payload') {
    return path;
  }
  if (path === 'asset.payload') {
    return targetPrefix;
  }
  if (path.startsWith('asset.payload.')) {
    return `${targetPrefix}${path.slice('asset.payload'.length)}`;
  }
  if (path.startsWith('asset.payload[')) {
    return `${targetPrefix}${path.slice('asset.payload'.length)}`;
  }
  return path;
}
