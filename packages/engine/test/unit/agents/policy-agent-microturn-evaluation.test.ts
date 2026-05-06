// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../../src/agents/index.js';
import { resolveEffectivePolicyProfile } from '../../../src/agents/policy-profile-resolution.js';
import {
  applyDecision,
  asActionId,
  asPhaseId,
  asSeatId,
  assertValidatedGameDef,
  createRng,
  initialState,
  publishMicroturn,
  type ActionDef,
  type ActionPipelineDef,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type CompiledAgentPolicyRef,
  type CompiledAgentProfile,
  type GameDef,
} from '../../../src/kernel/index.js';
import type { PolicyEvaluationCandidateMetadata } from '../../../src/agents/policy-eval.js';
import { asDecisionFrameId, asTurnId, type MicroturnState } from '../../../src/kernel/microturn/types.js';
import type { DecisionKey } from '../../../src/kernel/decision-scope.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import {
  withCompiledPolicyCatalog,
  type AgentPolicyCatalogFixtureLibrary,
} from '../../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');
const literal = (value: string | number | boolean): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});

function microturnConsiderations(
  definitions: Record<string, Omit<AgentPolicyCatalogFixtureLibrary['considerations'][string], 'scopes'>>,
): AgentPolicyCatalogFixtureLibrary['considerations'] {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { scopes: ['microturn'], ...definition }]),
  );
}

function createProfile(considerations: readonly string[]): CompiledAgentProfile {
  return {
    fingerprint: 'microturn-guided',
    params: {},
    preview: { mode: 'exactWorld' },
    selection: { mode: 'argmax' },
    use: {
      pruningRules: [],
      considerations,
      tieBreakers: [],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      considerations,
    },
  };
}

function createMicroturnGuidedCatalog(): AgentPolicyCatalog {
  const profile = createProfile(['preferRight', 'preferLeft']);
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: 'policy-agent-inner-frontier-contributions',
    surfaceVisibility: {
      globalVars: {},
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
        currentRank: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
      },
      activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    },
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      pruningRules: {},
      considerations: microturnConsiderations({
        preferRight: {
          costClass: 'state',
          when: literal(true),
          weight: literal(10),
          value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'microturnOptionIntrinsic', intrinsic: 'value' }), literal('right'))),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
        preferLeft: {
          costClass: 'state',
          when: literal(true),
          weight: literal(2),
          value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'microturnOptionIntrinsic', intrinsic: 'value' }), literal('left'))),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      }),
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: {
      baseline: profile,
    },
    bindingsBySeat: {
      us: 'baseline',
      arvn: 'baseline',
    },
  });
}

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

const createCompletionGuidedDef = (): GameDef => ({
  ...createDef(),
  seats: [{ id: 'us' }, { id: 'arvn' }],
  agents: createMicroturnGuidedCatalog(),
});

const createChooseOneMicroturn = (state: ReturnType<typeof initialState>['state']): MicroturnState => ({
  kind: 'chooseOne',
  seatId: asSeatId('us'),
  decisionContext: {
    kind: 'chooseOne',
    seatId: asSeatId('us'),
    decisionKey: '$pick' as DecisionKey,
    options: [
      { value: 'left', legality: 'legal', illegalReason: null },
      { value: 'right', legality: 'legal', illegalReason: null },
    ],
  },
  legalActions: [
    { kind: 'chooseOne', decisionKey: '$pick' as DecisionKey, value: 'left' },
    { kind: 'chooseOne', decisionKey: '$pick' as DecisionKey, value: 'right' },
  ],
  projectedState: { state },
  turnId: asTurnId(1),
  frameId: asDecisionFrameId(1),
  compoundTurnTrace: [],
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
      effects: [],
      limits: [],
    },
  ] satisfies ActionDef[],
  actionPipelines: [{
    id: 'choose-three-profile',
    actionId: asActionId('choose-three'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [
      {
        effects: [
          eff({
            chooseOne: {
              internalDecisionId: 'decision:$mode',
              bind: '$mode',
              options: { query: 'enums', values: ['full', 'skip'] },
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
        ],
      },
      {
        effects: [
          eff({
            if: {
              when: { op: '==', left: { _t: 2 as const, ref: 'binding', name: '$mode' }, right: 'full' },
              then: [
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
              else: [],
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
        ],
      },
    ],
    atomicity: 'partial',
  }],
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

  it('keeps chooseOne fallback on a bounded structural path when guided matching is disabled', () => {
    const def = createDef();
    const state = initialState(def, 7, 2).state;
    const agent = new PolicyAgent({ traceLevel: 'summary', disableGuidedChooser: true });

    const actionSelection = publishMicroturn(def, state);
    const selected = agent.chooseDecision({ def, state, microturn: actionSelection, rng: createRng(11n) });
    const afterAction = applyDecision(def, state, selected.decision, undefined).state;
    const followup = publishMicroturn(def, afterAction);
    assert.equal(followup.kind, 'chooseOne');

    const completionDecision = agent.chooseDecision({ def, state: afterAction, microturn: followup, rng: createRng(13n) });
    assert.equal(completionDecision.decision.kind, 'chooseOne');
    assert.ok(followup.legalActions.some((decision) => JSON.stringify(decision) === JSON.stringify(completionDecision.decision)));
    assert.equal(completionDecision.agentDecision?.kind, 'policy');
  });

  it('emits inner-frontier scoreContributions for agent-guided chooseOne candidates', () => {
    const def = createCompletionGuidedDef();
    const state = initialState(def, 7, 2).state;
    const agent = new PolicyAgent({ traceLevel: 'verbose' });
    assert.notEqual(resolveEffectivePolicyProfile(def, state.activePlayer), null);
    const followup = createChooseOneMicroturn(state);
    const completionDecision = agent.chooseDecision({ def, state, microturn: followup, rng: createRng(13n) });
    assert.equal(completionDecision.decision.kind, 'chooseOne');
    assert.equal(completionDecision.decision.value, 'right');

    const candidates: readonly PolicyEvaluationCandidateMetadata[] = completionDecision.agentDecision?.candidates ?? [];
    const right = candidates.find((candidate) => candidate.stableMoveKey === 'chooseOne:$pick:"right"');
    const left = candidates.find((candidate) => candidate.stableMoveKey === 'chooseOne:$pick:"left"');
    assert.deepEqual(right?.scoreContributions, [
      { termId: 'preferRight', contribution: 10 },
      { termId: 'preferLeft', contribution: 0 },
    ]);
    assert.equal(right?.score, 10);
    assert.equal(right?.scoreContributions.reduce((total, contribution) => total + contribution.contribution, 0), right?.score);
    assert.deepEqual(left?.scoreContributions, [
      { termId: 'preferRight', contribution: 0 },
      { termId: 'preferLeft', contribution: 2 },
    ]);
  });

  it('can disable policy decision diagnostics without changing legal action selection', () => {
    const def = createDef();
    const state = initialState(def, 7, 2).state;
    const summaryAgent = new PolicyAgent({ traceLevel: 'summary' });
    const traceFreeAgent = new PolicyAgent({ traceLevel: 'none' });

    const actionSelection = publishMicroturn(def, state);
    const summarySelected = summaryAgent.chooseDecision({ def, state, microturn: actionSelection, rng: createRng(11n) });
    const traceFreeSelected = traceFreeAgent.chooseDecision({ def, state, microturn: actionSelection, rng: createRng(11n) });

    assert.deepEqual(traceFreeSelected.decision, summarySelected.decision);
    assert.equal(traceFreeSelected.agentDecision, undefined);
  });

  it('prefers progress over remove-thrashing on exact-cardinality chooseNStep frontiers', () => {
    const def = createExactChooseNDef();
    const agent = new PolicyAgent({ traceLevel: 'summary' });

    let state = initialState(def, 11, 2).state;
    const actionSelection = publishMicroturn(def, state);
    const selected = agent.chooseDecision({ def, state, microturn: actionSelection, rng: createRng(17n) });
    state = applyDecision(def, state, selected.decision, undefined).state;

    let chooseMode = publishMicroturn(def, state);
    assert.equal(chooseMode.kind, 'chooseOne');
    let modeDecision = agent.chooseDecision({ def, state, microturn: chooseMode, rng: createRng(18n) });
    assert.equal(modeDecision.decision.kind, 'chooseOne');
    assert.equal(modeDecision.decision.value, 'full');
    state = applyDecision(def, state, modeDecision.decision, undefined).state;

    for (const rngSeed of [19n, 23n, 29n, 31n] as const) {
      const microturn = publishMicroturn(def, state);
      if (microturn.kind === 'actionSelection') {
        break;
      }

      const step = agent.chooseDecision({ def, state, microturn, rng: createRng(rngSeed) });
      assert.equal(step.decision.kind, 'chooseNStep');
      assert.notEqual(step.decision.command, 'remove');
      state = applyDecision(def, state, step.decision, undefined).state;
    }

    const completed = publishMicroturn(def, state);
    assert.equal(completed.kind, 'actionSelection');
  });
});
