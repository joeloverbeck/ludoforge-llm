import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { completeTemplateMove } from '../../../src/agents/template-completion.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  createRng,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');

const baseState: GameState = {
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: phaseId,
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
};

const createChooseNAction = (id: string): ActionDef => ({
  id: asActionId(id),
  actor: 'active',
  executor: 'actor',
  phase: [phaseId],
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
});

const createChooseNProfile = (
  actionId: string,
  min: number,
  max: number,
  values: readonly string[],
): ActionPipelineDef => ({
  id: `profile-${actionId}`,
  actionId: asActionId(actionId),
  legality: null,
  costValidation: null,
  costEffects: [],
  targeting: {},
  stages: [
    {
      stage: 'resolve',
      effects: [
        {
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'enums', values },
            min,
            max,
          },
        },
      ],
    },
  ],
  atomicity: 'atomic',
});

const createDef = (action: ActionDef, profile: ActionPipelineDef): GameDef => ({
  metadata: { id: 'template-completion-agent', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [action],
  triggers: [],
  terminal: { conditions: [] },
  actionPipelines: [profile],
});

describe('template-completion chooseN bounds', () => {
  it('clamps chooseN max to selectable options and never throws from RNG bounds', () => {
    const action = createChooseNAction('bounded-choose-n');
    const profile = createChooseNProfile('bounded-choose-n', 1, 3, ['a', 'b']);
    const def = createDef(action, profile);
    const templateMove: Move = { actionId: asActionId('bounded-choose-n'), params: {} };

    for (let seed = 0n; seed < 200n; seed += 1n) {
      const result = completeTemplateMove(def, baseState, templateMove, createRng(seed));
      assert.ok(result, `seed ${seed} should produce a playable completion`);
      const selected = result.move.params['decision:$targets'];
      assert.ok(Array.isArray(selected), `seed ${seed} expected chooseN array result`);
      assert.ok(selected.length >= 1 && selected.length <= 2, `seed ${seed} selected out-of-bounds count`);
      for (const value of selected) {
        assert.ok(value === 'a' || value === 'b', `seed ${seed} selected unexpected value`);
      }
    }
  });

  it('returns null when chooseN min exceeds selectable options', () => {
    const action = createChooseNAction('insufficient-min-choose-n');
    const profile = createChooseNProfile('insufficient-min-choose-n', 3, 3, ['a', 'b']);
    const def = createDef(action, profile);
    const templateMove: Move = { actionId: asActionId('insufficient-min-choose-n'), params: {} };

    const result = completeTemplateMove(def, baseState, templateMove, createRng(42n));
    assert.equal(result, null);
  });

  it('chooseN selections stay within the option domain across seeds', () => {
    const action = createChooseNAction('domain-bounds-choose-n');
    const profile = createChooseNProfile('domain-bounds-choose-n', 0, 2, ['a', 'b']);
    const def = createDef(action, profile);
    const templateMove: Move = { actionId: asActionId('domain-bounds-choose-n'), params: {} };

    for (let seed = 0n; seed < 40n; seed += 1n) {
      const result = completeTemplateMove(def, baseState, templateMove, createRng(seed));
      assert.ok(result, `seed ${seed} should produce a playable completion`);
      const selected = result.move.params['decision:$targets'];
      assert.ok(Array.isArray(selected));
      assert.ok(selected.length <= 2);
      for (const value of selected) {
        assert.ok(value === 'a' || value === 'b');
      }
    }
  });
});
