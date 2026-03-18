/**
 * Per-search state-info cache for MCTS.
 *
 * Caches `terminalResult()`, `legalMoves()`, and `evaluateForAllPlayers()`
 * results keyed by `stateHash`. Entries with `stateHash === 0n` are never
 * cached (hidden-information states where hashing is not meaningful).
 *
 * The cache is local to each `runSearch()` call — no cross-search leakage.
 * Eviction is insertion-order (Map preserves insertion order in ES2015+).
 */

import type { GameDef, GameState, Move, TerminalResult } from '../../kernel/types.js';
import type { ChoiceRequest } from '../../kernel/types-core.js';
import type { GameDefRuntime } from '../../kernel/gamedef-runtime.js';
import type { MctsConfig } from './config.js';
import type { MutableDiagnosticsAccumulator } from './diagnostics.js';
import { recordHeuristicEvalSpread } from './diagnostics.js';
import type { MoveClassification } from './materialization.js';
import type { MctsSearchVisitor } from './visitor.js';
import type { MoveKey } from './move-key.js';
import { terminalResult } from '../../kernel/terminal.js';
import { legalMoves } from '../../kernel/legal-moves.js';
import { evaluateForAllPlayers } from './evaluate.js';
import { classifyMovesForSearch, classifySingleMove } from './materialization.js';
import type { SingleMoveClassificationKind } from './materialization.js';
import { canonicalMoveKey, familyKey as computeFamilyKey } from './move-key.js';
import type { ConcreteMoveCandidate } from './expansion.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-move classification status for incremental caching. */
export type ClassificationStatus =
  | 'unknown'
  | 'ready'
  | 'pending'
  | 'illegal'
  | 'pendingStochastic';

/** Cached information for a single legal move, including its classification. */
export interface CachedLegalMoveInfo {
  readonly move: Move;
  readonly moveKey: MoveKey;
  readonly familyKey: string;
  status: ClassificationStatus;
  oneStepHeuristic?: readonly number[] | null;
}

/**
 * Incremental classification cache for a state's legal moves.
 *
 * Supports partial population — moves start as `unknown` and are classified
 * one at a time across revisits. `nextUnclassifiedCursor` tracks progress
 * through the `infos` array.
 */
export interface CachedClassificationEntry {
  readonly infos: CachedLegalMoveInfo[];
  nextUnclassifiedCursor: number;
  exhaustiveScanComplete: boolean;
}

export interface CachedStateInfo {
  readonly terminal?: TerminalResult | null;
  readonly legalMoves?: readonly Move[];
  readonly rewards?: readonly number[];
  /** @deprecated Use `classification` for incremental per-move caching. */
  readonly moveClassification?: MoveClassification;
  readonly classification?: CachedClassificationEntry;
}

export type StateInfoCache = Map<bigint, CachedStateInfo>;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create an empty per-search state-info cache. */
export function createStateInfoCache(): StateInfoCache {
  return new Map<bigint, CachedStateInfo>();
}

// ---------------------------------------------------------------------------
// Eviction
// ---------------------------------------------------------------------------

/**
 * If the cache has reached `maxEntries`, delete the oldest entry
 * (first key in insertion order).
 */
export function evictIfNeeded(cache: StateInfoCache, maxEntries: number): void {
  if (cache.size >= maxEntries) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
}

// ---------------------------------------------------------------------------
// Incremental classification helpers
// ---------------------------------------------------------------------------

/**
 * Map `legalChoicesEvaluate` result kind to `ClassificationStatus`.
 */
function kindToStatus(kind: SingleMoveClassificationKind): ClassificationStatus {
  switch (kind) {
    case 'complete': return 'ready';
    case 'pending': return 'pending';
    case 'illegal': return 'illegal';
    case 'pendingStochastic': return 'pendingStochastic';
    case 'error': return 'illegal'; // treat errors as illegal
    default: return 'illegal';
  }
}

/**
 * Create a `CachedClassificationEntry` from a set of legal moves.
 *
 * All moves start with `status: 'unknown'`. Moves are deduplicated by
 * `moveKey` at creation time — multiple raw moves mapping to the same
 * `moveKey` produce a single entry (first raw move wins).
 */
export function initClassificationEntry(
  moves: readonly Move[],
): CachedClassificationEntry {
  const infos: CachedLegalMoveInfo[] = [];
  const seenKeys = new Set<MoveKey>();

  for (let i = 0; i < moves.length; i += 1) {
    const move = moves[i]!;
    const key = canonicalMoveKey(move);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      infos.push({ move, moveKey: key, familyKey: computeFamilyKey(move), status: 'unknown' });
    }
  }

  return {
    infos,
    nextUnclassifiedCursor: 0,
    exhaustiveScanComplete: false,
  };
}

/**
 * Classify the move at `nextUnclassifiedCursor`, update its status,
 * advance the cursor, and return the classified info.
 *
 * Returns `null` if the cursor has already reached the end (all moves
 * classified). Sets `exhaustiveScanComplete` when the last move is
 * classified.
 */
export function classifyNextCandidate(
  entry: CachedClassificationEntry,
  def: GameDef,
  state: GameState,
  runtime?: GameDefRuntime,
  visitor?: MctsSearchVisitor,
  acc?: MutableDiagnosticsAccumulator,
): CachedLegalMoveInfo | null {
  if (entry.nextUnclassifiedCursor >= entry.infos.length) {
    entry.exhaustiveScanComplete = true;
    return null;
  }

  const info = entry.infos[entry.nextUnclassifiedCursor]!;
  const kind = classifySingleMove(def, state, info.move, runtime, visitor, acc);
  info.status = kindToStatus(kind);
  entry.nextUnclassifiedCursor += 1;

  if (entry.nextUnclassifiedCursor >= entry.infos.length) {
    entry.exhaustiveScanComplete = true;
  }

  return info;
}

/**
 * Classify a specific move by index without advancing the cursor.
 *
 * Useful for on-demand classification of an existing child's move.
 * Returns the updated info, or `null` if the index is out of bounds.
 * If the move is already classified (not `unknown`), returns the
 * existing info without re-classifying.
 */
export function classifySpecificMove(
  entry: CachedClassificationEntry,
  index: number,
  def: GameDef,
  state: GameState,
  runtime?: GameDefRuntime,
  visitor?: MctsSearchVisitor,
  acc?: MutableDiagnosticsAccumulator,
): CachedLegalMoveInfo | null {
  if (index < 0 || index >= entry.infos.length) {
    return null;
  }

  const info = entry.infos[index]!;
  if (info.status !== 'unknown') {
    return info;
  }

  const kind = classifySingleMove(def, state, info.move, runtime, visitor, acc);
  info.status = kindToStatus(kind);
  return info;
}

/**
 * Return all cached move infos matching the given status.
 *
 * For backward compatibility, callers that need the old `MoveClassification`
 * shape can use `getClassifiedMovesByStatus(entry, 'ready')` and
 * `getClassifiedMovesByStatus(entry, 'pending')`.
 */
export function getClassifiedMovesByStatus(
  entry: CachedClassificationEntry,
  status: ClassificationStatus,
): readonly CachedLegalMoveInfo[] {
  const result: CachedLegalMoveInfo[] = [];
  for (let i = 0; i < entry.infos.length; i += 1) {
    if (entry.infos[i]!.status === status) {
      result.push(entry.infos[i]!);
    }
  }
  return result;
}

/**
 * Return the set of unique family keys represented in the classification entry.
 */
export function getRepresentedFamilies(
  entry: CachedClassificationEntry,
): Set<string> {
  const families = new Set<string>();
  for (let i = 0; i < entry.infos.length; i += 1) {
    families.add(entry.infos[i]!.familyKey);
  }
  return families;
}

/**
 * Return a map of family key → count of moves in that family.
 */
export function countByFamily(
  entry: CachedClassificationEntry,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < entry.infos.length; i += 1) {
    const fk = entry.infos[i]!.familyKey;
    counts.set(fk, (counts.get(fk) ?? 0) + 1);
  }
  return counts;
}

/**
 * Exhaust the classification cursor and return the old `MoveClassification`
 * shape for backward compatibility.
 *
 * After this call, `exhaustiveScanComplete` is `true`. This is equivalent
 * to the old `classifyMovesForSearch()` behavior but uses the incremental
 * cache structure.
 */
export function exhaustClassificationToLegacy(
  entry: CachedClassificationEntry,
  def: GameDef,
  state: GameState,
  runtime?: GameDefRuntime,
  visitor?: MctsSearchVisitor,
  acc?: MutableDiagnosticsAccumulator,
): MoveClassification {
  // Classify all remaining unknown moves.
  while (entry.nextUnclassifiedCursor < entry.infos.length) {
    classifyNextCandidate(entry, def, state, runtime, visitor, acc);
  }

  // Build the legacy shape.
  const ready: ConcreteMoveCandidate[] = [];
  const pending: Move[] = [];
  const seenPendingKeys = new Set<string>();

  for (let i = 0; i < entry.infos.length; i += 1) {
    const info = entry.infos[i]!;
    switch (info.status) {
      case 'ready':
        ready.push({ move: info.move, moveKey: info.moveKey });
        break;
      case 'pending': {
        // Preserve the original dedup logic: by actionId when no params,
        // by moveKey when params exist.
        const hasParams = Object.keys(info.move.params).length > 0;
        const dedupKey = hasParams ? info.moveKey : info.move.actionId;
        if (!seenPendingKeys.has(dedupKey)) {
          seenPendingKeys.add(dedupKey);
          pending.push(info.move);
        }
        break;
      }
      default:
        // illegal, pendingStochastic, unknown — skip
        break;
    }
  }

  return { ready, pending };
}

// ---------------------------------------------------------------------------
// Incremental classification entry access
// ---------------------------------------------------------------------------

/**
 * Return the incremental classification entry for the given state, creating
 * one (with all `unknown` statuses) if not yet present. Returns `null` when
 * the state hash is 0n (uncacheable hidden-info state).
 *
 * Unlike `getOrComputeClassification`, this does NOT exhaust the cursor —
 * it returns the entry for incremental/lazy use.
 */
export function getOrInitClassificationEntry(
  cache: StateInfoCache,
  state: GameState,
  moves: readonly Move[],
  maxEntries: number,
): CachedClassificationEntry | null {
  const hash = state.stateHash;
  if (hash === 0n) return null;

  const cached = cache.get(hash);
  if (cached?.classification !== undefined) {
    return cached.classification;
  }

  // Create a new entry with all unknown statuses.
  evictIfNeeded(cache, maxEntries);
  const entry = initClassificationEntry(moves);
  const existing = cache.get(hash);
  cache.set(hash, { ...existing, classification: entry });
  return entry;
}

// ---------------------------------------------------------------------------
// Cache-or-compute helpers
// ---------------------------------------------------------------------------

/**
 * Return the cached terminal result for the given state, or compute it,
 * cache it, and return it. Skips cache when `stateHash === 0n`.
 */
export function getOrComputeTerminal(
  cache: StateInfoCache,
  def: GameDef,
  state: GameState,
  runtime: GameDefRuntime | undefined,
  maxEntries: number,
  acc?: MutableDiagnosticsAccumulator,
): TerminalResult | null {
  const hash = state.stateHash;

  if (hash !== 0n) {
    if (acc !== undefined) {
      acc.stateCacheLookups += 1;
    }

    const cached = cache.get(hash);
    if (cached !== undefined && cached.terminal !== undefined) {
      if (acc !== undefined) {
        acc.stateCacheHits += 1;
        acc.terminalCacheHits += 1;
      }
      return cached.terminal;
    }
  }

  // Compute
  const tStart = acc !== undefined ? performance.now() : 0;
  const result = terminalResult(def, state, runtime);
  if (acc !== undefined) {
    acc.terminalCalls += 1;
    acc.terminalTimeMs += performance.now() - tStart;
  }

  // Cache (only when hash is meaningful)
  if (hash !== 0n) {
    evictIfNeeded(cache, maxEntries);
    const existing = cache.get(hash);
    cache.set(hash, { ...existing, terminal: result });
  }

  return result;
}

/**
 * Return the cached legal moves for the given state, or compute them,
 * cache them, and return them. Skips cache when `stateHash === 0n`.
 */
export function getOrComputeLegalMoves(
  cache: StateInfoCache,
  def: GameDef,
  state: GameState,
  runtime: GameDefRuntime | undefined,
  maxEntries: number,
  acc?: MutableDiagnosticsAccumulator,
): readonly Move[] {
  const hash = state.stateHash;

  if (hash !== 0n) {
    if (acc !== undefined) {
      acc.stateCacheLookups += 1;
    }

    const cached = cache.get(hash);
    if (cached !== undefined && cached.legalMoves !== undefined) {
      if (acc !== undefined) {
        acc.stateCacheHits += 1;
        acc.legalMovesCacheHits += 1;
      }
      return cached.legalMoves;
    }
  }

  // Compute
  const tStart = acc !== undefined ? performance.now() : 0;
  const result = legalMoves(def, state, undefined, runtime);
  if (acc !== undefined) {
    acc.legalMovesCalls += 1;
    acc.legalMovesTimeMs += performance.now() - tStart;
  }

  // Cache
  if (hash !== 0n) {
    evictIfNeeded(cache, maxEntries);
    const existing = cache.get(hash);
    cache.set(hash, { ...existing, legalMoves: result });
  }

  return result;
}

/**
 * Return the cached reward vector for the given state, or compute it,
 * cache it, and return it. Skips cache when `stateHash === 0n`.
 *
 * This caches only `evaluateForAllPlayers()` — terminal rewards are not
 * cached here (they depend on `terminalToRewards` which is trivially cheap).
 */
export function getOrComputeRewards(
  cache: StateInfoCache,
  def: GameDef,
  state: GameState,
  config: Pick<MctsConfig, 'heuristicTemperature'>,
  runtime: GameDefRuntime | undefined,
  maxEntries: number,
  acc?: MutableDiagnosticsAccumulator,
): readonly number[] {
  const hash = state.stateHash;

  if (hash !== 0n) {
    if (acc !== undefined) {
      acc.stateCacheLookups += 1;
    }

    const cached = cache.get(hash);
    if (cached !== undefined && cached.rewards !== undefined) {
      if (acc !== undefined) {
        acc.stateCacheHits += 1;
        acc.rewardCacheHits += 1;
      }
      return cached.rewards;
    }
  }

  // Compute
  const tStart = acc !== undefined ? performance.now() : 0;
  const diagOut = acc !== undefined ? {} as import('./evaluate.js').EvalDiagnosticsOut : undefined;
  const result = evaluateForAllPlayers(def, state, config.heuristicTemperature, runtime, diagOut);
  if (acc !== undefined) {
    acc.evaluateStateCalls += 1;
    acc.evaluateTimeMs += performance.now() - tStart;
    if (diagOut?.rawScores !== undefined) {
      recordHeuristicEvalSpread(acc, diagOut.rawScores, result);
    }
  }

  // Cache
  if (hash !== 0n) {
    evictIfNeeded(cache, maxEntries);
    const existing = cache.get(hash);
    cache.set(hash, { ...existing, rewards: result });
  }

  return result;
}

/**
 * Return the cached move classification for the given state, or compute it,
 * cache it, and return it. Skips cache when `stateHash === 0n`.
 *
 * This is the backward-compatible entry point. It uses the incremental
 * `CachedClassificationEntry` internally but returns the legacy
 * `MoveClassification` shape by exhausting the cursor on first call.
 *
 * This prevents redundant `legalChoicesEvaluate` calls across iterations
 * when the same state (e.g. root) is visited repeatedly.
 */
export function getOrComputeClassification(
  cache: StateInfoCache,
  def: GameDef,
  state: GameState,
  moves: readonly Move[],
  runtime: GameDefRuntime | undefined,
  maxEntries: number,
  visitor?: MctsSearchVisitor,
  acc?: MutableDiagnosticsAccumulator,
): MoveClassification {
  const hash = state.stateHash;

  if (hash !== 0n) {
    if (acc !== undefined) {
      acc.stateCacheLookups += 1;
    }

    const cached = cache.get(hash);

    // Fast path: already have a fully exhausted incremental entry.
    if (cached?.classification !== undefined && cached.classification.exhaustiveScanComplete) {
      if (acc !== undefined) {
        acc.stateCacheHits += 1;
        acc.classificationCacheHits += 1;
      }
      return exhaustClassificationToLegacy(cached.classification, def, state, runtime, visitor, acc);
    }

    // Fast path: legacy cache hit (from older callers or prior runs).
    if (cached?.moveClassification !== undefined) {
      if (acc !== undefined) {
        acc.stateCacheHits += 1;
        acc.classificationCacheHits += 1;
      }
      return cached.moveClassification;
    }
  }

  // Build incremental entry if not yet present.
  if (hash !== 0n) {
    evictIfNeeded(cache, maxEntries);
    const existing = cache.get(hash);
    if (existing?.classification === undefined) {
      const entry = initClassificationEntry(moves);
      cache.set(hash, { ...existing, classification: entry });
    }
    const updated = cache.get(hash)!;
    const result = exhaustClassificationToLegacy(
      updated.classification!, def, state, runtime, visitor, acc,
    );
    // Also cache the legacy shape for callers that check moveClassification directly.
    cache.set(hash, { ...updated, moveClassification: result });
    return result;
  }

  // Not cacheable (stateHash === 0n) — fall back to full classification.
  return classifyMovesForSearch(def, state, moves, runtime, visitor, acc);
}

// ---------------------------------------------------------------------------
// Decision discovery cache
// ---------------------------------------------------------------------------

/**
 * Composite key for the decision discovery cache.
 * Encodes `stateHash` and `MoveKey` (canonical partial move key) as a single string.
 *
 * The `MoveKey` of the partial move uniquely determines what `legalChoicesDiscover()`
 * will return for a given state, making it the correct cache key component.
 */
type DiscoveryCacheKey = string & { readonly __brand: 'DiscoveryCacheKey' };

function makeDiscoveryCacheKey(stateHash: bigint, moveKey: MoveKey): DiscoveryCacheKey {
  return `${stateHash}|${moveKey}` as DiscoveryCacheKey;
}

/**
 * Per-search cache for `legalChoicesDiscover()` results.
 *
 * Keyed by `stateHash + DecisionKey`. Entries with `stateHash === 0n`
 * are never cached (hidden-information states). Eviction is
 * insertion-order (Map preserves insertion order in ES2015+).
 */
export type DiscoveryCache = Map<DiscoveryCacheKey, ChoiceRequest>;

/** Create an empty per-search discovery cache. */
export function createDiscoveryCache(): DiscoveryCache {
  return new Map<DiscoveryCacheKey, ChoiceRequest>();
}

/**
 * Look up a cached discovery result.
 * Returns `undefined` on miss or when `stateHash === 0n`.
 */
export function getDiscoveryCacheEntry(
  cache: DiscoveryCache,
  stateHash: bigint,
  moveKey: MoveKey,
): ChoiceRequest | undefined {
  if (stateHash === 0n) return undefined;
  return cache.get(makeDiscoveryCacheKey(stateHash, moveKey));
}

/**
 * Store a discovery result in the cache. Evicts oldest if at capacity.
 * Does nothing when `stateHash === 0n`.
 */
export function setDiscoveryCacheEntry(
  cache: DiscoveryCache,
  stateHash: bigint,
  moveKey: MoveKey,
  result: ChoiceRequest,
  maxEntries: number,
): void {
  if (stateHash === 0n) return;

  // Evict oldest if at capacity.
  if (cache.size >= maxEntries) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }

  cache.set(makeDiscoveryCacheKey(stateHash, moveKey), result);
}
