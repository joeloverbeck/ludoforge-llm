import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  applyEffect,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createRng,
  isEffectErrorCode,
  nextInt,
  type EffectContext,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effects-zone-ops-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [asZoneId('discard:none')] },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [], activePlayerOrder: 'roundRobin' },
  actions: [],
  triggers: [],
  endConditions: [],
});

const token = (id: string, rank: number): Token => ({
  id: asTokenId(id),
  type: 'card',
  props: { rank },
});

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'deck:none': [token('d1', 1), token('d2', 2), token('d3', 3), token('d4', 1)],
    'discard:none': [token('x1', 9)],
    'board:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
});

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => ({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph(makeDef().zones),
  state: makeState(),
  rng: createRng(123n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  ...overrides,
});

describe('effects moveAll and shuffle', () => {
  it('moveAll without filter moves all tokens and preserves source order', () => {
    const ctx = makeCtx();

    const result = applyEffect({ moveAll: { from: 'deck:none', to: 'discard:none' } }, ctx);

    assert.equal(result.state.zones['deck:none']?.length, 0);
    assert.deepEqual(
      result.state.zones['discard:none']?.map((entry) => entry.id),
      [asTokenId('d1'), asTokenId('d2'), asTokenId('d3'), asTokenId('d4'), asTokenId('x1')],
    );
    assert.equal(result.rng, ctx.rng);
  });

  it('moveAll with filter moves only matching tokens and preserves relative order', () => {
    const ctx = makeCtx();

    const result = applyEffect(
      {
        moveAll: {
          from: 'deck:none',
          to: 'discard:none',
          filter: {
            op: '>=',
            left: { ref: 'tokenProp', token: '$token', prop: 'rank' },
            right: 2,
          },
        },
      },
      ctx,
    );

    assert.deepEqual(
      result.state.zones['deck:none']?.map((entry) => entry.id),
      [asTokenId('d1'), asTokenId('d4')],
    );
    assert.deepEqual(
      result.state.zones['discard:none']?.map((entry) => entry.id),
      [asTokenId('d2'), asTokenId('d3'), asTokenId('x1')],
    );
  });

  it('moveAll same source and destination is a no-op', () => {
    const ctx = makeCtx();

    const result = applyEffect({ moveAll: { from: 'deck:none', to: 'deck:none' } }, ctx);

    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('moveAll on empty source is a no-op', () => {
    const state = makeState();
    const ctx = makeCtx({
      state: {
        ...state,
        zones: {
          ...state.zones,
          'deck:none': [],
        },
      },
    });

    const result = applyEffect({ moveAll: { from: 'deck:none', to: 'discard:none' } }, ctx);

    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('shuffle yields deterministic order for known seed', () => {
    const ctx = makeCtx({ rng: createRng(7n) });
    const original = ctx.state.zones['deck:none'] ?? [];

    const expected = [...original];
    let expectedRng = ctx.rng;
    for (let index = expected.length - 1; index > 0; index -= 1) {
      const [swapIndex, nextRngState] = nextInt(expectedRng, 0, index);
      expectedRng = nextRngState;
      if (swapIndex !== index) {
        const temp = expected[index]!;
        expected[index] = expected[swapIndex]!;
        expected[swapIndex] = temp;
      }
    }

    const result = applyEffect({ shuffle: { zone: 'deck:none' } }, ctx);

    assert.deepEqual(
      result.state.zones['deck:none']?.map((entry) => entry.id),
      expected.map((entry) => entry.id),
    );
    assert.deepEqual(result.rng.state, expectedRng.state);
  });

  it('shuffle advances rng state for zone size >= 2', () => {
    const ctx = makeCtx({ rng: createRng(11n) });

    const result = applyEffect({ shuffle: { zone: 'deck:none' } }, ctx);

    assert.notDeepEqual(result.rng.state, ctx.rng.state);
  });

  it('shuffle leaves state and rng unchanged for zones of size 0 or 1', () => {
    const state = makeState();
    const ctx = makeCtx({
      rng: createRng(29n),
      state: {
        ...state,
        zones: {
          ...state.zones,
          'board:none': [],
          'discard:none': [token('only', 1)],
        },
      },
    });

    const emptyResult = applyEffect({ shuffle: { zone: 'board:none' } }, ctx);
    assert.equal(emptyResult.state, ctx.state);
    assert.equal(emptyResult.rng, ctx.rng);

    const singleResult = applyEffect({ shuffle: { zone: 'discard:none' } }, ctx);
    assert.equal(singleResult.state, ctx.state);
    assert.equal(singleResult.rng, ctx.rng);
  });

  it('moveTokenAdjacent without direction throws SPATIAL_DESTINATION_REQUIRED', () => {
    const ctx = makeCtx();
    const effect = { moveTokenAdjacent: { token: '$token', from: 'board:none' } } as const;

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'SPATIAL_DESTINATION_REQUIRED');
    });
  });
});
