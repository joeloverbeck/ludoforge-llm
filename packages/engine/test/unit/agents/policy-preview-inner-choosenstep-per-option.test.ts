// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runChooseNStepInnerPreview } from '../../../src/agents/policy-preview-inner-choosenstep.js';
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

function createProfile(depthCap: number): CompiledAgentProfile {
  const considerations = ['preferProjectedMargin'];
  return {
    fingerprint: `preview-inner-choosenstep-per-option-${depthCap}`,
    params: {},
    preview: {
      mode: 'exactWorld',
      completion: 'policyGuided',
      inner: {
        chooseOne: false,
        chooseNStep: true,
        maxOptions: 4,
        chooseNBeamWidth: 2,
        depthCap,
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

function createCatalog(depthCap = 3): AgentPolicyCatalog {
  const profile = createProfile(depthCap);
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: `preview-inner-choosenstep-per-option-${depthCap}`,
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

function createDef(catalog: AgentPolicyCatalog, requiredCount: number): GameDef {
  return assertValidatedGameDef({
    metadata: { id: `policy-preview-inner-choosenstep-per-option-${requiredCount}`, players: { min: 2, max: 2 } },
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
      id: `draft-options-${requiredCount}`,
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
              n: requiredCount,
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

describe('chooseNStep per-root-option inner preview driver', () => {
  it('runs one isolated preview per legal ADD, excludes CONFIRM, and orders by stable key', () => {
    const catalog = createCatalog();
    const profile = catalog.profiles.baseline!;
    const def = createDef(catalog, 1);
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
        previewDeltaRef,
        { kind: 'previewOptionRef', refKind: 'driveDepth' },
        { kind: 'previewOptionRef', refKind: 'outcome' },
      ],
    });

    assert.equal(microturn.legalActions.some((decision) => decision.kind === 'chooseNStep' && decision.command === 'confirm'), false);
    assert.equal(run.options.length, 3);
    assert.deepEqual(
      run.options.map((option) => option.stableMoveKey),
      [...run.options.map((option) => option.stableMoveKey)].sort((left, right) => left.localeCompare(right)),
    );
    assert.deepEqual(
      run.options.map((option) => [option.decision.command, option.decision.value]),
      [['add', 'high'], ['add', 'low'], ['add', 'spare']],
    );
    assert.deepEqual(
      run.options.map((option) => [option.decision.value, option.resolvedRefs.get('preview.option.delta.victory.currentMargin.self')]),
      [
        ['high', { kind: 'ready', value: 5 }],
        ['low', { kind: 'ready', value: 1 }],
        ['spare', { kind: 'ready', value: 1 }],
      ],
    );
    assert.deepEqual(run.options.map((option) => option.resolvedRefs.get('preview.option.outcome')), [
      { kind: 'ready', value: 'ready' },
      { kind: 'ready', value: 'ready' },
      { kind: 'ready', value: 'ready' },
    ]);
    assert.deepEqual(run.options.map((option) => option.driveDepth), [2, 2, 2]);
    assert.equal(run.evaluatedCandidateCount, 6);
    assert.ok(run.evaluatedCandidateCount <= 4 * (1 + 2 * 4 * Math.max(0, 3 - 1)));
    assert.equal(state.globalVars.score, 0);
    assert.equal(publishMicroturn(def, state).kind, 'chooseNStep');
  });

  it('delegates same-chooseNStep ADD continuations to the beam driver with one less depth', () => {
    const catalog = createCatalog(4);
    const profile = catalog.profiles.baseline!;
    const def = createDef(catalog, 2);
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
        { kind: 'previewOptionRef', refKind: 'driveDepth' },
        { kind: 'previewOptionRef', refKind: 'outcome' },
      ],
    });

    assert.equal(run.options.length, 3);
    assert.deepEqual(run.options.map((option) => option.continuationBeam !== null), [true, true, true]);
    assert.deepEqual(
      run.options.map((option) => option.continuationBeam?.beam[0]?.partialSelection.length),
      [1, 1, 1],
    );
    assert.deepEqual(run.options.map((option) => option.driveDepth), [2, 2, 2]);
    assert.ok(run.evaluatedCandidateCount <= 4 * (1 + 2 * 4 * Math.max(0, 4 - 1)));
  });
});
