import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  legalChoices,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';

const makeDef = (): GameDef =>
  ({
    metadata: { id: 'legal-choices-executor', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
      { id: asZoneId('hand:1'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('pickExecutorHand'),
        actor: 'active',
        executor: { id: asPlayerId(1) },
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [
          {
            chooseOne: {
              internalDecisionId: 'decision:$zone',
              bind: '$zone',
              options: { query: 'zones', filter: { owner: 'actor' } },
            },
          },
        ],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'hand:0': [],
    'hand:1': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

describe('legalChoices executor context', () => {
  it('generates decision options using action executor identity', () => {
    const request = legalChoices(makeDef(), makeState(), {
      actionId: asActionId('pickExecutorHand'),
      params: {},
    });

    assert.equal(request.kind, 'pending');
    assert.equal(request.decisionId, 'decision:$zone');
    assert.deepEqual(request.options, [asZoneId('hand:1')]);
  });
});
