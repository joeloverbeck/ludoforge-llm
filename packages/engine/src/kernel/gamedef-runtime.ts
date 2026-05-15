import type { AdjacencyGraph } from './spatial.js';
import { buildAdjacencyGraph } from './spatial.js';
import type { RuntimeTableIndex } from './runtime-table-index.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import type { ActionId, BoundaryId } from './branded.js';
import type { CompiledPolicyExpr, ZobristTable, GameDef, GameState } from './types.js';
import type { EncodedState } from './encoded-state/index.js';
import { createZobristTable } from './zobrist.js';
import type { RuleCard } from './tooltip-rule-card.js';
import type {
  CompiledEffectSequence,
  CompiledLifecycleEffectKey,
} from './effect-compiler-types.js';
import type { PolicyBytecode } from '../cnl/policy-bytecode/index.js';
import { compileAllLifecycleEffects } from './effect-compiler.js';
import { computeAlwaysCompleteActionIds } from './always-complete-actions.js';
import { compileGameDefFirstDecisionDomains, type FirstDecisionRuntimeCompilation } from './first-decision-compiler.js';
import { LruCache } from '../shared/lru-cache.js';
import { createCompiledQueryPlanCache, type CompiledQueryPlanCache } from './compiled-query-plan.js';
import type { TokenStateIndexCache, TokenStateIndexEntry } from './token-state-index.js';

export interface ScheduleIndex {
  readonly boundaries: ReadonlyMap<BoundaryId, BoundaryRuntimeState>;
  /** Test/diagnostic counter for the most recent draw advancement. */
  lastAdvanceCount: number;
}

export interface BoundaryRuntimeState {
  readonly definition: NonNullable<GameDef['phaseBoundaries']>[number];
  readonly cardDrawState?: CardDrawRuntimeState;
}

export interface CardDrawRuntimeState {
  readonly deckId: string;
  readonly triggeringCardPositions: readonly number[];
  currentDrawPosition: number;
}

export const PUBLICATION_PROBE_CACHE_LIMIT = 2_500;
export const TOKEN_STATE_INDEX_CACHE_LIMIT = 4_096;
export const POLICY_WASM_BYTECODE_INPUT_CACHE_LIMIT = 4_096;
export const POLICY_ENCODED_STATE_HASH_CACHE_LIMIT = 4_096;
export type PolicyWasmBytecodeInputCache = LruCache<string, Uint8Array>;
export type PolicyWasmBytecodeStateWordsCache = LruCache<string, Int32Array>;
export interface PolicyEncodedStateHashCacheEntry {
  readonly serializedState: string;
  readonly encodedState: EncodedState;
}
export type PolicyEncodedStateHashCache = LruCache<bigint, readonly PolicyEncodedStateHashCacheEntry[]>;

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
  /** `runLocal`: memoizes encoded policy WASM bytecode inputs; reset for every run. */
  readonly policyWasmBytecodeInputCache: PolicyWasmBytecodeInputCache;
  /** `runLocal`: memoizes state-dependent words used by policy WASM bytecode inputs. */
  readonly policyWasmBytecodeStateWordsCache: PolicyWasmBytecodeStateWordsCache;
  /**
   * `runLocal`: memoizes encoded-state projections keyed by immutable
   * GameState object identity; reset for every run via fork.
   */
  readonly policyEncodedStateCache: WeakMap<GameState, EncodedState>;
  /**
   * `runLocal`: memoizes encoded-state projections for distinct but
   * canonically identical GameState objects. Entries are addressed by
   * stateHash only as an accelerator; serialized-state equality guards reuse.
   */
  readonly policyEncodedStateHashCache: PolicyEncodedStateHashCache;
  /**
   * `sharedStructural`: lazily populated compiled query/filter plans keyed by
   * compiled AST object identity. Plans depend only on GameDef structure; they
   * receive run-local state through `ReadContext` at invocation time.
   */
  readonly compiledQueryPlanCache: CompiledQueryPlanCache;
  /**
   * `sharedStructural`: lazily populated compiled policy bytecode keyed by
   * compiled policy-expression object identity. Bytecode depends only on
   * GameDef structure plus the canonical per-def encoded-state layout.
   */
  readonly policyBytecodeCache: WeakMap<CompiledPolicyExpr, PolicyBytecode>;
  /**
   * Mixed ownership: boundary definitions and triggering positions are
   * `sharedStructural`; current draw positions are `runLocal` and forked.
   */
  readonly scheduleIndex: ScheduleIndex;
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
  const scheduleIndex = createScheduleIndex(def);
  return {
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    runtimeTableIndex: buildRuntimeTableIndex(def),
    zobristTable: createZobristTable(def),
    alwaysCompleteActionIds,
    firstDecisionDomains,
    ruleCardCache: new Map(),
    publicationProbeCache: new LruCache<string, boolean>(PUBLICATION_PROBE_CACHE_LIMIT),
    tokenStateIndexCache: new LruCache<bigint, ReadonlyMap<string, TokenStateIndexEntry>>(TOKEN_STATE_INDEX_CACHE_LIMIT),
    policyWasmBytecodeInputCache: new LruCache<string, Uint8Array>(POLICY_WASM_BYTECODE_INPUT_CACHE_LIMIT),
    policyWasmBytecodeStateWordsCache: new LruCache<string, Int32Array>(POLICY_WASM_BYTECODE_INPUT_CACHE_LIMIT),
    policyEncodedStateCache: new WeakMap<GameState, EncodedState>(),
    policyEncodedStateHashCache: new LruCache<bigint, readonly PolicyEncodedStateHashCacheEntry[]>(POLICY_ENCODED_STATE_HASH_CACHE_LIMIT),
    compiledQueryPlanCache: createCompiledQueryPlanCache(),
    policyBytecodeCache: new WeakMap<CompiledPolicyExpr, PolicyBytecode>(),
    scheduleIndex,
    compiledLifecycleEffects,
  };
}

/**
 * Fork a structural runtime into a per-run instance.
 *
 * Structural runtime artifacts remain shared across runs:
 * `adjacencyGraph`, `runtimeTableIndex`, `alwaysCompleteActionIds`,
 * `firstDecisionDomains`, `ruleCardCache`, `compiledQueryPlanCache`,
 * `policyBytecodeCache`, `compiledLifecycleEffects`, and the structural
 * Zobrist fields (`seed`, `fingerprint`, `seedHex`, `sortedKeys`).
 *
 * The `runLocal` members are `zobristTable.keyCache`,
 * `zobristTable.frameDigestCache`, `publicationProbeCache`,
 * `tokenStateIndexCache`, `policyWasmBytecodeInputCache`, and
 * `policyWasmBytecodeStateWordsCache`, `policyEncodedStateCache`, and
 * `policyEncodedStateHashCache`; all reset at game boundaries so
 * long-lived callers do not accumulate cross-run state.
 * `compiledQueryPlanCache` and `policyBytecodeCache` remain shared structural
 * across forks.
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
    policyWasmBytecodeInputCache: new LruCache<string, Uint8Array>(POLICY_WASM_BYTECODE_INPUT_CACHE_LIMIT),
    policyWasmBytecodeStateWordsCache: new LruCache<string, Int32Array>(POLICY_WASM_BYTECODE_INPUT_CACHE_LIMIT),
    policyEncodedStateCache: new WeakMap<GameState, EncodedState>(),
    policyEncodedStateHashCache: new LruCache<bigint, readonly PolicyEncodedStateHashCacheEntry[]>(POLICY_ENCODED_STATE_HASH_CACHE_LIMIT),
    scheduleIndex: forkScheduleIndexForRun(runtime.scheduleIndex),
  } as unknown as ForkedGameDefRuntimeForRun;
}

export function createScheduleIndex(def: GameDef): ScheduleIndex {
  const boundaries = new Map<BoundaryId, BoundaryRuntimeState>();
  for (const boundary of def.phaseBoundaries ?? []) {
    boundaries.set(boundary.id, {
      definition: boundary,
      ...(boundary.schedule?.kind === 'cardDraw'
        ? { cardDrawState: createCardDrawRuntimeState(def, boundary.schedule) }
        : {}),
    });
  }
  return { boundaries, lastAdvanceCount: 0 };
}

export function forkScheduleIndexForRun(index: ScheduleIndex): ScheduleIndex {
  const boundaries = new Map<BoundaryId, BoundaryRuntimeState>();
  for (const [id, state] of index.boundaries) {
    boundaries.set(id, {
      definition: state.definition,
      ...(state.cardDrawState === undefined
        ? {}
        : {
            cardDrawState: {
              deckId: state.cardDrawState.deckId,
              triggeringCardPositions: state.cardDrawState.triggeringCardPositions,
              currentDrawPosition: state.cardDrawState.currentDrawPosition,
            },
          }),
    });
  }
  return { boundaries, lastAdvanceCount: 0 };
}

export function advanceScheduleIndexForDraw(runtime: GameDefRuntime, deckId: string, count: number): void {
  let advanced = 0;
  for (const boundary of runtime.scheduleIndex.boundaries.values()) {
    if (boundary.cardDrawState?.deckId !== deckId) {
      continue;
    }
    boundary.cardDrawState.currentDrawPosition += count;
    advanced += 1;
  }
  runtime.scheduleIndex.lastAdvanceCount = advanced;
}

export function advanceScheduleIndexForDrawZone(
  runtime: GameDefRuntime | undefined,
  def: GameDef,
  drawZoneId: string,
  count: number,
): void {
  if (runtime === undefined || count <= 0) {
    return;
  }
  let advanced = 0;
  for (const deck of def.eventDecks ?? []) {
    if (deck.drawZone !== drawZoneId) {
      continue;
    }
    for (const boundary of runtime.scheduleIndex.boundaries.values()) {
      if (boundary.cardDrawState?.deckId !== deck.id) {
        continue;
      }
      boundary.cardDrawState.currentDrawPosition += count;
      advanced += 1;
    }
  }
  runtime.scheduleIndex.lastAdvanceCount = advanced;
}

function createCardDrawRuntimeState(
  def: GameDef,
  schedule: Extract<NonNullable<NonNullable<GameDef['phaseBoundaries']>[number]['schedule']>, { readonly kind: 'cardDraw' }>,
): CardDrawRuntimeState {
  const deck = (def.eventDecks ?? []).find((entry) => entry.id === schedule.deckId);
  const tags = new Set(schedule.cardSelector.tags ?? []);
  const cardIds = new Set(schedule.cardSelector.cardIds ?? []);
  return {
    deckId: schedule.deckId,
    triggeringCardPositions: (deck?.cards ?? [])
      .map((card, index) => ({ card, position: index + 1 }))
      .filter(({ card }) =>
        cardIds.has(card.id) || (card.tags ?? []).some((tag) => tags.has(tag)),
      )
      .map(({ position }) => position),
    currentDrawPosition: 0,
  };
}
