// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runChooseOneInnerPreview } from '../../../src/agents/policy-preview-inner.js';
import { selectBestMicroturnChooseOneValue } from '../../../src/agents/microturn-option-evaluator.js';
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
  type AgentPolicyExpr,
  type ChoicePendingChooseOneRequest,
  type CompiledAgentPolicyRef,
  type CompiledAgentProfile,
  type GameDef,
} from '../../../src/kernel/index.js';
import type { ChooseOneContext, MicroturnState } from '../../../src/kernel/microturn/types.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import {
  withCompiledPolicyCatalog,
  type AgentPolicyCatalogFixtureLibrary,
} from '../../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');
type ChooseOneMicroturn = MicroturnState & {
  readonly kind: 'chooseOne';
  readonly decisionContext: ChooseOneContext;
};
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const literal = (value: string | number | boolean): AgentPolicyExpr => ({ kind: 'literal', value });

const previewDeltaRef: CompiledAgentPolicyRef = {
  kind: 'previewOptionRef',
  refKind: 'deltaVictoryCurrentMarginSelf',
};

function microturnConsiderations(
  definitions: Record<string, Omit<AgentPolicyCatalogFixtureLibrary['considerations'][string], 'scopes'>>,
): AgentPolicyCatalogFixtureLibrary['considerations'] {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { scopes: ['microturn'], ...definition }]),
  );
}

function createProfile(considerations: readonly string[]): CompiledAgentProfile {
  return {
    fingerprint: 'preview-inner-chooseone',
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
        strategy: 'singlePass',
        capClass: 'standard256',
      },
    },
    selection: { mode: 'argmax' },
    use: {
      guardrails: [],
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

function createCatalog(): AgentPolicyCatalog {
  const profile = createProfile(['preferProjectedMargin']);
  return withCompiledPolicyCatalog({
    schemaVersion: 3,
    catalogFingerprint: 'preview-inner-chooseone',
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
      guardrails: {},
      considerations: microturnConsiderations({
        preferProjectedMargin: {
          costClass: 'preview',
          when: literal(true),
          weight: literal(1),
          value: refExpr(previewDeltaRef),
          previewFallback: { onUnavailable: 'noContribution' },
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

function createDef(catalog: AgentPolicyCatalog): GameDef {
  return assertValidatedGameDef({
    metadata: { id: 'policy-preview-inner-chooseone', players: { min: 2, max: 2 } },
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
              options: { query: 'enums', values: ['low', 'high'] },
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
          eff({
            if: {
              when: { op: '==', left: { _t: 2 as const, ref: 'binding', name: '$pick' }, right: 'high' },
              then: [eff({ addVar: { scope: 'global', var: 'score', delta: 5 } })],
              else: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
          eff({
            chooseOne: {
              internalDecisionId: 'decision:$confirm',
              bind: '$confirm',
              options: { query: 'enums', values: ['done', 'skip'] },
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
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

describe('chooseOne inner preview driver', () => {
  it('runs one per-option drive, resolves preview.option refs, and keeps drafts isolated', () => {
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
        previewDeltaRef as Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }>,
        { kind: 'previewOptionRef', refKind: 'driveDepth' },
        { kind: 'previewOptionRef', refKind: 'outcome' },
      ],
    });

    assert.equal(run.options.length, 2);
    assert.equal(run.outcomeBreakdown.ready, 2);
    assert.deepEqual(
      run.options.map((option) => [option.decision.value, option.resolvedRefs.get('preview.option.delta.victory.currentMargin.self')]),
      [
        ['low', { kind: 'ready', value: 1 }],
        ['high', { kind: 'ready', value: 5 }],
      ],
    );
    assert.deepEqual(run.options.map((option) => option.driveDepth), [2, 2]);
    assert.deepEqual(run.options.map((option) => option.resolvedRefs.get('preview.option.outcome')), [
      { kind: 'ready', value: 'ready' },
      { kind: 'ready', value: 'ready' },
    ]);
    assert.equal(state.globalVars.score, 0);
    assert.equal(publishMicroturn(def, state).kind, 'chooseOne');
  });

  it('feeds preview-option refs through the existing microturn ref dispatch map', () => {
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
      refs: [previewDeltaRef as Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }>],
    });
    const request: ChoicePendingChooseOneRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: microturn.decisionContext.decisionKey,
      name: String(microturn.decisionContext.decisionKey),
      options: microturn.decisionContext.options,
      targetKinds: [],
      type: 'chooseOne',
    };

    const selected = selectBestMicroturnChooseOneValue({
      state,
      def,
      catalog,
      playerId: asPlayerId(0),
      seatId: 'us',
      profile,
      previewOptionResolvedRefsByOptionKey: new Map(run.options.map((option) => [option.stableMoveKey, option.resolvedRefs])),
    }, request, { requirePositiveScore: false });

    assert.equal(selected?.value, 'high');
    assert.equal(selected?.score, 5);
  });
});
