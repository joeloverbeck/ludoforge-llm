import * as assert from 'node:assert/strict';

import { PolicyAgent } from '../../../src/agents/policy-agent.js';
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
  type PolicyAgentDecisionTrace,
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

type PreviewFallbackMode = 'noContribution' | 'constantZero';

function createProfile(previewAvailable: boolean, fallbackMode: PreviewFallbackMode): CompiledAgentProfile {
  const considerations = ['preferProjectedMargin'];
  return {
    fingerprint: `preview-integrity-${previewAvailable ? 'ready' : 'unavailable'}-${fallbackMode}`,
    params: {},
    preview: {
      mode: 'exactWorld',
      completion: 'policyGuided',
      inner: {
        chooseOne: false,
        chooseNStep: true,
        maxOptions: 4,
        chooseNBeamWidth: 2,
        depthCap: 3,
        strategy: 'singlePass',
        capClass: 'standard256',
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

function createCatalog(previewAvailable: boolean, fallbackMode: PreviewFallbackMode): AgentPolicyCatalog {
  const profile = createProfile(previewAvailable, fallbackMode);
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: `preview-integrity-${previewAvailable ? 'ready' : 'unavailable'}-${fallbackMode}`,
    surfaceVisibility: {
      globalVars: {},
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: {
          current: 'public',
          preview: {
            visibility: previewAvailable ? 'public' : 'hidden',
            allowWhenHiddenSampling: previewAvailable,
          },
        },
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
          previewFallback: fallbackMode === 'constantZero'
            ? { onUnavailable: { kind: 'constant', value: 0 } }
            : { onUnavailable: 'noContribution' },
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
    metadata: { id: 'preview-integrity', players: { min: 2, max: 2 } },
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

export function createPreviewIntegrityFixture(previewAvailable: boolean, fallbackMode: PreviewFallbackMode = 'noContribution'): {
  readonly catalog: AgentPolicyCatalog;
  readonly def: GameDef;
  readonly chooseNStepInput: AgentMicroturnDecisionInput & { readonly microturn: ChooseNStepMicroturn };
} {
  const catalog = createCatalog(previewAvailable, fallbackMode);
  const def = createDef(catalog);
  const initial = initialState(def, 162, 2);
  const actionSelection = publishMicroturn(def, initial.state);
  const firstAction = actionSelection.legalActions[0];
  assert.ok(firstAction !== undefined);
  const afterAction = applyDecision(def, initial.state, firstAction).state;
  const microturn = publishMicroturn(def, afterAction);
  assert.equal(microturn.kind, 'chooseNStep');
  return {
    catalog,
    def,
    chooseNStepInput: createInput(def, afterAction, microturn) as AgentMicroturnDecisionInput & {
      readonly microturn: ChooseNStepMicroturn;
    },
  };
}

export function runPreviewIntegrityPolicyTrace(previewAvailable: boolean): PolicyAgentDecisionTrace {
  const fixture = createPreviewIntegrityFixture(previewAvailable);
  return runPreviewIntegrityPolicyTraceForFixture(fixture);
}

export function runPreviewIntegrityPolicyTraceForFixture(
  fixture: ReturnType<typeof createPreviewIntegrityFixture>,
): PolicyAgentDecisionTrace {
  const agent = new PolicyAgent({
    profileId: 'baseline',
    traceLevel: 'verbose',
    disableGuidedChooser: true,
  });
  const result = agent.chooseDecision(fixture.chooseNStepInput);
  assert.ok(result.agentDecision !== undefined);
  return result.agentDecision;
}
