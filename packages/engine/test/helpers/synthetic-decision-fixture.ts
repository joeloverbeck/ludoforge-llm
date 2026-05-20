import {
  asActionId,
  asPhaseId,
  asPlayerId,
  assertValidatedGameDef,
  createTrustedExecutableMove,
  initialState,
  type ActionDef,
  type ActionPipelineDef,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type CompiledAgentPolicyRef,
  type CompiledAgentProfile,
  type GameDef,
} from '../../src/kernel/index.js';
import { createPolicyPreviewRuntime } from '../../src/agents/policy-preview.js';
import { eff } from './effect-tag-helper.js';
import { withCompiledPolicyCatalog } from './policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');
const literal = (value: string | number | boolean): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});

export const createSyntheticDecisionDef = (): GameDef => assertValidatedGameDef({
  metadata: { id: 'synthetic-decision-trace', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
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
        eff({ addVar: { scope: 'global', var: 'score', delta: 3 } }),
      ],
    }],
    atomicity: 'partial',
  }],
  triggers: [],
  terminal: { conditions: [] },
});

export const createSyntheticPolicyGuidedDeps = (): {
  readonly catalog: AgentPolicyCatalog;
  readonly profile: CompiledAgentProfile;
} => {
  const profile: CompiledAgentProfile = {
    fingerprint: 'synthetic-policy-guided',
    params: {},
    preview: { mode: 'exactWorld', completion: 'policyGuided' },
    selection: { mode: 'argmax' },
    use: {
      guardrails: [],
      considerations: ['preferRight'],
      tieBreakers: [],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      considerations: ['preferRight'],
    },
  };
  const catalog = withCompiledPolicyCatalog({
    schemaVersion: 3,
    catalogFingerprint: 'synthetic-policy-guided',
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
      considerations: {
        preferRight: {
          scopes: ['microturn'],
          costClass: 'state',
          weight: literal(10),
          value: opExpr(
            'boolToNumber',
            opExpr('eq', refExpr({ kind: 'microturnOptionIntrinsic', intrinsic: 'value' }), literal('right')),
          ),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: { baseline: profile },
    bindingsBySeat: { '0': 'baseline' },
  });
  return { catalog, profile };
};

export const captureSyntheticDecisionPreviewDrive = (options?: {
  readonly completionPolicy?: 'greedy' | 'policyGuided';
  readonly fallbackCompletionPolicy?: 'greedy' | 'fail';
  readonly policyGuidedDeps?: {
    readonly catalog: AgentPolicyCatalog;
    readonly profile: CompiledAgentProfile;
  };
}) => {
  const def = createSyntheticDecisionDef();
  const state = initialState(def, 156, 2).state;
  const move = { actionId: asActionId('branch'), params: {} };
  const trustedMove = createTrustedExecutableMove(move, state.stateHash, 'enumerateLegalMoves');
  const runtime = createPolicyPreviewRuntime({
    def,
    state,
    playerId: asPlayerId(0),
    seatId: '0',
    trustedMoveIndex: new Map([['candidate', trustedMove]]),
    previewMode: 'exactWorld',
    completionPolicy: options?.completionPolicy ?? 'greedy',
    ...(options?.fallbackCompletionPolicy === undefined ? {} : { fallbackCompletionPolicy: options.fallbackCompletionPolicy }),
    completionDepthCap: 8,
    captureSyntheticDecisions: true,
    ...(options?.policyGuidedDeps === undefined ? {} : { policyGuidedDeps: options.policyGuidedDeps }),
  });
  const candidate = { move, stableMoveKey: 'candidate', actionId: 'branch' };
  return {
    outcome: runtime.getOutcome(candidate),
    previewDrive: runtime.getPreviewDrive(candidate),
    completionPolicyFallbackCount: runtime.getCompletionPolicyFallbackCount(candidate),
  };
};
