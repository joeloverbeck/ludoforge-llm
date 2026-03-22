import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  computeAlwaysCompleteActionIds,
  effectTreeMayYieldIncompleteMove,
  type ActionDef,
  type ActionPipelineDef,
  type EffectAST,
  type GameDef,
} from '../../../src/kernel/index.js';

const makeAction = (
  id: string,
  overrides: Partial<ActionDef> = {},
): ActionDef => ({
  id: asActionId(id),
  actor: 'active',
  executor: 'actor',
  phase: [asPhaseId('main')],
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
  capabilities: [],
  ...overrides,
});

const makeDef = (overrides?: {
  actions?: readonly ActionDef[];
  actionPipelines?: readonly ActionPipelineDef[];
}): GameDef => ({
  metadata: { id: 'always-complete-actions-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: overrides?.actions ?? [],
  ...(overrides?.actionPipelines === undefined ? {} : { actionPipelines: overrides.actionPipelines }),
  triggers: [],
  terminal: { conditions: [] },
});

describe('always-complete-actions', () => {
  describe('effectTreeMayYieldIncompleteMove', () => {
    it('returns false for empty effect arrays and non-decision control flow', () => {
      const effects: readonly EffectAST[] = [
        {
          forEach: {
            bind: 'zone',
            over: { query: 'zones' },
            effects: [{ setVar: { scope: 'global', var: 'ready', value: true } }],
          },
        },
      ];

      assert.equal(effectTreeMayYieldIncompleteMove([]), false);
      assert.equal(effectTreeMayYieldIncompleteMove(effects), false);
    });

    it('detects nested chooseN and rollRandom nodes', () => {
      const chooseNEffects: readonly EffectAST[] = [
        {
          forEach: {
            bind: 'zone',
            over: { query: 'zones' },
            effects: [{
              chooseN: {
                internalDecisionId: 'decide-zones',
                bind: 'targets',
                options: { query: 'zones' },
                max: 2,
              },
            }],
          },
        },
      ];
      const rollRandomEffects: readonly EffectAST[] = [
        {
          if: {
            when: true,
            then: [{
              rollRandom: {
                bind: 'die',
                min: 1,
                max: 6,
                in: [],
              },
            }],
          },
        },
      ];

      assert.equal(effectTreeMayYieldIncompleteMove([{ chooseOne: {
        internalDecisionId: 'choose-top-level',
        bind: 'target',
        options: { query: 'zones' },
      } }]), true);
      assert.equal(effectTreeMayYieldIncompleteMove(chooseNEffects), true);
      assert.equal(effectTreeMayYieldIncompleteMove(rollRandomEffects), true);
    });
  });

  describe('computeAlwaysCompleteActionIds', () => {
    it('includes only parameterless non-pipeline actions without incomplete cost/effect nodes', () => {
      const complete = makeAction('complete');
      const withParams = makeAction('withParams', {
        params: [{ name: 'amount', domain: { query: 'intsInRange', min: 1, max: 2 } }],
      });
      const cardEvent = makeAction('cardEvent', {
        capabilities: ['cardEvent'],
      });
      const withDecision = makeAction('withDecision', {
        effects: [{
          chooseOne: {
            internalDecisionId: 'pick-zone',
            bind: 'zone',
            options: { query: 'zones' },
          },
        }],
      });
      const withRandomCost = makeAction('withRandomCost', {
        cost: [{
          rollRandom: {
            bind: 'die',
            min: 1,
            max: 6,
            in: [],
          },
        }],
      });
      const pipelined = makeAction('pipelined');
      const def = makeDef({
        actions: [complete, withParams, cardEvent, withDecision, withRandomCost, pipelined],
        actionPipelines: [{
          id: 'pipeline-pass',
          actionId: pipelined.id,
          atomicity: 'atomic',
          legality: null,
          costValidation: null,
          targeting: {},
          stages: [{
            effects: [],
          }],
          costEffects: [],
        }],
      });

      const ids = computeAlwaysCompleteActionIds(def);

      assert.equal(ids.has(complete.id), true);
      assert.equal(ids.has(withParams.id), false);
      assert.equal(ids.has(cardEvent.id), false);
      assert.equal(ids.has(withDecision.id), false);
      assert.equal(ids.has(withRandomCost.id), false);
      assert.equal(ids.has(pipelined.id), false);
    });
  });
});
