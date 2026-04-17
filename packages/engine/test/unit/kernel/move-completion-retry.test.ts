import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../../src/agents/policy-agent.js';
import { completeTemplateMove } from '../../../src/kernel/move-completion.js';
import {
  asActionId,
  asPhaseId,
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  initialState,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type Move,
} from '../../../src/kernel/index.js';
import { runGame } from '../../../src/sim/simulator.js';
import { compileProductionSpec } from '../../helpers/production-spec-helpers.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const phaseId = asPhaseId('main');

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

const createRetryProfile = (actionId: string): ActionPipelineDef => ({
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
            options: { query: 'enums', values: ['dead', 'safe'] },
            min: 1,
            max: 1,
          },
        }),
        eff({
          if: {
            when: {
              op: 'in',
              item: 'dead',
              set: { _t: 2, ref: 'binding', name: '$targets' },
            },
            then: [
              eff({
                chooseOne: {
                  internalDecisionId: 'decision:$dead',
                  bind: '$dead',
                  options: { query: 'enums', values: [] },
                },
              }) as ActionDef['effects'][number],
            ],
            else: [
              eff({
                chooseOne: {
                  internalDecisionId: 'decision:$safe',
                  bind: '$safe',
                  options: { query: 'enums', values: ['done'] },
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

const createOptionalRetryProfile = (actionId: string): ActionPipelineDef => ({
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

const createSparseRetryProfile = (actionId: string): ActionPipelineDef => ({
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
            options: {
              query: 'enums',
              values: [
                'dead-01', 'dead-02', 'safe', 'dead-03', 'dead-04',
                'dead-05', 'dead-06', 'dead-07', 'dead-08', 'dead-09',
                'dead-10', 'dead-11', 'dead-12', 'dead-13', 'dead-14',
                'dead-15', 'dead-16', 'dead-17', 'dead-18', 'dead-19',
                'dead-20', 'dead-21', 'dead-22', 'dead-23', 'dead-24',
              ],
            },
            min: 1,
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

const createInsufficientProfile = (actionId: string): ActionPipelineDef => ({
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
            options: { query: 'enums', values: ['a', 'b'] },
            min: 3,
            max: 3,
          },
        }),
      ],
    },
  ],
  atomicity: 'atomic',
});

const createDef = (
  actionId: string,
  profile: ActionPipelineDef,
): GameDef => ({
  metadata: { id: `move-completion-retry-${actionId}`, players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [createChooseNAction(actionId)],
  triggers: [],
  terminal: { conditions: [] },
  actionPipelines: [profile],
});

describe('move-completion retry classification', () => {
  it('distinguishes draw dead ends from structural failure for chooseN{min:1,max:1} templates', () => {
    const actionId = 'retry-template';
    const def = createDef(actionId, createRetryProfile(actionId));
    const state = initialState(def, 1, 2).state;
    const templateMove: Move = { actionId: asActionId(actionId), params: {} };

    let sawCompleted = false;
    let sawDrawDeadEnd = false;
    for (let seed = 0n; seed < 32n; seed += 1n) {
      const result = completeTemplateMove(def, state, templateMove, createRng(seed));
      if (result.kind === 'completed') {
        sawCompleted = true;
        assert.deepEqual(result.move.params.$targets, ['safe']);
        assert.equal(result.move.params.$safe, 'done');
      }
    }

    const forcedDeadEnd = completeTemplateMove(def, state, templateMove, createRng(1n), undefined, {
      choose: (request) => {
        if (request.type === 'chooseN' && request.min === 1 && request.max === 1) {
          return ['dead'];
        }
        return undefined;
      },
    });
    sawDrawDeadEnd = forcedDeadEnd.kind === 'drawDeadEnd';

    assert.equal(sawCompleted, true, 'expected at least one successful draw');
    assert.equal(sawDrawDeadEnd, true, 'expected at least one draw-specific dead end');
  });

  it('reports structural failure when chooseN min exceeds the selectable domain', () => {
    const actionId = 'structural-template';
    const def = createDef(actionId, createInsufficientProfile(actionId));
    const state = initialState(def, 2, 2).state;
    const templateMove: Move = { actionId: asActionId(actionId), params: {} };

    const result = completeTemplateMove(def, state, templateMove, createRng(7n));
    assert.equal(result.kind, 'structurallyUnsatisfiable');
  });

  it('prefers non-empty optional chooseN branches when they are satisfiable', () => {
    const actionId = 'optional-retry-template';
    const def = createDef(actionId, createOptionalRetryProfile(actionId));
    const state = initialState(def, 3, 2).state;
    const templateMove: Move = { actionId: asActionId(actionId), params: {} };

    for (let seed = 0n; seed < 16n; seed += 1n) {
      const result = completeTemplateMove(def, state, templateMove, createRng(seed));
      assert.equal(result.kind, 'completed');
      if (result.kind !== 'completed') {
        assert.fail('expected optional chooseN completion to avoid the empty dead-end branch');
      }
      assert.deepEqual(result.move.params.$targets, ['safe']);
      assert.equal(result.move.params.$safe, 'done');
    }
  });

  it('recovers sparse mandatory chooseN surfaces that have one satisfiable branch among many dead ends', () => {
    const actionId = 'sparse-retry-template';
    const def = createDef(actionId, createSparseRetryProfile(actionId));
    const state = initialState(def, 4, 2).state;
    const templateMove: Move = { actionId: asActionId(actionId), params: {} };

    const result = completeTemplateMove(def, state, templateMove, createRng(1n));

    assert.equal(result.kind, 'completed');
    if (result.kind !== 'completed') {
      assert.fail('expected sparse mandatory chooseN completion to find the satisfiable branch');
    }
    assert.deepEqual(result.move.params.$targets, ['safe']);
    assert.equal(result.move.params.$safe, 'done');
  });

  it('plays five FITL seed-1009 moves within a bounded smoke window', { timeout: 5_000 }, () => {
    const { compiled } = compileProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);
    const agents = Array.from({ length: 4 }, () => new PolicyAgent());

    const trace = runGame(def, 1009, agents, 5, 4, undefined, runtime);

    assert.ok(trace.moves.length > 0, 'expected seed 1002 smoke to advance');
    assert.equal(trace.stopReason === 'noLegalMoves' || trace.stopReason === 'maxTurns' || trace.stopReason === 'terminal', true);
  });
});
