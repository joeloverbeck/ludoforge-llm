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
import type { GameDefRuntime } from '../../kernel/gamedef-runtime.js';
import type { MctsConfig } from './config.js';
import type { MutableDiagnosticsAccumulator } from './diagnostics.js';
import { terminalResult } from '../../kernel/terminal.js';
import { legalMoves } from '../../kernel/legal-moves.js';
import { evaluateForAllPlayers } from './evaluate.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CachedStateInfo {
  readonly terminal?: TerminalResult | null;
  readonly legalMoves?: readonly Move[];
  readonly rewards?: readonly number[];
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
  const result = terminalResult(def, state, runtime);
  if (acc !== undefined) {
    acc.terminalCalls += 1;
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
  const result = legalMoves(def, state, undefined, runtime);
  if (acc !== undefined) {
    acc.legalMovesCalls += 1;
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
  const result = evaluateForAllPlayers(def, state, config.heuristicTemperature, runtime);
  if (acc !== undefined) {
    acc.evaluateStateCalls += 1;
  }

  // Cache
  if (hash !== 0n) {
    evictIfNeeded(cache, maxEntries);
    const existing = cache.get(hash);
    cache.set(hash, { ...existing, rewards: result });
  }

  return result;
}
