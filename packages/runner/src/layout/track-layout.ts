import type { GameDef } from '@ludoforge/engine/runtime';

import { buildLayoutGraph } from './build-layout-graph.js';
import { centerOnOrigin, computeBounds, EMPTY_BOUNDS, type MutablePosition, selectPrimaryLayoutZones } from './layout-helpers.js';
import type { LayoutResult } from './layout-types.js';

const TRACK_SPACING = 120;
const TRACK_WRAP_THRESHOLD = 15;
const TRACK_WRAP_COLUMNS = 10;
const TRACK_COMPONENT_SPACING = 280;

export function computeTrackLayout(def: GameDef): LayoutResult {
  const trackZones = selectPrimaryLayoutZones(def);
  const graph = buildLayoutGraph(trackZones);
  const nodeIDs = [...graph.nodes()].sort((left, right) => left.localeCompare(right));

  if (nodeIDs.length === 0) {
    return {
      positions: new Map(),
      mode: 'track',
      boardBounds: EMPTY_BOUNDS,
    };
  }

  const positions = new Map<string, MutablePosition>();
  const components = collectComponents(graph, nodeIDs);

  for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
    const component = components[componentIndex];
    if (component === undefined) {
      continue;
    }

    const ordered = traverseTrackComponent(graph, component);
    const baseY = componentIndex * TRACK_COMPONENT_SPACING;
    const columns = ordered.length <= TRACK_WRAP_THRESHOLD ? ordered.length : TRACK_WRAP_COLUMNS;

    for (let index = 0; index < ordered.length; index += 1) {
      const nodeID = ordered[index];
      if (nodeID === undefined) {
        continue;
      }

      const normalizedColumns = Math.max(1, columns);
      const row = Math.floor(index / normalizedColumns);
      const columnInRow = index % normalizedColumns;
      const serpentineColumn = row % 2 === 0 ? columnInRow : (normalizedColumns - 1 - columnInRow);
      positions.set(nodeID, {
        x: serpentineColumn * TRACK_SPACING,
        y: baseY + (row * TRACK_SPACING),
      });
    }
  }

  centerOnOrigin(positions);
  return {
    positions,
    mode: 'track',
    boardBounds: computeBounds(positions),
  };
}

function collectComponents(
  graph: ReturnType<typeof buildLayoutGraph>,
  sortedNodeIDs: readonly string[],
): readonly (readonly string[])[] {
  const components: string[][] = [];
  const seen = new Set<string>();

  for (const nodeID of sortedNodeIDs) {
    if (seen.has(nodeID)) {
      continue;
    }

    const queue = [nodeID];
    const component: string[] = [];
    seen.add(nodeID);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        continue;
      }

      component.push(current);
      const neighbors = [...graph.neighbors(current)].sort((left, right) => left.localeCompare(right));
      for (const neighbor of neighbors) {
        if (seen.has(neighbor)) {
          continue;
        }
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }

    component.sort((left, right) => left.localeCompare(right));
    components.push(component);
  }

  return components;
}

function traverseTrackComponent(
  graph: ReturnType<typeof buildLayoutGraph>,
  component: readonly string[],
): readonly string[] {
  const localNodeSet = new Set(component);
  const endpointCandidates = component
    .filter((nodeID) => countComponentNeighbors(graph, localNodeSet, nodeID) === 1)
    .sort((left, right) => left.localeCompare(right));
  const start = endpointCandidates[0] ?? component[0];
  if (start === undefined) {
    return [];
  }

  const ordered: string[] = [];
  const queue = [start];
  const localVisited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || localVisited.has(current)) {
      continue;
    }
    localVisited.add(current);
    ordered.push(current);

    const neighbors = [...graph.neighbors(current)]
      .filter((neighbor) => localNodeSet.has(neighbor) && !localVisited.has(neighbor))
      .sort((left, right) => left.localeCompare(right));

    for (const neighbor of neighbors) {
      queue.push(neighbor);
    }
  }

  if (ordered.length === component.length) {
    return ordered;
  }

  const remaining = component
    .filter((nodeID) => !localVisited.has(nodeID))
    .sort((left, right) => left.localeCompare(right));
  for (const nodeID of remaining) {
    ordered.push(nodeID);
  }

  return ordered;
}

function countComponentNeighbors(
  graph: ReturnType<typeof buildLayoutGraph>,
  componentNodeIDs: ReadonlySet<string>,
  nodeID: string,
): number {
  return [...graph.neighbors(nodeID)].filter((neighbor) => componentNodeIDs.has(neighbor)).length;
}
