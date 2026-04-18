// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  createRng,
  initialState,
  type ActionDef,
  type ActionPipelineDef,
  type DecisionKey,
  type GameDef,
  type Move,
} from '../../../src/kernel/index.js';
import { completeTemplateMove } from '../../../src/kernel/move-completion.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const phaseId = asPhaseId('main');

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

const createAction = (id: string): ActionDef => ({
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

const createOptionalTrapProfile = (actionId: string): ActionPipelineDef => ({
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

const createStructuralDeadEndProfile = (actionId: string): ActionPipelineDef => ({
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
            internalDecisionId: 'decision:$dead',
            bind: '$dead',
            options: { query: 'enums', values: ['dead'] },
          },
        }),
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$fail',
            bind: '$fail',
            options: { query: 'enums', values: [] },
          },
        }),
      ],
    },
  ],
  atomicity: 'atomic',
});

const createDef = (actionId: string, profile: ActionPipelineDef): GameDef => ({
  metadata: { id: `move-completion-payload-${actionId}`, players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [createAction(actionId)],
  triggers: [],
  terminal: { conditions: [] },
  actionPipelines: [profile],
});

describe('move-completion drawDeadEnd payload', () => {
  it('captures the first optional chooseN sample when an empty draw dead-ends', () => {
    const actionId = 'optional-choose-n-payload';
    const def = createDef(actionId, createOptionalTrapProfile(actionId));
    const state = initialState(def, 1, 2).state;
    const templateMove: Move = { actionId: asActionId(actionId), params: {} };

    let witnessed:
      | Extract<ReturnType<typeof completeTemplateMove>, { readonly kind: 'drawDeadEnd' }>
      | undefined;
    for (let seed = 0n; seed < 32n; seed += 1n) {
      const result = completeTemplateMove(def, state, templateMove, createRng(seed));
      if (result.kind === 'drawDeadEnd') {
        witnessed = result;
        break;
      }
    }

    assert.ok(witnessed, 'expected at least one seed to sample the empty optional branch');
    if (witnessed === undefined) {
      assert.fail('expected drawDeadEnd witness');
    }
    assert.deepEqual(witnessed.optionalChooseN, {
      decisionKey: asDecisionKey('$targets'),
      sampledCount: 0,
      declaredMin: 0,
      declaredMax: 1,
    });
  });

  it('uses null when the dead-end happens before any optional chooseN is sampled', () => {
    const actionId = 'structural-dead-end-payload';
    const def = createDef(actionId, createStructuralDeadEndProfile(actionId));
    const state = initialState(def, 2, 2).state;
    const templateMove: Move = { actionId: asActionId(actionId), params: {} };

    const result = completeTemplateMove(def, state, templateMove, createRng(0n));

    assert.equal(result.kind, 'drawDeadEnd');
    if (result.kind !== 'drawDeadEnd') {
      assert.fail('expected drawDeadEnd');
    }
    assert.equal(result.optionalChooseN, null);
  });
});
