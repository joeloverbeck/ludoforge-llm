import {
  applyDecision,
  asActionId,
  asPhaseId,
  asZoneId,
  assertValidatedGameDef,
  initialState,
  publishMicroturn,
  type ActionDef,
  type ActionPipelineDef,
  type AgentMicroturnDecisionInput,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type CompiledAgentPolicyRef,
  type CompiledAgentProfile,
  type GameDef,
  type PolicyAgentDecisionTrace,
} from '../../../src/kernel/index.js';
import type { ChooseNStepContext, MicroturnState } from '../../../src/kernel/microturn/types.js';
import { createPolicyAgentChooseNStepInnerPreview } from '../../../src/agents/policy-agent-inner-preview.js';
import { PolicyAgent } from '../../../src/agents/policy-agent.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';
import { lookupSurfaceVisibility, literalExpr, microturnOptionValueExpr } from '../lookup-refs/lookup-refs-fixture.js';

type ChooseNStepMicroturn = MicroturnState & {
  readonly kind: 'chooseNStep';
  readonly decisionContext: ChooseNStepContext;
};

type Trigger = NonNullable<NonNullable<CompiledAgentProfile['preview']['inner']>['continuedDeepening']>['deep']['trigger'][number];

const phaseId = asPhaseId('main');
const projectedLookupRefId = 'lookup.previewOptionState.zones.ZoneId.1212757921.variables.population';
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });

const projectedPopulationRef: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }> = {
  kind: 'lookup',
  surface: 'previewOptionState',
  collection: 'zones',
  keyType: 'ZoneId',
  key: microturnOptionValueExpr,
  path: ['variables', 'population'],
  onMissing: 'unavailable',
  onHidden: 'unavailable',
};

const createCatalog = (
  trigger: Trigger,
  pickCount: number,
): AgentPolicyCatalog => {
  const broadDepthCap = trigger === 'allReadyValuesUniform' ? 2 : 1;
  const profile: CompiledAgentProfile = {
    fingerprint: `projected-lookup-deepening-${trigger}-${pickCount}`,
    observerName: 'currentPlayer',
    params: {},
    preview: {
      mode: 'exactWorld',
      completion: 'greedy',
      inner: {
        chooseOne: false,
        chooseNStep: true,
        maxOptions: 4,
        chooseNBeamWidth: 1,
        depthCap: broadDepthCap,
        strategy: 'continuedDeepening',
        capClass: 'deep1024',
        continuedDeepening: {
          broad: { depthCap: broadDepthCap },
          deep: {
            depthCap: 3,
            trigger: [trigger],
            rootPolicy: 'allRootsWithinCap',
          },
        },
      },
    },
    selection: { mode: 'argmax' },
    use: {
      guardrails: [],
      considerations: ['projectedPopulation'],
      tieBreakers: [],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      considerations: ['projectedPopulation'],
    },
  };
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: `projected-lookup-deepening-${trigger}-${pickCount}`,
    surfaceVisibility: lookupSurfaceVisibility,
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      guardrails: {},
      considerations: {
        projectedPopulation: {
          scopes: ['microturn'],
          costClass: 'preview',
          when: literalExpr(true),
          weight: literalExpr(1),
          value: refExpr(projectedPopulationRef),
          previewFallback: { onUnavailable: 'noContribution' },
          dependencies: {
            parameters: [],
            stateFeatures: [],
            candidateFeatures: [],
            aggregates: [],
            strategicConditions: [],
          },
        },
      },
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: { baseline: profile },
    bindingsBySeat: { us: 'baseline', arvn: 'baseline' },
  });
};

const createDef = (
  catalog: AgentPolicyCatalog,
  pickCount: number,
): GameDef => assertValidatedGameDef({
  metadata: { id: `projected-lookup-deepening-${pickCount}`, players: { min: 2, max: 2 } },
  seats: [{ id: 'us' }, { id: 'arvn' }],
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zoneVars: [{ name: 'population', type: 'int', init: 5, min: 0, max: 20 }],
  zones: [
    { id: asZoneId('zone-a:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'region' },
    { id: asZoneId('zone-b:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'region' },
    { id: asZoneId('zone-c:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'region' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  agents: catalog,
  actions: [{
    id: asActionId('draft-zones'),
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
    id: 'draft-zones-pipeline',
    actionId: asActionId('draft-zones'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [{
      effects: [
        eff({
          chooseN: {
            internalDecisionId: 'decision:$zones',
            bind: '$zones',
            options: { query: 'enums', values: ['zone-a:none', 'zone-b:none', 'zone-c:none'] },
            n: pickCount,
          },
        }) as ActionPipelineDef['stages'][number]['effects'][number],
      ],
    }],
    atomicity: 'partial',
  }],
  triggers: [],
  terminal: { conditions: [] },
});

const createInput = (
  def: GameDef,
  state: ReturnType<typeof initialState>['state'],
  microturn: MicroturnState,
): AgentMicroturnDecisionInput => ({
  def,
  state,
  microturn,
  rng: { state: state.rng },
});

const createScenario = (trigger: Trigger, pickCount: number) => {
  const catalog = createCatalog(trigger, pickCount);
  const def = createDef(catalog, pickCount);
  const initial = initialState(def, 165, 2);
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
  return {
    catalog,
    def,
    state: afterAction,
    microturn: microturn as ChooseNStepMicroturn,
  };
};

export const captureProjectedLookupDeepening = (trigger: Trigger, pickCount: number) => {
  const scenario = createScenario(trigger, pickCount);
  const preview = createPolicyAgentChooseNStepInnerPreview(
    createInput(scenario.def, scenario.state, scenario.microturn),
    {
      catalog: scenario.catalog,
      seatId: 'us',
      profileId: 'baseline',
      profile: scenario.catalog.profiles.baseline!,
    },
  );
  if (preview === undefined) {
    throw new Error('fixture expected inner preview');
  }
  return preview;
};

export const runProjectedLookupTrace = (trigger: Trigger, pickCount: number): PolicyAgentDecisionTrace => {
  const scenario = createScenario(trigger, pickCount);
  const agent = new PolicyAgent({
    profileId: 'baseline',
    traceLevel: 'verbose',
    disableGuidedChooser: true,
  });
  const result = agent.chooseDecision(createInput(scenario.def, scenario.state, scenario.microturn));
  if (result.agentDecision === undefined) {
    throw new Error('fixture expected policy trace');
  }
  return result.agentDecision;
};

export { projectedLookupRefId };
