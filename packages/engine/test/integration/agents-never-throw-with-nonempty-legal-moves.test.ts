// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GreedyAgent, PolicyAgent, RandomAgent } from '../../src/agents/index.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  assertValidatedGameDef,
  createRng,
  enumerateLegalMoves,
  initialState,
  type ActionDef,
  type ActionPipelineDef,
  type Agent,
  type GameDef,
} from '../../src/kernel/index.js';
import { eff } from '../helpers/effect-tag-helper.js';

const phaseId = asPhaseId('main');

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

const createCertificateProfile = (id: string): ActionPipelineDef => ({
  id: `profile-${id}`,
  actionId: asActionId(id),
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

const createAdversarialChooseNProfile = (id: string): ActionPipelineDef => ({
  id: `profile-${id}`,
  actionId: asActionId(id),
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
              values: Array.from({ length: 27 }, (_unused, index) => `opt-${index}`),
            },
            min: 1,
            max: 27,
          },
        }),
        eff({
          if: {
            when: {
              op: 'in',
              item: 'opt-13',
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

const createDef = (
  id: string,
  profile: ActionPipelineDef,
): GameDef => assertValidatedGameDef({
  metadata: { id: `agents-never-throw-${id}`, players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [createAction(id)],
  triggers: [],
  terminal: { conditions: [] },
  actionPipelines: [profile],
});

const CASES = [
  {
    name: 'certificate-backed pending template',
    def: createDef('certificate-backed', createCertificateProfile('certificate-backed')),
    seed: 7n,
  },
  {
    name: 'adversarial sparse chooseN template',
    def: createDef('adversarial-choose-n', createAdversarialChooseNProfile('adversarial-choose-n')),
    seed: 11n,
  },
] as const;

const AGENTS: readonly { readonly label: string; readonly agent: Agent }[] = [
  { label: 'random', agent: new RandomAgent() },
  { label: 'greedy', agent: new GreedyAgent({ completionsPerTemplate: 1 }) },
  { label: 'policy-default', agent: new PolicyAgent({ traceLevel: 'summary', completionsPerTemplate: 1 }) },
] as const;

describe('agents never throw with non-empty legal moves', () => {
  for (const testCase of CASES) {
    for (const entry of AGENTS) {
      it(`${testCase.name} / ${entry.label}`, () => {
        const state = initialState(testCase.def, 1, 2).state;
        const legalMoveResult = enumerateLegalMoves(testCase.def, state);
        assert.ok(legalMoveResult.moves.length > 0, 'expected non-empty legal move surface');

        const selected = entry.agent.chooseDecision({
          def: testCase.def,
          state,
          playerId: asPlayerId(0),
          legalMoves: legalMoveResult.moves,
          ...(legalMoveResult.certificateIndex === undefined
            ? {}
            : { certificateIndex: legalMoveResult.certificateIndex }),
          rng: createRng(testCase.seed),
        });

        assert.ok(selected.move.move.actionId !== undefined);
      });
    }
  }
});
