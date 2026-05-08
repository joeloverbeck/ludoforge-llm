// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runChooseNStepInnerPreview } from '../../../src/agents/policy-preview-inner-choosenstep.js';
import {
  applyDecision,
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  assertValidatedGameDef,
  initialState,
  publishMicroturn,
  type ActionDef,
  type ActionPipelineDef,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentPolicyRef,
  type CompiledAgentProfile,
  type GameDef,
} from '../../../src/kernel/index.js';
import type { ChooseNStepContext, MicroturnState } from '../../../src/kernel/microturn/types.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import {
  withCompiledPolicyCatalog,
  type AgentPolicyCatalogFixtureLibrary,
} from '../../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');
type ChooseNStepMicroturn = MicroturnState & {
  readonly kind: 'chooseNStep';
  readonly decisionContext: ChooseNStepContext;
};

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const hiddenSensitiveMarginRef: Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }> = {
  kind: 'previewOptionRef',
  refKind: 'victoryCurrentMarginSelf',
};

function microturnConsiderations(
  definitions: Record<string, Omit<AgentPolicyCatalogFixtureLibrary['considerations'][string], 'scopes'>>,
): AgentPolicyCatalogFixtureLibrary['considerations'] {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { scopes: ['microturn'], ...definition }]),
  );
}

function createProfile(): CompiledAgentProfile {
  const considerations = ['preferVisibleMargin'];
  return {
    fingerprint: 'preview-inner-choosenstep-hidden-info',
    params: {},
    preview: {
      mode: 'exactWorld',
      completion: 'policyGuided',
      inner: {
        chooseOne: false,
        chooseNStep: true,
        maxOptions: 4,
        chooseNBeamWidth: 1,
        depthCap: 3,
      },
    },
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

function createCatalog(): AgentPolicyCatalog {
  const profile = createProfile();
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: 'preview-inner-choosenstep-hidden-info',
    surfaceVisibility: {
      globalVars: {},
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: false } },
        currentRank: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: false } },
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
        preferVisibleMargin: {
          costClass: 'preview',
          when: literal(true),
          weight: literal(1),
          value: refExpr(hiddenSensitiveMarginRef),
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
    metadata: { id: 'policy-preview-inner-choosenstep-hidden-info', players: { min: 2, max: 2 } },
    seats: [{ id: 'us' }, { id: 'arvn' }],
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
    perPlayerVars: [],
    zones: [{ id: asZoneId('secret:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' }],
    tokenTypes: [{ id: 'marker', props: {} }],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
    actions: [
      {
        id: asActionId('draft-options'),
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
      id: 'draft-options-pipeline',
      actionId: asActionId('draft-options'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{
        effects: [
          eff({
            chooseN: {
              internalDecisionId: 'decision:$picks',
              bind: '$picks',
              options: { query: 'enums', values: ['safe', 'secret'] },
              n: 1,
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
          eff({
            if: {
              when: { op: 'in', item: 'secret', set: { _t: 2 as const, ref: 'binding', name: '$picks' } },
              then: [
                eff({ createToken: { type: 'marker', zone: 'secret:none' } }),
                eff({ addVar: { scope: 'global', var: 'score', delta: 5 } }),
              ],
              else: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
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

function createChooseNStep(def: GameDef): { readonly state: ReturnType<typeof initialState>['state']; readonly microturn: ChooseNStepMicroturn } {
  const state = initialState(def, 161, 2).state;
  const actionSelection = publishMicroturn(def, state);
  const firstAction = actionSelection.legalActions[0];
  assert.ok(firstAction !== undefined);
  const afterAction = applyDecision(def, state, firstAction).state;
  const microturn = publishMicroturn(def, afterAction);
  assert.equal(microturn.kind, 'chooseNStep');
  return { state: afterAction, microturn: microturn as ChooseNStepMicroturn };
}

describe('chooseNStep inner preview hidden-info routing', () => {
  it('marks only hidden-sampling continuation branches hidden for preview.option refs', () => {
    const catalog = createCatalog();
    const profile = catalog.profiles.baseline!;
    const def = createDef(catalog);
    const { state, microturn } = createChooseNStep(def);

    const run = runChooseNStepInnerPreview({
      def,
      state,
      microturn,
      playerId: asPlayerId(0),
      seatId: 'us',
      catalog,
      profile,
      refs: [
        hiddenSensitiveMarginRef,
        { kind: 'previewOptionRef', refKind: 'outcome' },
      ],
    });

    const byValue = new Map(run.options.map((option) => [option.decision.value, option]));
    const safe = byValue.get('safe');
    const secret = byValue.get('secret');

    assert.equal(run.options.length, 2);
    assert.ok(safe !== undefined);
    assert.ok(secret !== undefined);
    assert.equal(run.outcomeBreakdown.ready, 1);
    assert.equal(run.outcomeBreakdown.unknownHidden, 1);

    assert.equal(safe.outcome, 'ready');
    assert.equal(safe.resolvedRefs.get('preview.option.victory.currentMargin.self'), 1);
    assert.equal(safe.resolvedRefs.get('preview.option.outcome'), 'ready');

    assert.equal(secret.outcome, 'hidden');
    assert.equal(secret.resolvedRefs.has('preview.option.victory.currentMargin.self'), false);
    assert.equal(secret.resolvedRefs.get('preview.option.outcome'), 'hidden');
  });
});
