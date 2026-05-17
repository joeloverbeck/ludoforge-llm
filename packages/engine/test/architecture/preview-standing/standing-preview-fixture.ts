import * as assert from 'node:assert/strict';

import { PolicyAgent } from '../../../src/agents/policy-agent.js';
import {
  asActionId,
  asPhaseId,
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  initialState,
  publishMicroturn,
  type ActionDef,
  type ActionPipelineDef,
  type AgentMicroturnDecisionInput,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type GameDef,
  type PolicyAgentDecisionTrace,
  type CompiledAgentProfile,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');
const considerationId = 'opponentProjectedStandingSum';

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const previewStandingSum = (): AgentPolicyExpr => ({
  kind: 'seatAgg',
  over: 'opponents',
  expr: {
    kind: 'ref',
    ref: {
      kind: 'previewSurface',
      family: 'victoryCurrentMargin',
      id: 'currentMargin',
      selector: { kind: 'role', seatToken: '$seat' },
    },
  },
  aggOp: 'sum',
});

type PreviewVisibility = 'public' | 'hidden';

export const STANDING_PREVIEW_TERM_ID = considerationId;

export function createStandingPreviewDef(options: {
  readonly previewVisibility: PreviewVisibility;
  readonly completionDepthCap?: number;
  readonly primeUnknownPreviewRef?: boolean;
}): GameDef {
  return assertValidatedGameDef({
    metadata: { id: `spec-180-standing-preview-${options.previewVisibility}`, players: { min: 4, max: 4 } },
    seats: [{ id: 'north' }, { id: 'east' }, { id: 'south' }, { id: 'west' }],
    constants: {},
    globalVars: [
      { name: 'northStanding', type: 'int', init: 0, min: -20, max: 20 },
      { name: 'eastStanding', type: 'int', init: 0, min: -20, max: 20 },
      { name: 'southStanding', type: 'int', init: 0, min: -20, max: 20 },
      { name: 'westStanding', type: 'int', init: 0, min: -20, max: 20 },
    ],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: createStandingCatalog(options),
    actions: [
      {
        id: asActionId('hold-standing'),
        actor: 'active',
        executor: 'actor',
        phase: [phaseId],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('harm-east-standing'),
        actor: 'active',
        executor: 'actor',
        phase: [phaseId],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('deep-harm-south-standing'),
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
    actionPipelines: [
      {
        id: 'hold-standing-pipeline',
        actionId: asActionId('hold-standing'),
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [{ effects: [] }],
        atomicity: 'partial',
      },
      {
        id: 'harm-east-standing-pipeline',
        actionId: asActionId('harm-east-standing'),
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [{
          effects: [eff({ addVar: { scope: 'global', var: 'eastStanding', delta: 5 } })],
        }],
        atomicity: 'partial',
      },
      {
        id: 'deep-harm-south-standing-pipeline',
        actionId: asActionId('deep-harm-south-standing'),
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [{
          effects: [
            eff({
              chooseN: {
                internalDecisionId: 'decision:$standingBranch',
                bind: '$standingBranch',
                options: { query: 'enums', values: ['commit'] },
                n: 1,
              },
            }) as ActionPipelineDef['stages'][number]['effects'][number],
            eff({ addVar: { scope: 'global', var: 'southStanding', delta: 7 } }),
          ],
        }],
        atomicity: 'partial',
      },
    ],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        { seat: 'north', value: { _t: 2 as const, ref: 'gvar', var: 'northStanding' } },
        { seat: 'east', value: { _t: 2 as const, ref: 'gvar', var: 'eastStanding' } },
        { seat: 'south', value: { _t: 2 as const, ref: 'gvar', var: 'southStanding' } },
        { seat: 'west', value: { _t: 2 as const, ref: 'gvar', var: 'westStanding' } },
      ],
      ranking: { order: 'desc', tieBreakOrder: ['north', 'east', 'south', 'west'] },
    },
  });
}

export function runStandingPreviewTrace(options: {
  readonly previewVisibility: PreviewVisibility;
  readonly completionDepthCap?: number;
  readonly primeUnknownPreviewRef?: boolean;
}): PolicyAgentDecisionTrace {
  const def = createStandingPreviewDef(options);
  const runtime = createGameDefRuntime(def);
  const initial = initialState(def, 180, 4, undefined, runtime);
  const microturn = publishMicroturn(def, initial.state, runtime);
  assert.equal(microturn.kind, 'actionSelection');
  const agent = new PolicyAgent({
    profileId: 'baseline',
    traceLevel: 'verbose',
  });
  const input: AgentMicroturnDecisionInput = {
    def,
    state: initial.state,
    microturn,
    rng: createRng(180n),
    runtime,
  };
  const result = agent.chooseDecision(input);
  assert.ok(result.agentDecision !== undefined);
  return result.agentDecision;
}

export function candidateByActionId(trace: PolicyAgentDecisionTrace, actionId: string) {
  const candidate = trace.candidates?.find((entry) => entry.actionId === actionId);
  assert.ok(candidate, `Expected candidate for action "${actionId}"`);
  return candidate;
}

function createStandingCatalog(options: {
  readonly previewVisibility: PreviewVisibility;
  readonly completionDepthCap?: number;
  readonly primeUnknownPreviewRef?: boolean;
}): AgentPolicyCatalog {
  const considerations = options.primeUnknownPreviewRef
    ? ['primeOpponentProjectedStandingSum', considerationId]
    : [considerationId];
  const profile: CompiledAgentProfile = {
    fingerprint: `spec-180-standing-preview-${options.previewVisibility}-${options.completionDepthCap ?? 'default'}`,
    params: {},
    preview: {
      mode: 'exactWorld',
      completion: 'greedy',
      ...(options.completionDepthCap === undefined ? {} : { completionDepthCap: options.completionDepthCap }),
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

  const visibility = {
    current: 'public' as const,
    preview: {
      visibility: options.previewVisibility,
      allowWhenHiddenSampling: options.previewVisibility === 'public',
    },
  };

  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: profile.fingerprint,
    surfaceVisibility: {
      globalVars: {},
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: visibility,
        currentRank: visibility,
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
      considerations: {
        primeOpponentProjectedStandingSum: {
          scopes: ['move'],
          costClass: 'preview',
          weight: literal(1),
          value: previewStandingSum(),
          previewFallback: { onUnavailable: 'noContribution' },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
        [considerationId]: {
          scopes: ['move'],
          costClass: 'preview',
          weight: literal(1),
          value: previewStandingSum(),
          previewFallback: { onUnavailable: 'noContribution' },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: { baseline: profile },
    bindingsBySeat: {
      north: 'baseline',
      east: 'baseline',
      south: 'baseline',
      west: 'baseline',
    },
  });
}
