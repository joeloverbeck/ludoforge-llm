import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createStateInfoCache,
  evictIfNeeded,
  getOrComputeTerminal,
  getOrComputeLegalMoves,
  getOrComputeRewards,
} from '../../../../src/agents/mcts/state-cache.js';
import { createAccumulator } from '../../../../src/agents/mcts/diagnostics.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
  type GameState,
} from '../../../../src/kernel/index.js';
import { createGameDefRuntime } from '../../../../src/kernel/gamedef-runtime.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createSimpleDef(): GameDef {
  return {
    metadata: { id: 'cache-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'ended', type: 'int', init: 0, min: 0, max: 1 }],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('win'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [{ setVar: { scope: 'global', var: 'ended', value: 1 } }],
        limits: [],
      },
      {
        id: asActionId('noop'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [
        {
          when: { op: '==', left: { ref: 'gvar', var: 'ended' }, right: 1 },
          result: { type: 'win', player: { id: asPlayerId(0) } },
        },
      ],
    },
  } as unknown as GameDef;
}

function createTestState(def: GameDef, seed: number = 42): { state: GameState; runtime: ReturnType<typeof createGameDefRuntime> } {
  const { state } = initialState(def, seed, 2);
  const runtime = createGameDefRuntime(def);
  return { state, runtime };
}

/** Create a state with stateHash === 0n (simulates hidden-info). */
function createZeroHashState(state: GameState): GameState {
  return { ...state, stateHash: 0n };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('state-cache', () => {
  describe('createStateInfoCache', () => {
    it('creates an empty Map', () => {
      const cache = createStateInfoCache();
      assert.equal(cache.size, 0);
      assert.ok(cache instanceof Map);
    });
  });

  describe('evictIfNeeded', () => {
    it('deletes the first (oldest) entry when capacity is reached', () => {
      const cache = createStateInfoCache();
      cache.set(1n, { terminal: null });
      cache.set(2n, { terminal: null });
      cache.set(3n, { terminal: null });
      assert.equal(cache.size, 3);

      evictIfNeeded(cache, 3);
      assert.equal(cache.size, 2);
      assert.ok(!cache.has(1n), 'oldest entry (1n) should be evicted');
      assert.ok(cache.has(2n));
      assert.ok(cache.has(3n));
    });

    it('does nothing when cache is below capacity', () => {
      const cache = createStateInfoCache();
      cache.set(1n, { terminal: null });
      cache.set(2n, { terminal: null });

      evictIfNeeded(cache, 5);
      assert.equal(cache.size, 2);
    });

    it('evicts exactly one entry when at capacity', () => {
      const cache = createStateInfoCache();
      for (let i = 1n; i <= 10n; i++) {
        cache.set(i, { terminal: null });
      }
      assert.equal(cache.size, 10);

      evictIfNeeded(cache, 10);
      assert.equal(cache.size, 9);
      assert.ok(!cache.has(1n));
    });
  });

  describe('getOrComputeTerminal', () => {
    it('returns cached result on second call with same stateHash', () => {
      const def = createSimpleDef();
      const { state, runtime } = createTestState(def);
      const cache = createStateInfoCache();
      const acc = createAccumulator();

      // First call — computes
      const result1 = getOrComputeTerminal(cache, def, state, runtime, 100, acc);

      // Should have incremented terminalCalls
      const callsAfterFirst = acc.terminalCalls;
      assert.ok(callsAfterFirst > 0, 'should have computed terminal');

      // Second call — should use cache
      const result2 = getOrComputeTerminal(cache, def, state, runtime, 100, acc);

      assert.deepStrictEqual(result1, result2, 'cached result should match');
      assert.equal(acc.terminalCalls, callsAfterFirst, 'should not recompute');
      assert.ok(acc.terminalCacheHits > 0, 'should record cache hit');
    });

    it('bypasses cache when stateHash === 0n', () => {
      const def = createSimpleDef();
      const { state, runtime } = createTestState(def);
      const zeroState = createZeroHashState(state);
      const cache = createStateInfoCache();
      const acc = createAccumulator();

      getOrComputeTerminal(cache, def, zeroState, runtime, 100, acc);
      getOrComputeTerminal(cache, def, zeroState, runtime, 100, acc);

      assert.equal(cache.size, 0, 'nothing should be cached for stateHash === 0n');
      assert.equal(acc.stateCacheLookups, 0, 'no lookups for stateHash === 0n');
      assert.equal(acc.terminalCalls, 2, 'should compute each time');
    });

    it('increments stateCacheLookups and stateCacheHits correctly', () => {
      const def = createSimpleDef();
      const { state, runtime } = createTestState(def);
      const cache = createStateInfoCache();
      const acc = createAccumulator();

      // First call: lookup + miss
      getOrComputeTerminal(cache, def, state, runtime, 100, acc);
      assert.equal(acc.stateCacheLookups, 1);
      assert.equal(acc.stateCacheHits, 0);

      // Second call: lookup + hit
      getOrComputeTerminal(cache, def, state, runtime, 100, acc);
      assert.equal(acc.stateCacheLookups, 2);
      assert.equal(acc.stateCacheHits, 1);
      assert.equal(acc.terminalCacheHits, 1);
    });
  });

  describe('getOrComputeLegalMoves', () => {
    it('returns cached result on second call with same stateHash', () => {
      const def = createSimpleDef();
      const { state, runtime } = createTestState(def);
      const cache = createStateInfoCache();
      const acc = createAccumulator();

      const result1 = getOrComputeLegalMoves(cache, def, state, runtime, 100, acc);
      const callsAfterFirst = acc.legalMovesCalls;

      const result2 = getOrComputeLegalMoves(cache, def, state, runtime, 100, acc);

      assert.deepStrictEqual(result1, result2);
      assert.equal(acc.legalMovesCalls, callsAfterFirst, 'should not recompute');
      assert.ok(acc.legalMovesCacheHits > 0, 'should record cache hit');
    });

    it('bypasses cache when stateHash === 0n', () => {
      const def = createSimpleDef();
      const { state, runtime } = createTestState(def);
      const zeroState = createZeroHashState(state);
      const cache = createStateInfoCache();
      const acc = createAccumulator();

      getOrComputeLegalMoves(cache, def, zeroState, runtime, 100, acc);
      getOrComputeLegalMoves(cache, def, zeroState, runtime, 100, acc);

      assert.equal(cache.size, 0);
      assert.equal(acc.legalMovesCalls, 2, 'should compute each time');
    });
  });

  describe('getOrComputeRewards', () => {
    it('returns cached result on second call with same stateHash', () => {
      const def = createSimpleDef();
      const { state, runtime } = createTestState(def);
      const cache = createStateInfoCache();
      const acc = createAccumulator();
      const config = { heuristicTemperature: 10_000 };

      const result1 = getOrComputeRewards(cache, def, state, config, runtime, 100, acc);
      const callsAfterFirst = acc.evaluateStateCalls;

      const result2 = getOrComputeRewards(cache, def, state, config, runtime, 100, acc);

      assert.deepStrictEqual(result1, result2);
      assert.equal(acc.evaluateStateCalls, callsAfterFirst, 'should not recompute');
      assert.ok(acc.rewardCacheHits > 0, 'should record cache hit');
    });

    it('bypasses cache when stateHash === 0n', () => {
      const def = createSimpleDef();
      const { state, runtime } = createTestState(def);
      const zeroState = createZeroHashState(state);
      const cache = createStateInfoCache();
      const acc = createAccumulator();
      const config = { heuristicTemperature: 10_000 };

      getOrComputeRewards(cache, def, zeroState, config, runtime, 100, acc);
      getOrComputeRewards(cache, def, zeroState, config, runtime, 100, acc);

      assert.equal(cache.size, 0);
      assert.equal(acc.evaluateStateCalls, 2);
    });
  });

  describe('cache size limits', () => {
    it('cache size never exceeds maxEntries', () => {
      const def = createSimpleDef();
      const { runtime } = createTestState(def);
      const cache = createStateInfoCache();
      const maxEntries = 3;

      // Insert entries with different stateHashes by modifying the hash directly
      for (let i = 1; i <= 10; i++) {
        const { state } = initialState(def, i, 2);
        // Force unique hashes by using states from different seeds
        getOrComputeTerminal(cache, def, state, runtime, maxEntries);
      }

      assert.ok(cache.size <= maxEntries, `cache size ${cache.size} should not exceed ${maxEntries}`);
    });
  });

  describe('mixed-type caching', () => {
    it('caches terminal and legalMoves independently for same stateHash', () => {
      const def = createSimpleDef();
      const { state, runtime } = createTestState(def);
      const cache = createStateInfoCache();

      getOrComputeTerminal(cache, def, state, runtime, 100);
      getOrComputeLegalMoves(cache, def, state, runtime, 100);

      const entry = cache.get(state.stateHash);
      assert.ok(entry !== undefined, 'entry should exist');
      assert.ok(entry.terminal !== undefined, 'terminal should be cached');
      assert.ok(entry.legalMoves !== undefined, 'legalMoves should be cached');
    });
  });

  describe('diagnostics counter wiring', () => {
    it('cache hit/miss counters are correct after multiple lookups', () => {
      const def = createSimpleDef();
      const { state, runtime } = createTestState(def);
      const cache = createStateInfoCache();
      const acc = createAccumulator();

      // 3 terminal lookups on same state: 1 miss + 2 hits
      getOrComputeTerminal(cache, def, state, runtime, 100, acc);
      getOrComputeTerminal(cache, def, state, runtime, 100, acc);
      getOrComputeTerminal(cache, def, state, runtime, 100, acc);

      // 2 legalMoves lookups: 1 miss + 1 hit
      getOrComputeLegalMoves(cache, def, state, runtime, 100, acc);
      getOrComputeLegalMoves(cache, def, state, runtime, 100, acc);

      assert.equal(acc.stateCacheLookups, 5, '5 total lookups');
      assert.equal(acc.stateCacheHits, 3, '3 total hits (2 terminal + 1 legalMoves)');
      assert.equal(acc.terminalCacheHits, 2);
      assert.equal(acc.legalMovesCacheHits, 1);
      assert.equal(acc.terminalCalls, 1, 'only 1 actual terminal computation');
      assert.equal(acc.legalMovesCalls, 1, 'only 1 actual legalMoves computation');
    });
  });
});
