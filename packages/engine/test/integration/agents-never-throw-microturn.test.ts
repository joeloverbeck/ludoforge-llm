// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  asActionId,
  asPhaseId,
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  initialState,
  publishMicroturn,
  type ActionDef,
  type ActionPipelineDef,
  type Agent,
  type GameDef,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { eff } from '../helpers/effect-tag-helper.js';
import {
  chooseNProgressAgent,
  createSeededChoiceAgent,
  firstLegalAgent,
} from '../helpers/test-agents.js';

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

const createCertificateReplacementProfile = (id: string): ActionPipelineDef => ({
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
          chooseOne: {
            internalDecisionId: 'decision:$safe',
            bind: '$safe',
            options: { query: 'enums', values: ['done'] },
          },
        }),
      ],
    },
  ],
  atomicity: 'partial',
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
    name: 'microturn-native pending action',
    def: createDef('pending-action', createCertificateReplacementProfile('pending-action')),
    seed: 7n,
  },
  {
    name: 'adversarial sparse chooseN action',
    def: createDef('adversarial-choose-n', createAdversarialChooseNProfile('adversarial-choose-n')),
    seed: 11n,
  },
] as const;

const AGENTS: readonly { readonly label: string; readonly agent: Agent }[] = [
  { label: 'first-legal', agent: firstLegalAgent },
  { label: 'seeded-choice', agent: createSeededChoiceAgent() },
  { label: 'choose-n-progress', agent: chooseNProgressAgent },
  { label: 'policy-default', agent: new PolicyAgent({ traceLevel: 'summary' }) },
] as const;

describe('agents never throw with non-empty published microturn actions', () => {
  for (const testCase of CASES) {
    for (const entry of AGENTS) {
      it(`${testCase.name} / ${entry.label}`, () => {
        const state = initialState(testCase.def, 1, 2).state;
        const microturn = publishMicroturn(testCase.def, state);
        assert.ok(microturn.legalActions.length > 0, 'expected non-empty published action surface');

        const selected = entry.agent.chooseDecision({
          def: testCase.def,
          state,
          microturn,
          rng: createRng(testCase.seed),
        });

        assert.ok(selected.decision.kind !== undefined);
      });
    }
  }

  it('covers the live FITL seed-123 publication surface for representative agent types', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assertNoErrors(compiled);
    if (compiled.gameDef === null) {
      throw new Error('Expected compiled FITL gameDef');
    }

    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);
    const state = initialState(def, 123, 4).state;
    const microturn = publishMicroturn(def, state, runtime);
    assert.ok(microturn.legalActions.length > 0);

    const agents: readonly Agent[] = [
      firstLegalAgent,
      createSeededChoiceAgent(),
      new PolicyAgent({ profileId: 'us-baseline', traceLevel: 'summary' }),
    ];
    for (const [index, agent] of agents.entries()) {
      assert.doesNotThrow(() => {
        agent.chooseDecision({
          def,
          state,
          microturn,
          rng: createRng(BigInt(index + 1)),
          runtime,
        });
      });
    }
  });
});
