// @test-class: architectural-invariant
//
// Spec 168 Phase 1: run-local persistent token-state-index cache.

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  forkGameDefRuntimeForRun,
} from '../../src/kernel/gamedef-runtime.js';
import {
  getTokenStateIndex,
  type TokenStateIndexEntry,
  __internal_for_tests,
} from '../../src/kernel/token-state-index.js';
import type { GameState } from '../../src/kernel/types-core.js';
import { LruCache } from '../../src/shared/lru-cache.js';
import {
  collectChooseOneDriveFixtures,
} from '../helpers/drive-parity-helpers.js';
import {
  createFitlRuntime,
  FITL_PLAYER_COUNT,
} from '../helpers/zobrist-incremental-property-helpers.js';

describe('Spec 168 persistent token-state-index cache', () => {
  it('returns byte-identical indexes for FITL canary states on cache hits and misses', () => {
    const { def, runtime } = createFitlRuntime();
    const forkedRuntime = forkGameDefRuntimeForRun(runtime);
    const fixtures = collectChooseOneDriveFixtures(def, forkedRuntime, {
      seed: 1,
      playerCount: FITL_PLAYER_COUNT,
      count: 3,
      expectedMinDepth: 1,
      maxSteps: 24,
    });
    __internal_for_tests.resetBuildTokenStateIndexCount();

    for (const fixture of fixtures) {
      const missState = cloneState(fixture.state);
      const hitState = cloneState(fixture.state);

      const missIndex = getTokenStateIndex(missState, forkedRuntime.tokenStateIndexCache);
      const hitIndex = getTokenStateIndex(hitState, forkedRuntime.tokenStateIndexCache);
      assertIndexMatchesFreshRebuild(`${fixture.label}: miss`, missState, missIndex);
      assertIndexMatchesFreshRebuild(`${fixture.label}: hit`, hitState, hitIndex);
      assert.deepEqual(toSortedEntries(hitIndex), toSortedEntries(missIndex), `${fixture.label}: hit differs from miss`);
    }

    assert.ok(
      __internal_for_tests.getPersistentTokenStateIndexCacheHitCount() >= fixtures.length,
      'expected persistent cache hits for cloned canonical states',
    );
    assert.ok(
      __internal_for_tests.getPersistentTokenStateIndexCacheMissCount() >= fixtures.length,
      'expected persistent cache misses for first reads',
    );
    assert.ok(
      __internal_for_tests.getPersistentTokenStateIndexCacheWriteCount() >= fixtures.length,
      'expected persistent cache writes for first reads',
    );
  });

  it('forks tokenStateIndexCache as run-local state', () => {
    const { def, runtime } = createFitlRuntime();
    const fixture = collectChooseOneDriveFixtures(def, runtime, {
      seed: 1,
      playerCount: FITL_PLAYER_COUNT,
      count: 1,
      expectedMinDepth: 1,
      maxSteps: 24,
    })[0]!;

    getTokenStateIndex(cloneState(fixture.state), runtime.tokenStateIndexCache);
    assert.equal(runtime.tokenStateIndexCache.size, 1);

    const forked = forkGameDefRuntimeForRun(runtime);
    assert.notEqual(forked.tokenStateIndexCache, runtime.tokenStateIndexCache);
    assert.equal(forked.tokenStateIndexCache.size, 0);
  });

  it('evicts deterministically by least-recently-used state hash', () => {
    const cache = new LruCache<bigint, ReadonlyMap<string, TokenStateIndexEntry>>(2);
    const first = new Map<string, TokenStateIndexEntry>();
    const second = new Map<string, TokenStateIndexEntry>();
    const third = new Map<string, TokenStateIndexEntry>();

    cache.set(1n, first);
    cache.set(2n, second);
    assert.equal(cache.get(1n), first);
    cache.set(3n, third);

    assert.equal(cache.get(2n), undefined);
    assert.equal(cache.get(1n), first);
    assert.equal(cache.get(3n), third);
  });

  it('protects persistent snapshots from mutable-zone refresh detaches', () => {
    const { def, runtime } = createFitlRuntime();
    const fixture = collectChooseOneDriveFixtures(def, runtime, {
      seed: 1,
      playerCount: FITL_PLAYER_COUNT,
      count: 1,
      expectedMinDepth: 1,
      maxSteps: 24,
    })[0]!;
    const cachedState = cloneState(fixture.state);
    const mutableState = cloneState(fixture.state);

    const persistentIndex = getTokenStateIndex(cachedState, runtime.tokenStateIndexCache);
    const sharedIndex = getTokenStateIndex(mutableState, runtime.tokenStateIndexCache);
    assert.equal(sharedIndex, persistentIndex);

    const firstZoneId = Object.keys(mutableState.zones)[0]!;
    (mutableState.zones as Record<string, readonly unknown[]>)[firstZoneId] = [];
    const refreshed = __internal_for_tests.refreshCachedEntriesForTest(
      mutableState,
      new Set([...persistentIndex.keys()]),
      new Set([firstZoneId]),
    );

    assert.equal(refreshed, true);
    assert.equal(getTokenStateIndex(cachedState, runtime.tokenStateIndexCache), persistentIndex);
    assert.notEqual(getTokenStateIndex(mutableState, runtime.tokenStateIndexCache), persistentIndex);
    assertIndexMatchesFreshRebuild('persistent canonical snapshot', cachedState, persistentIndex);
    assertIndexMatchesFreshRebuild('mutable state detached index', mutableState, getTokenStateIndex(mutableState));
  });
});

function cloneState(state: GameState): GameState {
  return structuredClone(state) as GameState;
}

function assertIndexMatchesFreshRebuild(
  label: string,
  state: GameState,
  actual: ReadonlyMap<string, TokenStateIndexEntry>,
): void {
  const expected = __internal_for_tests.buildTokenStateIndex(state);
  assert.deepEqual(toSortedEntries(actual), toSortedEntries(expected), label);
}

function toSortedEntries(index: ReadonlyMap<string, TokenStateIndexEntry>): readonly (readonly [string, TokenStateIndexEntry])[] {
  return [...index.entries()].sort(([left], [right]) => left.localeCompare(right));
}
