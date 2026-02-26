import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asPhaseId, asPlayerId, asZoneId, type GameDef, type GameState } from '../../src/kernel/index.js';
import { makeDiscoveryEffectContext, makeExecutionEffectContext } from '../helpers/effect-context-test-helpers.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effect-context-test-helpers', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [{ id: asZoneId('zone:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'zone:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

describe('effect-context test helper', () => {
  it('uses explicit execution mode when requested', () => {
    const context = makeExecutionEffectContext({ def: makeDef(), state: makeState() });
    assert.equal(context.mode, 'execution');
  });

  it('uses explicit discovery mode when requested', () => {
    const context = makeDiscoveryEffectContext({ def: makeDef(), state: makeState() });
    assert.equal(context.mode, 'discovery');
  });
});
