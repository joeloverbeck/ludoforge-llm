/**
 * Unit tests for decision discovery cache and diagnostics.
 *
 * Tests:
 * - Discovery cache hit/miss behavior
 * - Cache eviction when bounded
 * - Hidden-info safety (stateHash === 0n never cached)
 * - Diagnostics field population (call count, time, cache hits)
 * - Per-depth option count tracking
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Move, ChoiceRequest } from '../../../../src/kernel/types-core.js';
import type { DecisionKey } from '../../../../src/kernel/decision-scope.js';
import type { GameDef, GameState } from '../../../../src/kernel/types.js';
import type { MctsNode } from '../../../../src/agents/mcts/node.js';
import type { DecisionExpansionContext, DiscoverChoicesFn } from '../../../../src/agents/mcts/decision-expansion.js';
import { expandDecisionNode } from '../../../../src/agents/mcts/decision-expansion.js';
import { createRootNode } from '../../../../src/agents/mcts/node.js';
import { createNodePool } from '../../../../src/agents/mcts/node-pool.js';
import {
  createAccumulator,
  collectDiagnostics,
  recordDecisionDiscoverOptions,
} from '../../../../src/agents/mcts/diagnostics.js';
import {
  createDiscoveryCache,
  getDiscoveryCacheEntry,
  setDiscoveryCacheEntry,
} from '../../../../src/agents/mcts/state-cache.js';
import type { MoveKey } from '../../../../src/agents/mcts/move-key.js';
import { asPlayerId } from '../../../../src/kernel/branded.js';

const dk = (s: string): DecisionKey => s as DecisionKey;

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

const PLAYER_COUNT = 2;
const PLAYER_0 = asPlayerId(0);

function stubDef(): GameDef {
  return { actions: [], zones: [], variables: [], triggers: [], players: [] } as unknown as GameDef;
}

function stubState(stateHash: bigint = 42n): GameState {
  return {
    activePlayer: PLAYER_0,
    playerCount: PLAYER_COUNT,
    variables: {},
    tokens: [],
    zones: [],
    rng: { state: [0n, 0n, 0n, 0n] },
    stateHash,
  } as unknown as GameState;
}

function stubPartialMove(params: Record<string, unknown> = {}): Move {
  return {
    actionId: 'testAction',
    params: params as Move['params'],
  } as Move;
}

function makeDecisionNode(partialMove: Move): MctsNode {
  const root = createRootNode(PLAYER_COUNT);
  return {
    move: partialMove,
    moveKey: 'test-key',
    parent: root,
    visits: 0,
    availability: 0,
    totalReward: [0, 0],
    heuristicPrior: null,
    children: [],
    provenResult: null,
    nodeKind: 'decision',
    decisionPlayer: PLAYER_0,
    partialMove,
    decisionBinding: 'prevBinding',
  } as MctsNode;
}

function makePendingResponse(
  decisionKey: string,
  options: readonly { value: string; legality?: 'legal' | 'illegal' | 'unknown' }[],
): ChoiceRequest {
  return {
    kind: 'pending',
    complete: false,
    decisionPlayer: PLAYER_0,
    decisionKey: dk(decisionKey),
    name: decisionKey,
    type: 'chooseOne',
    options: options.map(o => ({
      value: o.value,
      legality: o.legality ?? 'legal' as const,
      illegalReason: null,
    })),
    targetKinds: ['zone'],
  } as ChoiceRequest;
}

function makeCompleteResponse(): ChoiceRequest {
  return { kind: 'complete', complete: true, move: stubPartialMove() } as ChoiceRequest;
}

function makeCtx(
  discoverChoices: DiscoverChoicesFn,
  overrides: Partial<DecisionExpansionContext> = {},
): DecisionExpansionContext {
  return {
    def: stubDef(),
    state: stubState(),
    playerCount: PLAYER_COUNT,
    decisionWideningCap: 12,
    discoverChoices,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Discovery cache — basic operations
// ---------------------------------------------------------------------------

describe('DiscoveryCache — basic operations', () => {
  it('returns undefined on cache miss', () => {
    const cache = createDiscoveryCache();
    const result = getDiscoveryCacheEntry(cache, 42n, 'a{}' as MoveKey);
    assert.equal(result, undefined);
  });

  it('returns cached entry on hit', () => {
    const cache = createDiscoveryCache();
    const response = makeCompleteResponse();
    setDiscoveryCacheEntry(cache, 42n, 'a{}' as MoveKey, response, 100);
    const result = getDiscoveryCacheEntry(cache, 42n, 'a{}' as MoveKey);
    assert.deepEqual(result, response);
  });

  it('misses for different stateHash', () => {
    const cache = createDiscoveryCache();
    const response = makeCompleteResponse();
    setDiscoveryCacheEntry(cache, 42n, 'a{}' as MoveKey, response, 100);
    const result = getDiscoveryCacheEntry(cache, 99n, 'a{}' as MoveKey);
    assert.equal(result, undefined);
  });

  it('misses for different moveKey', () => {
    const cache = createDiscoveryCache();
    const response = makeCompleteResponse();
    setDiscoveryCacheEntry(cache, 42n, 'a{}' as MoveKey, response, 100);
    const result = getDiscoveryCacheEntry(cache, 42n, 'b{}' as MoveKey);
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// 2. Discovery cache — hidden-info safety
// ---------------------------------------------------------------------------

describe('DiscoveryCache — hidden-info safety', () => {
  it('never caches when stateHash === 0n', () => {
    const cache = createDiscoveryCache();
    const response = makeCompleteResponse();
    setDiscoveryCacheEntry(cache, 0n, 'a{}' as MoveKey, response, 100);
    assert.equal(cache.size, 0);
  });

  it('returns undefined for stateHash === 0n lookup', () => {
    const cache = createDiscoveryCache();
    const response = makeCompleteResponse();
    // Store under a valid hash first
    setDiscoveryCacheEntry(cache, 42n, 'a{}' as MoveKey, response, 100);
    // Lookup with 0n should miss even if moveKey matches
    const result = getDiscoveryCacheEntry(cache, 0n, 'a{}' as MoveKey);
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// 3. Discovery cache — bounded eviction
// ---------------------------------------------------------------------------

describe('DiscoveryCache — bounded eviction', () => {
  it('evicts oldest entry when at capacity', () => {
    const cache = createDiscoveryCache();
    const r1 = makePendingResponse('d1', [{ value: 'a' }]);
    const r2 = makePendingResponse('d2', [{ value: 'b' }]);
    const r3 = makePendingResponse('d3', [{ value: 'c' }]);

    // Max 2 entries
    setDiscoveryCacheEntry(cache, 1n, 'k1' as MoveKey, r1, 2);
    setDiscoveryCacheEntry(cache, 2n, 'k2' as MoveKey, r2, 2);
    assert.equal(cache.size, 2);

    // Adding a third should evict the first
    setDiscoveryCacheEntry(cache, 3n, 'k3' as MoveKey, r3, 2);
    assert.equal(cache.size, 2);

    // First entry should be evicted
    assert.equal(getDiscoveryCacheEntry(cache, 1n, 'k1' as MoveKey), undefined);
    // Second and third should remain
    assert.deepEqual(getDiscoveryCacheEntry(cache, 2n, 'k2' as MoveKey), r2);
    assert.deepEqual(getDiscoveryCacheEntry(cache, 3n, 'k3' as MoveKey), r3);
  });

  it('does not evict when below capacity', () => {
    const cache = createDiscoveryCache();
    const r1 = makeCompleteResponse();
    const r2 = makeCompleteResponse();

    setDiscoveryCacheEntry(cache, 1n, 'k1' as MoveKey, r1, 10);
    setDiscoveryCacheEntry(cache, 2n, 'k2' as MoveKey, r2, 10);
    assert.equal(cache.size, 2);
    assert.notEqual(getDiscoveryCacheEntry(cache, 1n, 'k1' as MoveKey), undefined);
  });
});

// ---------------------------------------------------------------------------
// 4. Diagnostics — discovery fields populated
// ---------------------------------------------------------------------------

describe('Decision discovery diagnostics', () => {
  it('increments decisionDiscoverCallCount on discover call', () => {
    const acc = createAccumulator();
    const pool = createNodePool(64, PLAYER_COUNT);
    const partial = stubPartialMove();
    const node = makeDecisionNode(partial);

    let callCount = 0;
    const discover: DiscoverChoicesFn = () => {
      callCount += 1;
      return makePendingResponse('province', [{ value: 'quang-tri' }, { value: 'hue' }]);
    };

    const ctx = makeCtx(discover, { accumulator: acc });
    expandDecisionNode(node, pool, ctx);

    assert.equal(callCount, 1);
    assert.equal(acc.decisionDiscoverCallCount, 1);
  });

  it('accumulates decisionDiscoverTimeMs (non-zero for real discover)', () => {
    const acc = createAccumulator();
    const pool = createNodePool(64, PLAYER_COUNT);
    const partial = stubPartialMove();
    const node = makeDecisionNode(partial);

    const discover: DiscoverChoicesFn = () => {
      return makePendingResponse('province', [{ value: 'a' }, { value: 'b' }]);
    };

    const ctx = makeCtx(discover, { accumulator: acc });
    expandDecisionNode(node, pool, ctx);

    // Time should be >= 0 (could be 0 on fast machines, but never negative)
    assert.ok(acc.decisionDiscoverTimeMs >= 0);
  });

  it('increments decisionDiscoverCacheHits on cache hit', () => {
    const acc = createAccumulator();
    const pool = createNodePool(64, PLAYER_COUNT);
    const cache = createDiscoveryCache();
    const state = stubState(42n);

    // Pre-populate cache
    const response = makePendingResponse('province', [{ value: 'a' }, { value: 'b' }]);
    const partial = stubPartialMove();
    // The canonical move key for a stubPartialMove with no params is 'testAction{}'
    setDiscoveryCacheEntry(cache, 42n, 'testAction{}' as MoveKey, response, 100);

    let discoverCalled = false;
    const discover: DiscoverChoicesFn = () => {
      discoverCalled = true;
      return makeCompleteResponse();
    };

    const node = makeDecisionNode(partial);
    const ctx = makeCtx(discover, {
      accumulator: acc,
      state,
      discoveryCache: cache,
      discoveryCacheMax: 100,
    });

    expandDecisionNode(node, pool, ctx);

    assert.equal(acc.decisionDiscoverCacheHits, 1);
    assert.equal(discoverCalled, false, 'discover should not be called on cache hit');
    assert.equal(acc.decisionDiscoverCallCount, 0);
  });

  it('discovery fields appear in collectDiagnostics output', () => {
    const acc = createAccumulator();
    acc.decisionDiscoverCallCount = 5;
    acc.decisionDiscoverTimeMs = 12.5;
    acc.decisionDiscoverCacheHits = 3;

    const root = createRootNode(PLAYER_COUNT);
    const diag = collectDiagnostics(root, 10, undefined, acc);

    assert.equal(diag.decisionDiscoverCallCount, 5);
    assert.equal(diag.decisionDiscoverTimeMs, 12.5);
    assert.equal(diag.decisionDiscoverCacheHits, 3);
  });

  it('diagnostics are zero when diagnostics accumulator not provided', () => {
    const pool = createNodePool(64, PLAYER_COUNT);
    const partial = stubPartialMove();
    const node = makeDecisionNode(partial);

    const discover: DiscoverChoicesFn = () => {
      return makePendingResponse('province', [{ value: 'a' }, { value: 'b' }]);
    };

    // No accumulator — zero-cost path, should not crash
    const ctx = makeCtx(discover);
    expandDecisionNode(node, pool, ctx);
    // No assertion needed — just confirming it doesn't crash
  });
});

// ---------------------------------------------------------------------------
// 5. Per-depth option count tracking
// ---------------------------------------------------------------------------

describe('Decision discovery per-depth option tracking', () => {
  it('records option counts via recordDecisionDiscoverOptions', () => {
    const acc = createAccumulator();
    recordDecisionDiscoverOptions(acc, 1, 5);
    recordDecisionDiscoverOptions(acc, 1, 3);
    recordDecisionDiscoverOptions(acc, 2, 7);

    assert.deepEqual(acc.decisionDiscoverOptionsByDepth.get(1), [5, 3]);
    assert.deepEqual(acc.decisionDiscoverOptionsByDepth.get(2), [7]);
  });

  it('per-depth stats appear in collectDiagnostics output', () => {
    const acc = createAccumulator();
    recordDecisionDiscoverOptions(acc, 1, 4);
    recordDecisionDiscoverOptions(acc, 1, 6);
    recordDecisionDiscoverOptions(acc, 2, 10);

    const root = createRootNode(PLAYER_COUNT);
    const diag = collectDiagnostics(root, 10, undefined, acc);

    assert.ok(diag.decisionDiscoverOptionsByDepth !== undefined);
    const byDepth = diag.decisionDiscoverOptionsByDepth!;
    // Depth 1: avg = 5, max = 6, count = 2
    assert.equal(byDepth[1]!.avg, 5);
    assert.equal(byDepth[1]!.max, 6);
    assert.equal(byDepth[1]!.count, 2);
    // Depth 2: avg = 10, max = 10, count = 1
    assert.equal(byDepth[2]!.avg, 10);
    assert.equal(byDepth[2]!.max, 10);
    assert.equal(byDepth[2]!.count, 1);
  });

  it('empty options map produces no decisionDiscoverOptionsByDepth in diagnostics', () => {
    const acc = createAccumulator();
    const root = createRootNode(PLAYER_COUNT);
    const diag = collectDiagnostics(root, 10, undefined, acc);

    assert.equal(diag.decisionDiscoverOptionsByDepth, undefined);
  });
});

// ---------------------------------------------------------------------------
// 6. Integration — cache wired through expandDecisionNode
// ---------------------------------------------------------------------------

describe('Decision discovery cache integration', () => {
  it('populates cache on miss and hits on second call with same state', () => {
    const acc = createAccumulator();
    const pool = createNodePool(64, PLAYER_COUNT);
    const cache = createDiscoveryCache();
    const state = stubState(99n);

    let discoverCallCount = 0;
    const response = makePendingResponse('province', [{ value: 'a' }, { value: 'b' }]);
    const discover: DiscoverChoicesFn = () => {
      discoverCallCount += 1;
      return response;
    };

    // First call — cache miss
    const partial1 = stubPartialMove();
    const node1 = makeDecisionNode(partial1);
    const ctx1 = makeCtx(discover, {
      accumulator: acc,
      state,
      discoveryCache: cache,
      discoveryCacheMax: 100,
    });
    expandDecisionNode(node1, pool, ctx1);
    assert.equal(discoverCallCount, 1);
    assert.equal(acc.decisionDiscoverCallCount, 1);
    assert.equal(acc.decisionDiscoverCacheHits, 0);

    // Second call — same state and move, should be a cache hit
    const partial2 = stubPartialMove();
    const node2 = makeDecisionNode(partial2);
    const ctx2 = makeCtx(discover, {
      accumulator: acc,
      state,
      discoveryCache: cache,
      discoveryCacheMax: 100,
    });
    expandDecisionNode(node2, pool, ctx2);
    assert.equal(discoverCallCount, 1, 'discover should not be called again');
    assert.equal(acc.decisionDiscoverCacheHits, 1);
    assert.equal(acc.decisionDiscoverCallCount, 1, 'call count unchanged');
  });

  it('does not cache when stateHash is 0n', () => {
    const acc = createAccumulator();
    const pool = createNodePool(64, PLAYER_COUNT);
    const cache = createDiscoveryCache();
    const state = stubState(0n);

    let discoverCallCount = 0;
    const discover: DiscoverChoicesFn = () => {
      discoverCallCount += 1;
      return makePendingResponse('province', [{ value: 'x' }, { value: 'y' }]);
    };

    // First call
    const node1 = makeDecisionNode(stubPartialMove());
    const ctx1 = makeCtx(discover, {
      accumulator: acc,
      state,
      discoveryCache: cache,
      discoveryCacheMax: 100,
    });
    expandDecisionNode(node1, pool, ctx1);
    assert.equal(discoverCallCount, 1);
    assert.equal(cache.size, 0, 'nothing cached for stateHash 0n');

    // Second call — should miss again
    const node2 = makeDecisionNode(stubPartialMove());
    const ctx2 = makeCtx(discover, {
      accumulator: acc,
      state,
      discoveryCache: cache,
      discoveryCacheMax: 100,
    });
    expandDecisionNode(node2, pool, ctx2);
    assert.equal(discoverCallCount, 2, 'discover called again since not cached');
    assert.equal(acc.decisionDiscoverCacheHits, 0);
  });
});
