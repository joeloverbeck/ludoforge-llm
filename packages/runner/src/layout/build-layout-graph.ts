import Graph from 'graphology';
import type { GameDef, ZoneDef } from '@ludoforge/engine/runtime';

import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import type { LayoutMode } from './layout-types.js';

interface PartitionedZones {
  readonly board: readonly ZoneDef[];
  readonly aux: readonly ZoneDef[];
}

export function resolveLayoutMode(def: GameDef, provider: VisualConfigProvider): LayoutMode {
  const hasAnyAdjacency = def.zones.some((zone) => zone.isInternal !== true && hasAdjacency(zone));
  return provider.getLayoutMode(hasAnyAdjacency);
}

export function partitionZones(def: GameDef): PartitionedZones {
  const board: ZoneDef[] = [];
  const aux: ZoneDef[] = [];

  for (const zone of def.zones) {
    if (zone.isInternal === true) {
      continue;
    }
    if (zone.zoneKind === 'board') {
      board.push(zone);
      continue;
    }

    if (zone.zoneKind === 'aux') {
      aux.push(zone);
      continue;
    }

    if (hasAdjacency(zone)) {
      board.push(zone);
      continue;
    }

    aux.push(zone);
  }

  return { board, aux };
}

export function buildLayoutGraph(boardZones: readonly ZoneDef[]): Graph {
  const graph = new Graph({
    type: 'undirected',
    multi: false,
    allowSelfLoops: false,
  });

  const boardZoneIDs = new Set<string>();
  for (const zone of boardZones) {
    boardZoneIDs.add(zone.id);
    if (!graph.hasNode(zone.id)) {
      graph.addNode(zone.id, {
        category: zone.category,
        attributes: zone.attributes,
      });
    }
  }

  const emittedPairs = new Set<string>();

  for (const zone of boardZones) {
    const sourceID = zone.id;
    for (const candidate of zone.adjacentTo ?? []) {
      const targetID = candidate.to;
      if (targetID === sourceID || !boardZoneIDs.has(targetID)) {
        continue;
      }

      const pairKey = sourceID < targetID
        ? `${sourceID}\u0000${targetID}`
        : `${targetID}\u0000${sourceID}`;

      if (emittedPairs.has(pairKey)) {
        continue;
      }

      emittedPairs.add(pairKey);
      graph.addUndirectedEdge(sourceID, targetID);
    }
  }

  return graph;
}

function hasAdjacency(zone: ZoneDef): boolean {
  return (zone.adjacentTo?.length ?? 0) > 0;
}
