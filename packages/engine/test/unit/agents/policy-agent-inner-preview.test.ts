// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyAgentChooseNStepInnerPreview } from '../../../src/agents/policy-agent-inner-preview.js';
import {
  applyDecision,
  asActionId,
  asPhaseId,
  assertValidatedGameDef,
  initialState,
  publishMicroturn,
  type ActionDef,
  type ActionPipelineDef,
  type AgentMicroturnDecisionInput,
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
type ChooseNStepDecision = ChooseNStepMicroturn['legalActions'][number] & {
  readonly kind: 'chooseNStep';
  readonly command: 'add';
};

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const previewDeltaRef: Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }> = {
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

function createProfile(chooseNStep: boolean): CompiledAgentProfile {
  const considerations = ['preferProjectedMargin'];
  return {
    fingerprint: `policy-agent-inner-preview-${chooseNStep ? 'enabled' : 'disabled'}`,
    params: {},
    preview: {
      mode: 'exactWorld',
      completion: 'policyGuided',
      inner: {
        chooseOne: false,
        chooseNStep,
        maxOptions: 4,
        chooseNBeamWidth: 2,
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

function createCatalog(chooseNStep: boolean): AgentPolicyCatalog {
  const profile = createProfile(chooseNStep);
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: `policy-agent-inner-preview-${chooseNStep ? 'enabled' : 'disabled'}`,
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
    metadata: { id: 'policy-agent-inner-preview', players: { min: 2, max: 2 } },
    seats: [{ id: 'us' }, { id: 'arvn' }],
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
              options: { query: 'enums', values: ['low', 'high', 'spare'] },
              n: 1,
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
          eff({
            if: {
              when: { op: 'in', item: 'high', set: { _t: 2 as const, ref: 'binding', name: '$picks' } },
              then: [eff({ addVar: { scope: 'global', var: 'score', delta: 5 } })],
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

function createInput(
  def: GameDef,
  state: ReturnType<typeof initialState>['state'],
  microturn: MicroturnState,
): AgentMicroturnDecisionInput {
  return {
    def,
    state,
    microturn,
    rng: { state: state.rng },
  };
}

function createFixture(chooseNStep: boolean): {
  readonly catalog: AgentPolicyCatalog;
  readonly def: GameDef;
  readonly initialInput: AgentMicroturnDecisionInput;
  readonly chooseNStepInput: AgentMicroturnDecisionInput;
  readonly microturn: ChooseNStepMicroturn;
} {
  const catalog = createCatalog(chooseNStep);
  const def = createDef(catalog);
  const initial = initialState(def, 161, 2);
  const actionSelection = publishMicroturn(def, initial.state);
  const firstAction = actionSelection.legalActions[0];
  assert.ok(firstAction !== undefined);
  const afterAction = applyDecision(def, initial.state, firstAction).state;
  const microturn = publishMicroturn(def, afterAction);
  assert.equal(microturn.kind, 'chooseNStep');
  return {
    catalog,
    def,
    initialInput: createInput(def, initial.state, actionSelection),
    chooseNStepInput: createInput(def, afterAction, microturn),
    microturn: microturn as ChooseNStepMicroturn,
  };
}

function resolvedProfile(catalog: AgentPolicyCatalog) {
  return {
    catalog,
    seatId: 'us',
    profileId: 'baseline',
    profile: catalog.profiles.baseline!,
  };
}

describe('policy agent inner preview adapter', () => {
  it('does not create chooseNStep preview when the profile is not opted in', () => {
    const fixture = createFixture(false);

    assert.equal(
      createPolicyAgentChooseNStepInnerPreview(fixture.chooseNStepInput, resolvedProfile(fixture.catalog)),
      undefined,
    );
  });

  it('does not create chooseNStep preview for other microturn kinds', () => {
    const fixture = createFixture(true);

    assert.equal(
      createPolicyAgentChooseNStepInnerPreview(fixture.initialInput, resolvedProfile(fixture.catalog)),
      undefined,
    );
  });

  it('creates a shared structural preview with one keyed option per legal ADD', () => {
    const fixture = createFixture(true);
    const preview = createPolicyAgentChooseNStepInnerPreview(
      fixture.chooseNStepInput,
      resolvedProfile(fixture.catalog),
    );

    assert.ok(preview !== undefined);
    assert.equal('kind' in preview, false);
    assert.deepEqual(preview.refIds, ['preview.option.delta.victory.currentMargin.self']);
    assert.equal(preview.byOptionKey.size, 3);
    assert.equal(preview.refsByOptionKey.size, 3);
    assert.equal(preview.usage.mode, 'exactWorld');
    assert.equal(preview.usage.evaluatedCandidateCount, 6);
    assert.equal(preview.usage.outcomeBreakdown.ready, 3);
    assert.equal(preview.usage.readyRefStats['preview.option.delta.victory.currentMargin.self']?.distinctValueCount, 2);

    const addKeys = fixture.microturn.legalActions
      .filter((decision): decision is ChooseNStepDecision => decision.kind === 'chooseNStep' && decision.command === 'add')
      .map((decision) => `chooseNStep:${String(decision.decisionKey)}:add:${JSON.stringify(decision.value ?? null)}`)
      .sort((left, right) => left.localeCompare(right));
    assert.deepEqual([...preview.byOptionKey.keys()], addKeys);
    assert.deepEqual(
      addKeys.map((key) => preview.refsByOptionKey.get(key)?.get('preview.option.delta.victory.currentMargin.self')),
      [
        { kind: 'ready', value: 5 },
        { kind: 'ready', value: 1 },
        { kind: 'ready', value: 1 },
      ],
    );
  });
});
