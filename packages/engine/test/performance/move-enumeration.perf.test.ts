import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  legalMoves,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

import { toMoveIdentityKey } from '../../src/kernel/move-identity.js';

const makeSimpleDef = (): GameDef =>
  ({
    metadata: { id: 'perf-simple', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 100 }],
    perPlayerVars: [{ name: 'points', type: 'int', init: 0, min: 0, max: 50 }],
    zoneVars: [],
    zones: [
      { id: 'hand:0', owner: '0', visibility: 'private', ordering: 'stack' },
      { id: 'hand:1', owner: '1', visibility: 'private', ordering: 'stack' },
      { id: 'board:none', owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [{ id: 'card', count: 10, zone: 'hand:0' }],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('play'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [
          {
            name: 'target',
            domain: { query: 'tokensInZone', zone: 'hand:0' },
          },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('pass'),
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
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeSimpleState = (): GameState => ({
  globalVars: { score: 0 },
  perPlayerVars: {
    '0': { points: 0 },
    '1': { points: 0 },
  },
  zoneVars: {},
  playerCount: 2,
  zones: {
    'hand:0': Array.from({ length: 10 }, (_, idx) => ({
      id: asTokenId(`card-${idx}`),
      type: 'card',
      state: 'default',
      props: {},
    })),
    'hand:1': [],
    'board:none': [],
  },
  nextTokenOrdinal: 10,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

describe('move enumeration performance', () => {
  it('legalMoves completes for simple game within 2s', () => {
    const def = makeSimpleDef();
    const state = makeSimpleState();

    const start = performance.now();
    const moves = legalMoves(def, state);
    const elapsed = performance.now() - start;

    assert.ok(moves.length > 0, `Expected at least one legal move, got ${moves.length}`);
    assert.ok(elapsed < 2000, `legalMoves took ${elapsed.toFixed(1)}ms, expected < 2000ms`);
  });

  it('toMoveIdentityKey hot loop: 10K iterations within 500ms', () => {
    const def = makeSimpleDef();
    const move = {
      actionId: asActionId('play'),
      params: { card: 'token-0' },
    };

    const start = performance.now();
    for (let iteration = 0; iteration < 10_000; iteration += 1) {
      toMoveIdentityKey(def, move);
    }
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 500, `10K toMoveIdentityKey took ${elapsed.toFixed(1)}ms, expected < 500ms`);
  });

  it('toMoveIdentityKey with varying param sizes within 1s', () => {
    const def = makeSimpleDef();
    const paramSizes = [0, 1, 5, 10, 20];
    const iterations = 2_000;

    const start = performance.now();
    for (const size of paramSizes) {
      const params: Record<string, string> = {};
      for (let paramIndex = 0; paramIndex < size; paramIndex += 1) {
        params[`p${paramIndex}`] = `value-${paramIndex}`;
      }
      const move = { actionId: asActionId('play'), params };
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        toMoveIdentityKey(def, move);
      }
    }
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 1000, `Varying-size params took ${elapsed.toFixed(1)}ms, expected < 1000ms`);
  });
});
