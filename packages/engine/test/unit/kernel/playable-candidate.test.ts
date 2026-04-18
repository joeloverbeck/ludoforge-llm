// @test-class: architectural-invariant
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
import { eff } from '../../helpers/effect-tag-helper.js';

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
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$target',
            bind: '$target',
            options: { query: 'enums', values: [] },
          },
        }),
      ],
    },
  ],
  atomicity: 'atomic',
});

const createOptionalChooseNTrapProfile = (actionId: string): ActionPipelineDef => ({
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
        eff({
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'enums', values: ['safe'] },
            min: 0,
            max: 1,
          },
        }),
        eff({
          if: {
            when: {
              op: 'in',
              item: 'safe',
              set: { _t: 2, ref: 'binding', name: '$targets' },
            },
            then: [
              eff({
                chooseOne: {
                  internalDecisionId: 'decision:$safe',
                  bind: '$safe',
                  options: { query: 'enums', values: ['done'] },
                },
              }) as ActionDef['effects'][number],
            ],
            else: [
              eff({
                chooseOne: {
                  internalDecisionId: 'decision:$dead',
                  bind: '$dead',
                  options: { query: 'enums', values: [] },
                },
              }) as ActionDef['effects'][number],
            ],
          },
        }),
      ],
    },
  ],
  atomicity: 'atomic',
});

describe('playable-candidate evaluator', () => {
  it('classifies a concrete legal move as fully playable with apply parity', () => {
    const def = createDef([
      createAction('advance', [eff({ setVar: { scope: 'global', var: 'score', value: 1 } })]),
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

  it('forwards choose into template completion', () => {
    const actionId = asActionId('guided-template-op');
    const def = createDef(
      [createTemplateChooseOneAction(actionId, phaseId)],
      [createTemplateChooseOneProfile(actionId)],
    );
    const state = initialState(def, 17, 2).state;
    const templateMove: Move = { actionId, params: {} };

    const evaluated = evaluatePlayableMoveCandidate(def, state, templateMove, createRng(4n), undefined, {
      choose: () => 'beta',
    });

    assert.equal(evaluated.kind, 'playableComplete');
    if (evaluated.kind !== 'playableComplete') {
      assert.fail('expected template move to become fully playable');
    }
    assert.equal(evaluated.move.params.$target, 'beta');
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
    assert.equal(evaluated.rejection, 'structurallyUnsatisfiable');
  });

  it('surfaces both empty-branch dead ends and satisfiable non-empty completions for optional chooseN templates', () => {
    const actionId = asActionId('optional-choose-n-trap');
    const def = createDef(
      [createAction('optional-choose-n-trap')],
      [createOptionalChooseNTrapProfile('optional-choose-n-trap')],
    );
    const state = initialState(def, 23, 2).state;
    const templateMove: Move = { actionId, params: {} };

    const guided = evaluatePlayableMoveCandidate(def, state, templateMove, createRng(0n), undefined, {
      choose: (request) => request.type === 'chooseN' ? ['safe'] : undefined,
    });
    assert.equal(guided.kind, 'playableComplete');
    if (guided.kind !== 'playableComplete') {
      assert.fail('expected guided optional chooseN completion');
    }
    assert.deepEqual(guided.move.params.$targets, ['safe']);
    assert.equal(guided.move.params.$safe, 'done');

    let sawDrawDeadEnd = false;
    for (let seed = 0n; seed < 16n; seed += 1n) {
      const initialRng = createRng(seed);
      const evaluated = evaluatePlayableMoveCandidate(def, state, templateMove, initialRng);

      if (evaluated.kind !== 'playableComplete') {
        assert.equal(evaluated.kind, 'rejected');
        assert.equal(evaluated.rejection, 'drawDeadEnd');
        sawDrawDeadEnd = true;
        assert.deepEqual(evaluated.drawDeadEndOptionalChooseN, {
          decisionKey: '$targets',
          sampledCount: 0,
          declaredMin: 0,
          declaredMax: 1,
        });
      }
      assert.notDeepEqual(
        evaluated.rng.state.state,
        initialRng.state.state,
        'optional chooseN evaluation should still advance rng state',
      );
    }
    assert.equal(sawDrawDeadEnd, true, 'expected at least one empty-branch draw dead-end');
  });

  it('does not call choose for already-complete legal moves', () => {
    const def = createDef([
      createAction('advance', [eff({ setVar: { scope: 'global', var: 'score', value: 1 } })]),
    ]);
    const state = initialState(def, 19, 2).state;
    const move: Move = { actionId: asActionId('advance'), params: {} };
    let chooseCalls = 0;

    const evaluated = evaluatePlayableMoveCandidate(def, state, move, createRng(3n), undefined, {
      choose: () => {
        chooseCalls += 1;
        return 'beta';
      },
    });

    assert.equal(evaluated.kind, 'playableComplete');
    assert.equal(chooseCalls, 0);
  });
});
