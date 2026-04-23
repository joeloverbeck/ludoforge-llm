import type { AdjacencyGraph } from './spatial.js';
import { buildAdjacencyGraph } from './spatial.js';
import type { RuntimeTableIndex } from './runtime-table-index.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import type { ActionId } from './branded.js';
import type { ZobristTable, GameDef } from './types.js';
import { createZobristTable } from './zobrist.js';
import type { RuleCard } from './tooltip-rule-card.js';
import type {
  CompiledEffectSequence,
  CompiledLifecycleEffectKey,
} from './effect-compiler-types.js';
import { compileAllLifecycleEffects } from './effect-compiler.js';
import { computeAlwaysCompleteActionIds } from './always-complete-actions.js';
import { compileGameDefFirstDecisionDomains, type FirstDecisionRuntimeCompilation } from './first-decision-compiler.js';

export interface GameDefRuntime {
  /** `sharedStructural`: pure function of `def.zones`; never mutated after runtime creation. */
  readonly adjacencyGraph: AdjacencyGraph;
  /** `sharedStructural`: pure function of `def`; never mutated after runtime creation. */
  readonly runtimeTableIndex: RuntimeTableIndex;
  /**
   * Mixed ownership: structural Zobrist metadata is `sharedStructural`, while
   * `zobristTable.keyCache` is `runLocal` and must start empty for each run.
   */
  readonly zobristTable: ZobristTable;
  /** `sharedStructural`: compiled once from `def`; immutable thereafter. */
  readonly alwaysCompleteActionIds: ReadonlySet<ActionId>;
  /** `sharedStructural`: compiled once from `def`; immutable thereafter. */
  readonly firstDecisionDomains: FirstDecisionRuntimeCompilation;
  /**
   * `sharedStructural`: lazily populated, but the key universe is bounded by
   * the compiled GameDef (`actionId` plus action-class or `eventCard.id`).
   * Cached RuleCard values are pure functions of that structural input.
   */
  readonly ruleCardCache: Map<string, RuleCard>;
  /** `sharedStructural`: compiled once from `def`; immutable thereafter. */
  readonly compiledLifecycleEffects: ReadonlyMap<CompiledLifecycleEffectKey, CompiledEffectSequence>;
}

declare const forkedGameDefRuntimeForRunBrand: unique symbol;

export type ForkedGameDefRuntimeForRun = GameDefRuntime & {
  readonly [forkedGameDefRuntimeForRunBrand]: true;
};

/**
 * Type-level marker for helpers that require a runtime already isolated to one run.
 *
 * The current pattern is intentionally lightweight: callers either pass a shared
 * `GameDefRuntime` to a helper that forks internally, or they accept/brand a
 * `ForkedGameDefRuntimeForRun` explicitly to make that precondition visible in
 * the helper signature.
 */
export function assertGameDefRuntimeForkedForRun(
  runtime: GameDefRuntime,
): asserts runtime is ForkedGameDefRuntimeForRun {
  void runtime;
}

export function createGameDefRuntime(def: GameDef): GameDefRuntime {
  const compiledLifecycleEffects = compileAllLifecycleEffects(def);
  const alwaysCompleteActionIds = computeAlwaysCompleteActionIds(def);
  const firstDecisionDomains = compileGameDefFirstDecisionDomains(def);
  return {
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    runtimeTableIndex: buildRuntimeTableIndex(def),
    zobristTable: createZobristTable(def),
    alwaysCompleteActionIds,
    firstDecisionDomains,
    ruleCardCache: new Map(),
    compiledLifecycleEffects,
  };
}

/**
 * Fork a structural runtime into a per-run instance.
 *
 * Structural runtime artifacts remain shared across runs:
 * `adjacencyGraph`, `runtimeTableIndex`, `alwaysCompleteActionIds`,
 * `firstDecisionDomains`, `ruleCardCache`, `compiledLifecycleEffects`, and the
 * structural Zobrist fields (`seed`, `fingerprint`, `seedHex`, `sortedKeys`).
 *
 * The only `runLocal` member is `zobristTable.keyCache`, which is reset at
 * game boundaries so long-lived callers do not accumulate cross-run feature
 * keys.
 */
export function forkGameDefRuntimeForRun(runtime: GameDefRuntime): ForkedGameDefRuntimeForRun {
  return {
    ...runtime,
    zobristTable: {
      ...runtime.zobristTable,
      keyCache: new Map(),
    },
  } as ForkedGameDefRuntimeForRun;
}
