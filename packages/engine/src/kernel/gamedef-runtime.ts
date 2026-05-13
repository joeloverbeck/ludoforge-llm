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
import { LruCache } from '../shared/lru-cache.js';
import { createCompiledQueryPlanCache, type CompiledQueryPlanCache } from './compiled-query-plan.js';
import type { TokenStateIndexCache, TokenStateIndexEntry } from './token-state-index.js';

export const PUBLICATION_PROBE_CACHE_LIMIT = 2_500;
export const TOKEN_STATE_INDEX_CACHE_LIMIT = 4_096;

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
  /** `runLocal`: memoizes publication probe verdicts; reset for every run. */
  readonly publicationProbeCache: LruCache<string, boolean>;
  /** `runLocal`: memoizes canonical token-state-index snapshots; reset for every run. */
  readonly tokenStateIndexCache: TokenStateIndexCache;
  /**
   * `sharedStructural`: lazily populated compiled query/filter plans keyed by
   * compiled AST object identity. Plans depend only on GameDef structure; they
   * receive run-local state through `ReadContext` at invocation time.
   */
  readonly compiledQueryPlanCache: CompiledQueryPlanCache;
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
    publicationProbeCache: new LruCache<string, boolean>(PUBLICATION_PROBE_CACHE_LIMIT),
    tokenStateIndexCache: new LruCache<bigint, ReadonlyMap<string, TokenStateIndexEntry>>(TOKEN_STATE_INDEX_CACHE_LIMIT),
    compiledQueryPlanCache: createCompiledQueryPlanCache(),
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
 * The `runLocal` members are `zobristTable.keyCache`,
 * `zobristTable.frameDigestCache`, `publicationProbeCache`, and
 * `tokenStateIndexCache`; all reset at game boundaries so long-lived callers do
 * not accumulate cross-run state.
 * `compiledQueryPlanCache` remains shared structural across forks.
 */
export function forkGameDefRuntimeForRun(runtime: GameDefRuntime): ForkedGameDefRuntimeForRun {
  return {
    ...runtime,
    zobristTable: {
      ...runtime.zobristTable,
      keyCache: new Map(),
      frameDigestCache: new LruCache<string, string>(runtime.zobristTable.frameDigestCache.evictionLimit),
    },
    publicationProbeCache: new LruCache<string, boolean>(PUBLICATION_PROBE_CACHE_LIMIT),
    tokenStateIndexCache: new LruCache<bigint, ReadonlyMap<string, TokenStateIndexEntry>>(TOKEN_STATE_INDEX_CACHE_LIMIT),
  } as unknown as ForkedGameDefRuntimeForRun;
}
