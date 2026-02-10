import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateState } from '../../../src/agents/evaluate-state.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';

const createBaseDef = (): GameDef => ({
  metadata: { id: 'agents-evaluate-state', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [{ name: 'ended', type: 'int', init: 0, min: 0, max: 1 }],
  perPlayerVars: [
    { name: 'vp', type: 'int', init: 0, min: 0, max: 10 },
    { name: 'coins', type: 'int', init: 0, min: 0, max: 20 },
  ],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
  actions: [{ id: asActionId('noop'), actor: 'active', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] }],
  triggers: [],
  endConditions: [],
  scoring: { method: 'highest', value: { ref: 'pvar', player: 'actor', var: 'vp' } },
});

describe('evaluateState', () => {
  it('returns expected integer score for nonterminal state with normalized per-player vars', () => {
    const def = createBaseDef();
    const baseState = initialState(def, 1, 2);
    const state: GameState = {
      ...baseState,
      perPlayerVars: {
        ...baseState.perPlayerVars,
        '0': { vp: 7, coins: 10 },
        '1': { vp: 3, coins: 4 },
      },
    };

    const score = evaluateState(def, state, asPlayerId(0));
    assert.equal(score, 11_450);
  });

  it('terminal scores dominate nonterminal heuristics', () => {
    const def: GameDef = {
      ...createBaseDef(),
      endConditions: [
        {
          when: { op: '==', left: { ref: 'gvar', var: 'ended' }, right: 1 },
          result: { type: 'win', player: { id: asPlayerId(0) } },
        },
      ],
    };
    const baseState = initialState(def, 2, 2);
    const state: GameState = {
      ...baseState,
      globalVars: { ...baseState.globalVars, ended: 1 },
      perPlayerVars: {
        ...baseState.perPlayerVars,
        '0': { vp: 10, coins: 20 },
        '1': { vp: 0, coins: 0 },
      },
    };

    assert.equal(evaluateState(def, state, asPlayerId(0)), 1_000_000_000);
    assert.equal(evaluateState(def, state, asPlayerId(1)), -1_000_000_000);
  });

  it('uses integer-only arithmetic for normalized terms', () => {
    const baseDef = createBaseDef();
    const def: GameDef = {
      metadata: baseDef.metadata,
      constants: baseDef.constants,
      globalVars: baseDef.globalVars,
      perPlayerVars: [{ name: 'tiny', type: 'int', init: 0, min: 0, max: 3 }],
      zones: baseDef.zones,
      tokenTypes: baseDef.tokenTypes,
      setup: baseDef.setup,
      turnStructure: baseDef.turnStructure,
      actions: baseDef.actions,
      triggers: baseDef.triggers,
      endConditions: baseDef.endConditions,
    };
    const baseState = initialState(def, 3, 2);
    const state: GameState = {
      ...baseState,
      perPlayerVars: {
        ...baseState.perPlayerVars,
        '0': { tiny: 1 },
        '1': { tiny: 0 },
      },
    };

    const score = evaluateState(def, state, asPlayerId(0));
    assert.equal(score, 3_333);
    assert.equal(Number.isInteger(score), true);
  });
});
