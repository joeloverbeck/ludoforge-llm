import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asPhaseId, asPlayerId, asTokenId } from '../../../src/kernel/index.js';
import { computeDeltas } from '../../../src/sim/index.js';
import type { GameState, Token } from '../../../src/kernel/index.js';

const makeToken = (id: string): Token => ({
  id: asTokenId(id),
  type: 'card',
  props: {},
});

const makeState = (overrides: Partial<GameState> = {}): GameState => ({
  globalVars: { round: 1, score: 0 },
  perPlayerVars: {
    '0': { vp: 0, energy: 1 },
    '1': { vp: 0, energy: 1 },
  },
  playerCount: 2,
  zones: {
    deck: [makeToken('t1')],
    hand: [makeToken('t2')],
    discard: [],
  },
  nextTokenOrdinal: 3,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [11n, 22n] },
  stateHash: 123n,
  actionUsage: {},
  ...overrides,
});

describe('computeDeltas', () => {
  it('emits one delta for one global var change', () => {
    const pre = makeState();
    const post = makeState({
      globalVars: { ...pre.globalVars, round: 2 },
    });

    const deltas = computeDeltas(pre, post);

    assert.deepEqual(deltas, [{ path: 'globalVars.round', before: 1, after: 2 }]);
  });

  it('emits per-player variable deltas at player-scoped paths', () => {
    const pre = makeState();
    const post = makeState({
      perPlayerVars: {
        ...pre.perPlayerVars,
        '1': { ...pre.perPlayerVars['1'], vp: 4 },
      },
    });

    const deltas = computeDeltas(pre, post);

    assert.deepEqual(deltas, [{ path: 'perPlayerVars.1.vp', before: 0, after: 4 }]);
  });

  it('emits zone-level token-id arrays for changed zones', () => {
    const pre = makeState({
      zones: {
        deck: [makeToken('t1')],
        hand: [makeToken('t2')],
        discard: [],
      },
    });
    const post = makeState({
      zones: {
        deck: [],
        hand: [makeToken('t2'), makeToken('t1')],
        discard: [],
      },
    });

    const deltas = computeDeltas(pre, post);

    assert.deepEqual(deltas, [
      { path: 'zones.deck', before: ['t1'], after: [] },
      { path: 'zones.hand', before: ['t2'], after: ['t2', 't1'] },
    ]);
  });

  it('emits phase, active player, and turn count transitions', () => {
    const pre = makeState();
    const post = makeState({
      currentPhase: asPhaseId('cleanup'),
      activePlayer: asPlayerId(1),
      turnCount: 2,
    });

    const deltas = computeDeltas(pre, post);

    assert.deepEqual(deltas, [
      { path: 'activePlayer', before: 0, after: 1 },
      { path: 'currentPhase', before: 'main', after: 'cleanup' },
      { path: 'turnCount', before: 1, after: 2 },
    ]);
  });

  it('ignores rng and stateHash changes when tracked fields are unchanged', () => {
    const pre = makeState();
    const post = makeState({
      rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [99n, 100n] },
      stateHash: 999n,
    });

    const deltas = computeDeltas(pre, post);

    assert.deepEqual(deltas, []);
  });

  it('returns path-sorted deterministic output', () => {
    const pre = makeState();
    const post = makeState({
      globalVars: { ...pre.globalVars, score: 5 },
      perPlayerVars: {
        ...pre.perPlayerVars,
        '0': { ...pre.perPlayerVars['0'], energy: 3 },
      },
      zones: {
        ...pre.zones,
        discard: [makeToken('t3')],
      },
      turnCount: 2,
      activePlayer: asPlayerId(1),
      currentPhase: asPhaseId('cleanup'),
      rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [7n, 8n] },
      stateHash: 42n,
    });

    const first = computeDeltas(pre, post);
    const second = computeDeltas(pre, post);

    assert.deepEqual(first, second);
    assert.deepEqual(
      first.map((delta) => delta.path),
      [
        'activePlayer',
        'currentPhase',
        'globalVars.score',
        'perPlayerVars.0.energy',
        'turnCount',
        'zones.discard',
      ],
    );
  });

  it('emits deterministic deltas for added and removed tracked keys', () => {
    const pre = makeState({
      globalVars: { round: 1 },
      perPlayerVars: { '0': { vp: 1 } },
      zones: { deck: [makeToken('t1')] },
    });
    const post = makeState({
      globalVars: { round: 1, score: 2 },
      perPlayerVars: { '0': {} },
      zones: { deck: [makeToken('t1')], hand: [makeToken('t2')] },
    });

    const deltas = computeDeltas(pre, post);

    assert.deepEqual(deltas, [
      { path: 'globalVars.score', before: undefined, after: 2 },
      { path: 'perPlayerVars.0.vp', before: 1, after: undefined },
      { path: 'zones.hand', before: [], after: ['t2'] },
    ]);
  });
});
