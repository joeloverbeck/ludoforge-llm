// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runChooseNStepBeamPreview } from '../../../src/agents/policy-preview-inner-choosenstep.js';
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
  serializeGameState,
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

function microturnConsiderations(
  definitions: Record<string, Omit<AgentPolicyCatalogFixtureLibrary['considerations'][string], 'scopes'>>,
): AgentPolicyCatalogFixtureLibrary['considerations'] {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { scopes: ['microturn'], ...definition }]),
  );
}

function createProfile(considerations: readonly string[]): CompiledAgentProfile {
  return {
    fingerprint: 'preview-inner-choosen-beam',
    params: {},
    preview: {
      mode: 'exactWorld',
      completion: 'policyGuided',
      inner: {
        chooseOne: false,
        chooseNStep: true,
        maxOptions: 8,
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

function createCatalog(): AgentPolicyCatalog {
  const profile = createProfile(['preferHigherOption']);
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: 'preview-inner-choosen-beam',
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
        preferHigherOption: {
          costClass: 'state',
          when: literal(true),
          weight: literal(1),
          value: refExpr({ kind: 'microturnOptionIntrinsic', intrinsic: 'index' }),
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
    metadata: { id: 'policy-preview-inner-choosen-beam', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 100 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
    actions: [
      {
        id: asActionId('draft-three'),
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
      id: 'draft-three-profile',
      actionId: asActionId('draft-three'),
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
              options: { query: 'enums', values: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] },
              n: 3,
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
  const state = initialState(def, 13, 2).state;
  const actionSelection = publishMicroturn(def, state);
  const firstAction = actionSelection.legalActions[0];
  assert.ok(firstAction !== undefined);
  const afterAction = applyDecision(def, state, firstAction).state;
  const microturn = publishMicroturn(def, afterAction);
  assert.equal(microturn.kind, 'chooseNStep');
  return { state: afterAction, microturn: microturn as ChooseNStepMicroturn };
}

function summarizeBeamRun(run: ReturnType<typeof runChooseNStepBeamPreview>) {
  return {
    evaluatedCandidateCount: run.evaluatedCandidateCount,
    outcomeBreakdown: run.outcomeBreakdown,
    beam: run.beam.map((entry) => ({
      partialSelectionStableKeys: entry.partialSelectionStableKeys,
      state: serializeGameState(entry.state),
      score: entry.score,
      resolvedRefs: [...entry.resolvedRefs.entries()].sort(([left], [right]) => left.localeCompare(right)),
      outcome: entry.outcome,
    })),
    best: run.best === undefined
      ? undefined
      : {
        partialSelectionStableKeys: run.best.partialSelectionStableKeys,
        state: serializeGameState(run.best.state),
        score: run.best.score,
        resolvedRefs: [...run.best.resolvedRefs.entries()].sort(([left], [right]) => left.localeCompare(right)),
        outcome: run.best.outcome,
      },
    pruned: run.pruned.map((entry) => ({
      step: entry.step,
      stableMoveKey: entry.stableMoveKey,
      partialSelectionStableKeys: entry.partialSelectionStableKeys,
      score: entry.score,
      scoreContributions: entry.scoreContributions,
      selectionReason: entry.selectionReason,
    })),
  };
}

describe('chooseNStep inner preview beam driver', () => {
  it('keeps beam exploration under the configured cap, records pruned partials, and orders deterministically', () => {
    const catalog = createCatalog();
    const profile = catalog.profiles.baseline!;
    const def = createDef(catalog);
    const { state, microturn } = createChooseNStep(def);

    const firstRun = runChooseNStepBeamPreview({
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
    const secondRun = runChooseNStepBeamPreview({
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

    assert.equal(firstRun.evaluatedCandidateCount, 34);
    assert.ok(firstRun.evaluatedCandidateCount <= 8 * 2 * 3);
    assert.equal(firstRun.beam.length, 2);
    assert.deepEqual(firstRun.pruned.map((entry) => entry.selectionReason), firstRun.pruned.map(() => 'beamPruned'));
    assert.equal(firstRun.pruned.length, 28);
    assert.deepEqual(
      firstRun.beam.map((entry) => entry.partialSelection.map((decision) => decision.value)),
      [['G', 'H', 'F'], ['H', 'G', 'F']],
    );
    assert.deepEqual(firstRun.best?.resolvedRefs.get('preview.option.driveDepth'), { kind: 'ready', value: 3 });
    assert.deepEqual(firstRun.best?.resolvedRefs.get('preview.option.outcome'), { kind: 'ready', value: 'depthCap' });
    assert.deepEqual(
      JSON.stringify(summarizeBeamRun(firstRun)),
      JSON.stringify(summarizeBeamRun(secondRun)),
    );
  });
});
