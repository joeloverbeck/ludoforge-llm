import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  createRng,
  evaluatePlayableMoveCandidate,
  classifyPlayableMoveCandidate,
  initialState,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type Move,
} from '../../../src/kernel/index.js';
import { createTemplateChooseOneAction, createTemplateChooseOneProfile } from '../../helpers/agent-template-fixtures.js';

const phaseId = asPhaseId('main');

const createAction = (id: string, effects: ActionDef['effects'] = []): ActionDef => ({
  id: asActionId(id),
  actor: 'active',
  executor: 'actor',
  phase: [phaseId],
  params: [],
  pre: null,
  cost: [],
  effects,
  limits: [],
});

const createDef = (
  actions: readonly ActionDef[],
  actionPipelines?: readonly ActionPipelineDef[],
): GameDef => ({
  metadata: { id: 'playable-candidate-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions,
  ...(actionPipelines === undefined ? {} : { actionPipelines }),
  triggers: [],
  terminal: { conditions: [] },
});

const createEmptyOptionsProfile = (actionId: string): ActionPipelineDef => ({
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
          chooseOne: {
            internalDecisionId: 'decision:$target',
            bind: '$target',
            options: { query: 'enums', values: [] },
          },
        },
      ],
    },
  ],
  atomicity: 'atomic',
});

describe('playable-candidate evaluator', () => {
  it('classifies a concrete legal move as fully playable with apply parity', () => {
    const def = createDef([
      createAction('advance', [{ setVar: { scope: 'global', var: 'score', value: 1 } }]),
    ]);
    const state = initialState(def, 3, 2).state;
    const move: Move = { actionId: asActionId('advance'), params: {} };

    const classification = classifyPlayableMoveCandidate(def, state, move);

    assert.equal(classification.kind, 'playableComplete');
    if (classification.kind !== 'playableComplete') {
      assert.fail('expected a fully playable concrete move');
    }
    assert.doesNotThrow(() => applyMove(def, state, classification.move));
  });

  it('completes a template move into a fully playable candidate with apply parity', () => {
    const actionId = asActionId('template-op');
    const def = createDef(
      [createTemplateChooseOneAction(actionId, phaseId)],
      [createTemplateChooseOneProfile(actionId)],
    );
    const state = initialState(def, 7, 2).state;
    const templateMove: Move = { actionId, params: {} };

    const evaluated = evaluatePlayableMoveCandidate(def, state, templateMove, createRng(11n));

    assert.equal(evaluated.kind, 'playableComplete');
    if (evaluated.kind !== 'playableComplete') {
      assert.fail('expected template move to become fully playable');
    }
    assert.ok('$target' in evaluated.move.params);
    assert.doesNotThrow(() => applyMove(def, state, evaluated.move));
  });

  it('rejects unsatisfiable template moves before agent selection work', () => {
    const actionId = asActionId('unplayable-template');
    const def = createDef(
      [createTemplateChooseOneAction(actionId, phaseId)],
      [createEmptyOptionsProfile('unplayable-template')],
    );
    const state = initialState(def, 13, 2).state;
    const templateMove: Move = { actionId, params: {} };

    const evaluated = evaluatePlayableMoveCandidate(def, state, templateMove, createRng(17n));

    assert.equal(evaluated.kind, 'rejected');
    if (evaluated.kind !== 'rejected') {
      assert.fail('expected unplayable template rejection');
    }
    assert.equal(evaluated.rejection, 'completionUnsatisfiable');
  });
});
