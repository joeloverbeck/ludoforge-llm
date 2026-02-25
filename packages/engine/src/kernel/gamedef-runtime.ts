import type { AdjacencyGraph } from './spatial.js';
import { buildAdjacencyGraph } from './spatial.js';
import type { RuntimeTableIndex } from './runtime-table-index.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import type { ZobristTable, GameDef } from './types.js';
import { createZobristTable } from './zobrist.js';

/**
 * Pre-computed, immutable runtime structures derived from a GameDef.
 * These are pure functions of the definition and never change during a game.
 * Creating this once and threading it through kernel calls avoids redundant
 * rebuilds of the adjacency graph, runtime table index, and Zobrist table
 * on every move.
 */
export interface GameDefRuntime {
  readonly adjacencyGraph: AdjacencyGraph;
  readonly runtimeTableIndex: RuntimeTableIndex;
  readonly zobristTable: ZobristTable;
}

export function createGameDefRuntime(def: GameDef): GameDefRuntime {
  return {
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    runtimeTableIndex: buildRuntimeTableIndex(def),
    zobristTable: createZobristTable(def),
  };
}
