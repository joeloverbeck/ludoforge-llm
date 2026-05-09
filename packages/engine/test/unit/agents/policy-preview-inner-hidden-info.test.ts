// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runChooseOneInnerPreview } from '../../../src/agents/policy-preview-inner.js';
import {
  applyDecision,
  asActionId,
  asPhaseId,
  asPlayerId,
  assertValidatedGameDef,
  initialState,
  publishMicroturn,
  type ActionDef,
  type ActionPipelineDef,
  type AgentPolicyCatalog,
  type CompiledAgentPolicyRef,
  type CompiledAgentProfile,
  type GameDef,
} from '../../../src/kernel/index.js';
import type { ChooseOneContext, MicroturnState } from '../../../src/kernel/microturn/types.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');
type ChooseOneMicroturn = MicroturnState & {
  readonly kind: 'chooseOne';
  readonly decisionContext: ChooseOneContext;
};

const hiddenCurrentMarginRef: Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }> = {
  kind: 'previewOptionRef',
  refKind: 'victoryCurrentMarginSelf',
};

function createProfile(): CompiledAgentProfile {
  return {
    fingerprint: 'preview-inner-hidden-info',
    params: {},
    preview: {
      mode: 'exactWorld',
      completion: 'policyGuided',
      inner: {
        chooseOne: true,
        chooseNStep: false,
        maxOptions: 4,
        chooseNBeamWidth: 1,
        depthCap: 4,
      },
    },
    selection: { mode: 'argmax' },
    use: {
      pruningRules: [],
      considerations: [],
      tieBreakers: [],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      considerations: [],
    },
  };
}

function createCatalog(): AgentPolicyCatalog {
  const profile = createProfile();
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: 'preview-inner-hidden-info',
    surfaceVisibility: {
      globalVars: {},
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'public', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        currentRank: { current: 'public', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
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
      considerations: {},
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

function createDef(catalog: AgentPolicyCatalog): GameDef {
  return assertValidatedGameDef({
    metadata: { id: 'policy-preview-inner-hidden-info', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
    actions: [
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
          eff({ addVar: { scope: 'global', var: 'score', delta: 2 } }),
        ],
      }],
      atomicity: 'partial',
    }],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        { seat: 'us', value: { _t: 2 as const, ref: 'gvar', var: 'score' } },
        { seat: 'arvn', value: 0 },
      ],
    },
  });
}

function createFirstChooseOne(def: GameDef): { readonly state: ReturnType<typeof initialState>['state']; readonly microturn: ChooseOneMicroturn } {
  const state = initialState(def, 7, 2).state;
  const actionSelection = publishMicroturn(def, state);
  const firstAction = actionSelection.legalActions[0];
  assert.ok(firstAction !== undefined);
  const afterAction = applyDecision(def, state, firstAction).state;
  const microturn = publishMicroturn(def, afterAction);
  assert.equal(microturn.kind, 'chooseOne');
  return { state: afterAction, microturn: microturn as ChooseOneMicroturn };
}

describe('chooseOne inner preview hidden-info routing', () => {
  it('marks preview.option surface refs hidden through the existing preview outcome', () => {
    const catalog = createCatalog();
    const profile = catalog.profiles.baseline!;
    const def = createDef(catalog);
    const { state, microturn } = createFirstChooseOne(def);

    const run = runChooseOneInnerPreview({
      def,
      state,
      microturn,
      playerId: asPlayerId(0),
      seatId: 'us',
      catalog,
      profile,
      refs: [
        hiddenCurrentMarginRef,
        { kind: 'previewOptionRef', refKind: 'outcome' },
      ],
    });

    assert.equal(run.options.length, 2);
    assert.equal(run.outcomeBreakdown.unknownHidden, 2);
    assert.deepEqual(run.options.map((option) => option.outcome), ['hidden', 'hidden']);
    assert.deepEqual(
      run.options.map((option) => option.resolvedRefs.get('preview.option.victory.currentMargin.self')),
      [
        { kind: 'unavailable', reason: 'hidden' },
        { kind: 'unavailable', reason: 'hidden' },
      ],
    );
    assert.deepEqual(run.options.map((option) => option.resolvedRefs.get('preview.option.outcome')), [
      { kind: 'ready', value: 'hidden' },
      { kind: 'ready', value: 'hidden' },
    ]);
  });
});
