import type { AdjacencyGraph } from './spatial.js';
import { buildAdjacencyGraph } from './spatial.js';
import type { RuntimeTableIndex } from './runtime-table-index.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import type { ZobristTable, GameDef } from './types.js';
import { createZobristTable } from './zobrist.js';
import type { RuleCard } from './tooltip-rule-card.js';
import type {
  CompiledEffectSequence,
  CompiledLifecycleEffectKey,
} from './effect-compiler-types.js';

/**
 * Pre-computed, immutable runtime structures derived from a GameDef.
 * These are pure functions of the definition and never change during a game.
 * Creating this once and threading it through kernel calls avoids redundant
 * rebuilds of the adjacency graph, runtime table index, and Zobrist table
 * on every move.
 *
 * `ruleCardCache` is a lazily populated memo cache for RuleCard instances.
 * Each RuleCard is a pure function of (GameDef, actionId) — immutable once
 * computed. The Map itself is mutable for lazy population only.
 */
export interface GameDefRuntime {
  readonly adjacencyGraph: AdjacencyGraph;
  readonly runtimeTableIndex: RuntimeTableIndex;
  readonly zobristTable: ZobristTable;
  readonly ruleCardCache: Map<string, RuleCard>;
  readonly compiledLifecycleEffects: ReadonlyMap<CompiledLifecycleEffectKey, CompiledEffectSequence>;
}

export function createGameDefRuntime(def: GameDef): GameDefRuntime {
  return {
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    runtimeTableIndex: buildRuntimeTableIndex(def),
    zobristTable: createZobristTable(def),
    ruleCardCache: new Map(),
    compiledLifecycleEffects: new Map<CompiledLifecycleEffectKey, CompiledEffectSequence>(),
  };
}
