/**
 * Memory bounds tests for the state-info cache.
 *
 * Verifies that CachedClassificationEntry entries respect
 * maxStateInfoCacheEntries bounds via FIFO eviction.
 *
 * Created for 64MCTSPEROPT-005.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createStateInfoCache,
  evictIfNeeded,
  getOrInitClassificationEntry,
  getOrComputeTerminal,
  getOrComputeLegalMoves,
  getOrComputeRewards,
  getOrComputeClassification,
  type StateInfoCache,
} from '../../../../src/agents/mcts/state-cache.js';
import { asActionId, initialState, type GameDef, type GameState } from '../../../../src/kernel/index.js';
import type { Move } from '../../../../src/kernel/types-core.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMove(actionId: string): Move {
  return { actionId: asActionId(actionId), params: {} };
}

function createTestDef(): GameDef {
  const phase = ['main'];
  return {
    metadata: { id: 'cache-bounds-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [
      {
        id: asActionId('noop'),
        actor: 'active',
        executor: 'actor',
        phase,
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [],
      scoring: { method: 'highest', value: { ref: 'pvar', player: 'actor', var: 'vp' } },
    },
  } as unknown as GameDef;
}

/**
 * Create a GameState with a specific stateHash for testing cache keying.
 */
function stateWithHash(hash: bigint): GameState {
  const def = createTestDef();
  const { state } = initialState(def, 42, 2);
  return { ...state, stateHash: hash };
}

// ---------------------------------------------------------------------------
// evictIfNeeded — direct tests
// ---------------------------------------------------------------------------

describe('evictIfNeeded', () => {
  it('does not evict when cache is below max entries', () => {
    const cache: StateInfoCache = createStateInfoCache();
    cache.set(1n, { terminal: null });
    cache.set(2n, { terminal: null });

    evictIfNeeded(cache, 5);

    assert.equal(cache.size, 2, 'no eviction should occur below max');
  });

  it('evicts oldest entry when cache is at max entries', () => {
    const cache: StateInfoCache = createStateInfoCache();
    cache.set(1n, { terminal: null });
    cache.set(2n, { terminal: null });
    cache.set(3n, { terminal: null });

    evictIfNeeded(cache, 3);

    assert.equal(cache.size, 2, 'one entry should be evicted');
    assert.equal(cache.has(1n), false, 'oldest entry (1n) should be evicted');
    assert.equal(cache.has(2n), true, '2n should remain');
    assert.equal(cache.has(3n), true, '3n should remain');
  });

  it('evicts insertion-order oldest (FIFO)', () => {
    const cache: StateInfoCache = createStateInfoCache();
    cache.set(10n, { terminal: null });
    cache.set(20n, { terminal: null });
    cache.set(30n, { terminal: null });
    cache.set(40n, { terminal: null });
    cache.set(50n, { terminal: null });

    // Evict until we can add one more (max = 5)
    evictIfNeeded(cache, 5);

    assert.equal(cache.size, 4, 'one entry evicted');
    assert.equal(cache.has(10n), false, 'first inserted (10n) should be evicted');
  });

  it('handles empty cache without error', () => {
    const cache: StateInfoCache = createStateInfoCache();
    evictIfNeeded(cache, 0);
    assert.equal(cache.size, 0);
  });

  it('handles max of 1 — always evicts before insert', () => {
    const cache: StateInfoCache = createStateInfoCache();
    cache.set(1n, { terminal: null });

    evictIfNeeded(cache, 1);

    assert.equal(cache.size, 0, 'cache should be empty after eviction');
  });
});

// ---------------------------------------------------------------------------
// Cache bounded by maxStateInfoCacheEntries
// ---------------------------------------------------------------------------

describe('cache bounded by maxStateInfoCacheEntries', () => {
  it('getOrInitClassificationEntry respects bounds', () => {
    const cache: StateInfoCache = createStateInfoCache();
    const moves = [makeMove('noop')];
    const maxEntries = 3;

    // Fill cache to max.
    for (let i = 1; i <= maxEntries; i++) {
      const state = stateWithHash(BigInt(i));
      getOrInitClassificationEntry(cache, state, moves, maxEntries);
    }

    assert.equal(cache.size, maxEntries, `cache should be at max (${maxEntries})`);

    // Insert one more — oldest should be evicted.
    const extraState = stateWithHash(BigInt(maxEntries + 1));
    getOrInitClassificationEntry(cache, extraState, moves, maxEntries);

    assert.ok(cache.size <= maxEntries, `cache should not exceed max entries: got ${cache.size}`);
    assert.equal(cache.has(1n), false, 'oldest entry (hash=1n) should be evicted');
    assert.equal(cache.has(BigInt(maxEntries + 1)), true, 'newest entry should be present');
  });

  it('getOrComputeTerminal respects bounds', () => {
    const def = createTestDef();
    const cache: StateInfoCache = createStateInfoCache();
    const maxEntries = 3;

    for (let i = 1; i <= maxEntries; i++) {
      const state = stateWithHash(BigInt(i));
      getOrComputeTerminal(cache, def, state, undefined, maxEntries);
    }

    assert.equal(cache.size, maxEntries);

    const extraState = stateWithHash(BigInt(maxEntries + 1));
    getOrComputeTerminal(cache, def, extraState, undefined, maxEntries);

    assert.ok(cache.size <= maxEntries, `terminal cache exceeded max: ${cache.size}`);
    assert.equal(cache.has(1n), false, 'oldest evicted');
  });

  it('getOrComputeLegalMoves respects bounds', () => {
    const def = createTestDef();
    const cache: StateInfoCache = createStateInfoCache();
    const maxEntries = 3;

    for (let i = 1; i <= maxEntries; i++) {
      const state = stateWithHash(BigInt(i));
      getOrComputeLegalMoves(cache, def, state, undefined, maxEntries);
    }

    assert.equal(cache.size, maxEntries);

    const extraState = stateWithHash(BigInt(maxEntries + 1));
    getOrComputeLegalMoves(cache, def, extraState, undefined, maxEntries);

    assert.ok(cache.size <= maxEntries, `legalMoves cache exceeded max: ${cache.size}`);
  });

  it('getOrComputeRewards respects bounds', () => {
    const def = createTestDef();
    const cache: StateInfoCache = createStateInfoCache();
    const maxEntries = 3;

    for (let i = 1; i <= maxEntries; i++) {
      const state = stateWithHash(BigInt(i));
      getOrComputeRewards(cache, def, state, { heuristicTemperature: 10_000 }, undefined, maxEntries);
    }

    assert.equal(cache.size, maxEntries);

    const extraState = stateWithHash(BigInt(maxEntries + 1));
    getOrComputeRewards(cache, def, extraState, { heuristicTemperature: 10_000 }, undefined, maxEntries);

    assert.ok(cache.size <= maxEntries, `rewards cache exceeded max: ${cache.size}`);
  });

  it('getOrComputeClassification respects bounds', () => {
    const def = createTestDef();
    const cache: StateInfoCache = createStateInfoCache();
    const moves = [makeMove('noop')];
    const maxEntries = 3;

    for (let i = 1; i <= maxEntries; i++) {
      const state = stateWithHash(BigInt(i));
      getOrComputeClassification(cache, def, state, moves, undefined, maxEntries);
    }

    assert.equal(cache.size, maxEntries);

    const extraState = stateWithHash(BigInt(maxEntries + 1));
    getOrComputeClassification(cache, def, extraState, moves, undefined, maxEntries);

    assert.ok(cache.size <= maxEntries, `classification cache exceeded max: ${cache.size}`);
  });

  it('cache size never grows unbounded under repeated inserts', () => {
    const cache: StateInfoCache = createStateInfoCache();
    const moves = [makeMove('noop')];
    const maxEntries = 5;

    // Insert 20 entries — cache should never exceed 5.
    for (let i = 1; i <= 20; i++) {
      const state = stateWithHash(BigInt(i));
      getOrInitClassificationEntry(cache, state, moves, maxEntries);
      assert.ok(
        cache.size <= maxEntries,
        `iteration ${i}: cache size ${cache.size} exceeded max ${maxEntries}`,
      );
    }

    assert.equal(cache.size, maxEntries, 'cache should be exactly at max after many inserts');
  });

  it('skips cache for stateHash === 0n (hidden-info states)', () => {
    const cache: StateInfoCache = createStateInfoCache();
    const moves = [makeMove('noop')];
    const zeroHashState = stateWithHash(0n);

    const result = getOrInitClassificationEntry(cache, zeroHashState, moves, 10);

    assert.equal(result, null, 'should return null for uncacheable state');
    assert.equal(cache.size, 0, 'should not add entry for stateHash 0n');
  });

  it('CachedClassificationEntry has correct structure after eviction cycle', () => {
    const cache: StateInfoCache = createStateInfoCache();
    const moves = [makeMove('noop')];
    const maxEntries = 2;

    // Insert 2 entries.
    getOrInitClassificationEntry(cache, stateWithHash(1n), moves, maxEntries);
    getOrInitClassificationEntry(cache, stateWithHash(2n), moves, maxEntries);

    // Insert a 3rd — should evict hash 1n.
    getOrInitClassificationEntry(cache, stateWithHash(3n), moves, maxEntries);

    assert.equal(cache.has(1n), false, 'hash 1n evicted');

    // Verify remaining entries have valid classification structure.
    for (const [hash, entry] of cache) {
      assert.ok(hash > 0n, 'hash should be positive');
      assert.ok(entry.classification !== undefined, 'classification should exist');
      assert.ok(Array.isArray(entry.classification.infos), 'infos should be an array');
      assert.equal(entry.classification.nextUnclassifiedCursor, 0, 'cursor starts at 0');
      assert.equal(entry.classification.exhaustiveScanComplete, false, 'not yet exhausted');
    }
  });
});
