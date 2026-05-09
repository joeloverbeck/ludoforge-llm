import { PolicyAgent } from '../../src/agents/index.js';
import {
  applyDecision,
  asActionId,
  asPhaseId,
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
  type PolicyAgentDecisionTrace,
} from '../../src/kernel/index.js';
import { eff } from './effect-tag-helper.js';
import {
  withCompiledPolicyCatalog,
  type AgentPolicyCatalogFixtureLibrary,
} from './policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');
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

function createProfile(innerChooseOne: boolean | undefined): CompiledAgentProfile {
  return {
    fingerprint: `spec-160-inner-preview-${innerChooseOne === true ? 'on' : 'off'}`,
    params: {},
    preview: {
      mode: 'exactWorld',
      completion: 'policyGuided',
      ...(innerChooseOne === undefined
        ? {}
        : {
            inner: {
              chooseOne: innerChooseOne,
              chooseNStep: false,
              maxOptions: 4,
              chooseNBeamWidth: 1,
              depthCap: 4,
            },
          }),
    },
    selection: { mode: 'argmax' },
    use: {
      pruningRules: [],
      considerations: ['preferProjectedMargin'],
      tieBreakers: [],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      considerations: ['preferProjectedMargin'],
    },
  };
}

function createCatalog(innerChooseOne: boolean | undefined): AgentPolicyCatalog {
  const profile = createProfile(innerChooseOne);
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: `spec-160-inner-preview-${innerChooseOne === true ? 'on' : 'off'}`,
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

export function createSpec160InnerPreviewDef(innerChooseOne?: boolean): GameDef {
  const catalog = createCatalog(innerChooseOne);
  return assertValidatedGameDef({
    metadata: { id: `spec-160-inner-preview-${innerChooseOne === true ? 'on' : 'off'}`, players: { min: 2, max: 2 } },
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

export interface Spec160InnerPreviewTraceSample {
  readonly actionSelection: PolicyAgentDecisionTrace | undefined;
  readonly innerChooseOne: PolicyAgentDecisionTrace | undefined;
}

export function captureSpec160InnerPreviewTrace(innerChooseOne?: boolean): Spec160InnerPreviewTraceSample {
  const def = createSpec160InnerPreviewDef(innerChooseOne);
  const agent = new PolicyAgent({ traceLevel: 'verbose' });
  const state = initialState(def, 7, 2).state;
  const actionSelection = publishMicroturn(def, state);
  const actionDecision = agent.chooseDecision({ def, state, microturn: actionSelection, rng: createRng(11n) });
  const afterAction = applyDecision(def, state, actionDecision.decision).state;
  const inner = publishMicroturn(def, afterAction);
  const innerDecision = agent.chooseDecision({ def, state: afterAction, microturn: inner, rng: createRng(13n) });
  return {
    actionSelection: actionDecision.agentDecision,
    innerChooseOne: innerDecision.agentDecision,
  };
}
