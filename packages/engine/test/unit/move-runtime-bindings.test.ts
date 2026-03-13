import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildMoveRuntimeBindings,
  deriveDecisionBindingsFromMoveParams,
  formatDecisionKey,
  resolvePipelineDecisionBindingsForMove,
  type Move,
} from '../../src/kernel/index.js';

describe('move runtime bindings', () => {
  it('derives decision bindings from canonical decision keys', () => {
    const moveParams = {
      x: 1,
      [formatDecisionKey('decision:$plain', '$plain', '', 1)]: 'a',
      [formatDecisionKey('decision:$template', '$choice@north', '', 1)]: 'north',
      [formatDecisionKey('decision:$target', '$target@zone-1', '', 1)]: 'zone-1',
    } as Move['params'];

    const derived = deriveDecisionBindingsFromMoveParams(moveParams);
    assert.deepEqual(derived, {
      '$plain': 'a',
      '$choice@north': 'north',
      '$target@zone-1': 'zone-1',
    });
  });

  it('materializes bindings in deterministic precedence order', () => {
    const move: Move = {
      actionId: 'op' as Move['actionId'],
      params: {
        '$pick': 1,
        __freeOperation: true,
        __actionClass: 'limitedOperation',
      } as Move['params'],
      freeOperation: false,
      actionClass: 'operationPlusSpecialActivity',
    };

    const bindings = buildMoveRuntimeBindings(move, { '$pick': 2 });
    assert.equal(bindings.$pick, 2, 'explicit decision binding should override raw move param key');
    assert.equal(bindings.__freeOperation, false, 'reserved runtime binding should override move.params value');
    assert.equal(
      bindings.__actionClass,
      'operationPlusSpecialActivity',
      'reserved runtime binding should override move.params value',
    );
  });

  it('resolves pipeline decision bindings back to compiler-local binds without leaking them into decision keys', () => {
    const moveParams = {
      'decision:doc.actions.0.effects.0.distributeTokens.selectTokens': ['tok-1'],
      'decision:doc.actions.0.effects.0.distributeTokens.chooseDestination[0]': 'adjacent:none',
    } as Move['params'];

    const bindings = resolvePipelineDecisionBindingsForMove(
      {
        id: 'pipeline' as const,
        actionId: 'op' as Move['actionId'],
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [
          {
            effects: [
              {
                chooseN: {
                  internalDecisionId: 'decision:doc.actions.0.effects.0.distributeTokens.selectTokens',
                  bind: '$__selected_doc_actions_0_effects_0_distributeTokens',
                  decisionIdentity: 'decision:doc.actions.0.effects.0.distributeTokens.selectTokens',
                  options: { query: 'tokensInZone', zone: 'board:none' },
                  n: 1,
                },
              },
              {
                forEach: {
                  bind: '$__token_doc_actions_0_effects_0_distributeTokens',
                  over: { query: 'binding', name: '$__selected_doc_actions_0_effects_0_distributeTokens' },
                  effects: [
                    {
                      chooseOne: {
                        internalDecisionId: 'decision:doc.actions.0.effects.0.distributeTokens.chooseDestination',
                        bind: '$__destination_doc_actions_0_effects_0_distributeTokens',
                        decisionIdentity: 'decision:doc.actions.0.effects.0.distributeTokens.chooseDestination',
                        options: { query: 'zones' },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
        atomicity: 'partial',
      },
      moveParams,
    );

    assert.deepEqual(bindings, {
      '$__selected_doc_actions_0_effects_0_distributeTokens': ['tok-1'],
      '$__destination_doc_actions_0_effects_0_distributeTokens': 'adjacent:none',
    });
  });

  it('preserves concrete resolved binds from canonical decision keys for repeated zoned decisions', () => {
    const moveParams = {
      [formatDecisionKey('decision:doc.pipeline.moveTroops', '$movingTroops@hue:none', '', 1)]: ['troop-1'],
    } as Move['params'];

    const bindings = resolvePipelineDecisionBindingsForMove(
      {
        id: 'pipeline' as const,
        actionId: 'op' as Move['actionId'],
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [
          {
            effects: [
              {
                chooseN: {
                  internalDecisionId: 'decision:doc.pipeline.moveTroops',
                  bind: '$movingTroops@{$zone}',
                  decisionIdentity: 'decision:doc.pipeline.moveTroops',
                  options: { query: 'tokensInZone', zone: 'hue:none' },
                  n: 1,
                },
              },
            ],
          },
        ],
        atomicity: 'partial',
      },
      moveParams,
    );

    assert.deepEqual(bindings, {
      '$movingTroops@hue:none': ['troop-1'],
    });
  });
});
