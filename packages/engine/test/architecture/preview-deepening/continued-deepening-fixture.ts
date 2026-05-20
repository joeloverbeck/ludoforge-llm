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
  type PolicyAgentDecisionTrace,
  type CompiledAgentPolicyRef,
  type CompiledAgentProfile,
  type GameDef,
} from '../../../src/kernel/index.js';
import type { ChooseNStepContext, MicroturnState } from '../../../src/kernel/microturn/types.js';
import { createPolicyAgentChooseNStepInnerPreview } from '../../../src/agents/policy-agent-inner-preview.js';
import { PolicyAgent } from '../../../src/agents/policy-agent.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import {
  withCompiledPolicyCatalog,
  type AgentPolicyCatalogFixtureLibrary,
} from '../../helpers/policy-catalog-fixtures.js';

export type ChooseNStepMicroturn = MicroturnState & {
  readonly kind: 'chooseNStep';
  readonly decisionContext: ChooseNStepContext;
};

export type PreviewStrategy = NonNullable<CompiledAgentProfile['preview']['inner']>['strategy'];

const phaseId = asPhaseId('main');
const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const previewDeltaRef: Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }> = {
  kind: 'previewOptionRef',
  refKind: 'deltaVictoryCurrentMarginSelf',
};

const microturnConsiderations = (
  definitions: Record<string, Omit<AgentPolicyCatalogFixtureLibrary['considerations'][string], 'scopes'>>,
): AgentPolicyCatalogFixtureLibrary['considerations'] =>
  Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { scopes: ['microturn'], ...definition }]),
  );

export const createProfile = (
  strategy: PreviewStrategy,
): CompiledAgentProfile => {
  const considerations = ['preferProjectedMargin'];
  return {
    fingerprint: `continued-deepening-${strategy}`,
    params: {},
    preview: {
      mode: 'exactWorld',
      completion: 'policyGuided',
      inner: {
        chooseOne: false,
        chooseNStep: true,
        maxOptions: 4,
        chooseNBeamWidth: 1,
        depthCap: strategy === 'continuedDeepening' ? 1 : 3,
        strategy,
        capClass: strategy === 'continuedDeepening' ? 'deep1024' : 'standard256',
        ...(strategy === 'continuedDeepening'
          ? {
              continuedDeepening: {
                broad: { depthCap: 1 },
                deep: {
                  depthCap: 3,
                  trigger: ['allRequestedRefsDepthCapped'],
                  rootPolicy: 'allRootsWithinCap',
                },
              },
            }
          : {}),
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
};

export const createCatalog = (
  strategy: PreviewStrategy,
): AgentPolicyCatalog => {
  const profile = createProfile(strategy);
  return withCompiledPolicyCatalog({
    schemaVersion: 3,
    catalogFingerprint: `continued-deepening-${strategy}`,
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
          dependencies: {
            parameters: [],
            stateFeatures: [],
            candidateFeatures: [],
            aggregates: [],
            strategicConditions: [],
          },
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
};

export const createDef = (catalog: AgentPolicyCatalog): GameDef =>
  assertValidatedGameDef({
    metadata: { id: 'continued-deepening-fixture', players: { min: 2, max: 2 } },
    seats: [{ id: 'us' }, { id: 'arvn' }],
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
    actions: [{
      id: asActionId('draft-options'),
      actor: 'active',
      executor: 'actor',
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }] satisfies ActionDef[],
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
              n: 2,
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

export const createInput = (
  def: GameDef,
  state: ReturnType<typeof initialState>['state'],
  microturn: MicroturnState,
): AgentMicroturnDecisionInput => ({
  def,
  state,
  microturn,
  rng: { state: state.rng },
});

export const capturePreview = (
  strategy: PreviewStrategy,
) => {
  const catalog = createCatalog(strategy);
  const def = createDef(catalog);
  const initial = initialState(def, 164, 2);
  const actionSelection = publishMicroturn(def, initial.state);
  const firstAction = actionSelection.legalActions[0];
  if (firstAction === undefined) {
    throw new Error('fixture expected an initial legal action');
  }
  const afterAction = applyDecision(def, initial.state, firstAction).state;
  const microturn = publishMicroturn(def, afterAction);
  if (microturn.kind !== 'chooseNStep') {
    throw new Error(`fixture expected chooseNStep, got ${microturn.kind}`);
  }
  const preview = createPolicyAgentChooseNStepInnerPreview(
    createInput(def, afterAction, microturn as ChooseNStepMicroturn),
    {
      catalog,
      seatId: 'us',
      profileId: 'baseline',
      profile: catalog.profiles.baseline!,
    },
  );
  if (preview === undefined) {
    throw new Error('fixture expected inner preview');
  }
  return preview;
};

export const runPolicyTrace = (
  strategy: PreviewStrategy,
  mutateCatalog?: (catalog: AgentPolicyCatalog) => void,
): PolicyAgentDecisionTrace => {
  const catalog = createCatalog(strategy);
  mutateCatalog?.(catalog);
  const def = createDef(catalog);
  const initial = initialState(def, 164, 2);
  const actionSelection = publishMicroturn(def, initial.state);
  const firstAction = actionSelection.legalActions[0];
  if (firstAction === undefined) {
    throw new Error('fixture expected an initial legal action');
  }
  const afterAction = applyDecision(def, initial.state, firstAction).state;
  const microturn = publishMicroturn(def, afterAction);
  if (microturn.kind !== 'chooseNStep') {
    throw new Error(`fixture expected chooseNStep, got ${microturn.kind}`);
  }
  const agent = new PolicyAgent({
    profileId: 'baseline',
    traceLevel: 'verbose',
    disableGuidedChooser: true,
  });
  const result = agent.chooseDecision(createInput(def, afterAction, microturn));
  if (result.agentDecision === undefined) {
    throw new Error('fixture expected policy trace');
  }
  return result.agentDecision;
};
