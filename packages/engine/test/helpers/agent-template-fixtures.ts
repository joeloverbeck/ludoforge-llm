import type { ActionDef, ActionId, ActionPipelineDef, PhaseId } from '../../src/kernel/index.js';

export const createTemplateChooseOneAction = (id: ActionId, phaseId: PhaseId): ActionDef => ({
  id,
  actor: 'active',
  executor: 'actor',
  phase: [phaseId],
  params: [],
  pre: null,
  cost: [],
  effects: [
    {
      chooseOne: {
        internalDecisionId: 'decision:$target',
        bind: '$target',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
      },
    },
  ],
  limits: [],
});

export const createTemplateChooseOneProfile = (actionId: ActionId): ActionPipelineDef => ({
  id: `profile-${actionId}`,
  actionId,
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
            options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
          },
        },
      ],
    },
  ],
  atomicity: 'atomic',
});

export const createTemplateChooseNDuplicatesAction = (id: ActionId, phaseId: PhaseId): ActionDef => ({
  id,
  actor: 'active',
  executor: 'actor',
  phase: [phaseId],
  params: [],
  pre: null,
  cost: [],
  effects: [
    {
      chooseN: {
        internalDecisionId: 'decision:$targets',
        bind: '$targets',
        options: { query: 'enums', values: ['alpha', 'alpha', 'beta'] },
        min: 2,
        max: 2,
      },
    },
  ],
  limits: [],
});

export const createTemplateChooseNDuplicatesProfile = (actionId: ActionId): ActionPipelineDef => ({
  id: `profile-${actionId}`,
  actionId,
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
            options: { query: 'enums', values: ['alpha', 'alpha', 'beta'] },
            min: 2,
            max: 2,
          },
        },
      ],
    },
  ],
  atomicity: 'atomic',
});
