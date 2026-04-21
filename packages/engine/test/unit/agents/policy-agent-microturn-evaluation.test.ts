// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../../src/agents/index.js';
import {
  applyDecision,
  asActionId,
  asPhaseId,
  assertValidatedGameDef,
  createRng,
  initialState,
  publishMicroturn,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const phaseId = asPhaseId('main');

const createDef = (): GameDef => assertValidatedGameDef({
  metadata: { id: 'policy-agent-microturn-evaluation', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [
    {
      id: asActionId('gain'),
      actor: 'active',
      executor: 'actor',
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
      limits: [],
    },
    {
      id: asActionId('branch'),
      actor: 'active',
      executor: 'actor',
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    },
  ] satisfies ActionDef[],
  actionPipelines: [{
    id: 'branch-profile',
    actionId: asActionId('branch'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [{
      effects: [
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$pick',
            bind: '$pick',
            options: { query: 'enums', values: ['left', 'right'] },
          },
        }) as ActionPipelineDef['stages'][number]['effects'][number],
        eff({ addVar: { scope: 'global', var: 'score', delta: 1 } }),
      ],
    }],
    atomicity: 'partial',
  }],
  triggers: [],
  terminal: { conditions: [] },
});

const createExactChooseNDef = (): GameDef => assertValidatedGameDef({
  metadata: { id: 'policy-agent-choose-n-progress', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [
    {
      id: asActionId('choose-three'),
      actor: 'active',
      executor: 'actor',
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'enums', values: ['A', 'B', 'C'] },
            n: 3,
          },
        }),
        eff({ addVar: { scope: 'global', var: 'score', delta: 1 } }),
      ],
      limits: [],
    },
  ] satisfies ActionDef[],
  triggers: [],
  terminal: { conditions: [] },
});

describe('policy agent microturn evaluation', () => {
  it('scores actionSelection decisions and keeps downstream frontier choices legal', () => {
    const def = createDef();
    const state = initialState(def, 7, 2).state;
    const agent = new PolicyAgent({ traceLevel: 'summary' });

    const actionSelection = publishMicroturn(def, state);
    const selected = agent.chooseDecision({ def, state, microturn: actionSelection, rng: createRng(11n) });
    assert.equal(selected.decision.kind, 'actionSelection');
    assert.equal(selected.agentDecision?.kind, 'policy');

    const afterAction = applyDecision(def, state, selected.decision, undefined).state;
    const followup = publishMicroturn(def, afterAction);
    const completionDecision = agent.chooseDecision({ def, state: afterAction, microturn: followup, rng: createRng(13n) });
    assert.equal(completionDecision.decision.kind, 'chooseOne');
    assert.ok(followup.legalActions.some((decision) => JSON.stringify(decision) === JSON.stringify(completionDecision.decision)));
  });

  it('prefers progress over remove-thrashing on exact-cardinality chooseNStep frontiers', () => {
    const def = createExactChooseNDef();
    const agent = new PolicyAgent({ traceLevel: 'summary' });

    let state = initialState(def, 11, 2).state;
    const actionSelection = publishMicroturn(def, state);
    const selected = agent.chooseDecision({ def, state, microturn: actionSelection, rng: createRng(17n) });
    state = applyDecision(def, state, selected.decision, undefined).state;

    let chooseN = publishMicroturn(def, state);
    let step = agent.chooseDecision({ def, state, microturn: chooseN, rng: createRng(19n) });
    assert.equal(step.decision.kind, 'chooseNStep');
    assert.equal(step.decision.command, 'add');
    state = applyDecision(def, state, step.decision, undefined).state;

    chooseN = publishMicroturn(def, state);
    step = agent.chooseDecision({ def, state, microturn: chooseN, rng: createRng(23n) });
    assert.equal(step.decision.kind, 'chooseNStep');
    assert.equal(step.decision.command, 'add');
    state = applyDecision(def, state, step.decision, undefined).state;

    chooseN = publishMicroturn(def, state);
    step = agent.chooseDecision({ def, state, microturn: chooseN, rng: createRng(29n) });
    assert.equal(step.decision.kind, 'chooseNStep');
    assert.equal(step.decision.command, 'add');
    state = applyDecision(def, state, step.decision, undefined).state;

    chooseN = publishMicroturn(def, state);
    step = agent.chooseDecision({ def, state, microturn: chooseN, rng: createRng(31n) });
    assert.equal(step.decision.kind, 'chooseNStep');
    assert.equal(step.decision.command, 'confirm');
  });
});
