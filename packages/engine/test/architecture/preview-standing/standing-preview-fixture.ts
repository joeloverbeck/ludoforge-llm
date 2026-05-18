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
  type AgentPolicySeatAggOver,
  type GameDef,
  type PolicyAgentDecisionTrace,
  type CompiledAgentProfile,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');
const considerationId = 'opponentProjectedStandingSum';
type SeatAggAvailability = 'requireAllReady' | 'requireAnyReady' | 'selfAndTargetReady' | 'skipUnavailable';

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
export const currentStandingRef = (): AgentPolicyExpr => ({
  kind: 'ref',
  ref: {
    kind: 'currentSurface',
    family: 'victoryCurrentMargin',
    id: 'currentMargin',
    selector: { kind: 'role', seatToken: '$seat' },
  },
});
const previewStandingRef = (): AgentPolicyExpr => ({
  kind: 'ref',
  ref: {
    kind: 'previewSurface',
    family: 'victoryCurrentMargin',
    id: 'currentMargin',
    selector: { kind: 'role', seatToken: '$seat' },
  },
});
const previewSelfStandingRef = (): AgentPolicyExpr => ({
  kind: 'ref',
  ref: {
    kind: 'previewSurface',
    family: 'victoryCurrentMargin',
    id: 'currentMargin',
    selector: { kind: 'player', player: 'self' },
  },
});
const previewStandingSum = (options: {
  readonly availability?: SeatAggAvailability;
  readonly expr?: AgentPolicyExpr;
  readonly over?: AgentPolicySeatAggOver;
} = {}): AgentPolicyExpr => ({
  kind: 'seatAgg',
  over: options.over ?? 'opponents',
  expr: options.expr ?? previewStandingRef(),
  aggOp: 'sum',
  ...(options.availability === undefined ? {} : { availability: options.availability }),
});

type PreviewVisibility = 'public' | 'hidden';

export const STANDING_PREVIEW_TERM_ID = considerationId;

export function createStandingPreviewDef(options: {
  readonly previewVisibility: PreviewVisibility;
  readonly completionDepthCap?: number;
  readonly primeUnknownPreviewRef?: boolean;
  readonly seatAggAvailability?: SeatAggAvailability;
  readonly seatAggExpr?: AgentPolicyExpr;
  readonly seatAggOver?: AgentPolicySeatAggOver;
  readonly useSelfPreviewRef?: boolean;
  readonly initialStandings?: Partial<Record<'north' | 'east' | 'south' | 'west', number>>;
  readonly rankingOrder?: 'asc' | 'desc';
  readonly currentVisibility?: 'public' | 'seatVisible' | 'hidden';
}): GameDef {
  const initialStandings = options.initialStandings ?? {};
  return assertValidatedGameDef({
    metadata: { id: `spec-180-standing-preview-${options.previewVisibility}`, players: { min: 4, max: 4 } },
    seats: [{ id: 'north' }, { id: 'east' }, { id: 'south' }, { id: 'west' }],
    constants: {},
    globalVars: [
      { name: 'northStanding', type: 'int', init: initialStandings.north ?? 0, min: -20, max: 20 },
      { name: 'eastStanding', type: 'int', init: initialStandings.east ?? 0, min: -20, max: 20 },
      { name: 'southStanding', type: 'int', init: initialStandings.south ?? 0, min: -20, max: 20 },
      { name: 'westStanding', type: 'int', init: initialStandings.west ?? 0, min: -20, max: 20 },
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
      ranking: { order: options.rankingOrder ?? 'desc', tieBreakOrder: ['north', 'east', 'south', 'west'] },
    },
  });
}

export function runStandingPreviewTrace(options: {
  readonly previewVisibility: PreviewVisibility;
  readonly completionDepthCap?: number;
  readonly primeUnknownPreviewRef?: boolean;
  readonly seatAggAvailability?: SeatAggAvailability;
  readonly seatAggExpr?: AgentPolicyExpr;
  readonly seatAggOver?: AgentPolicySeatAggOver;
  readonly useSelfPreviewRef?: boolean;
  readonly initialStandings?: Partial<Record<'north' | 'east' | 'south' | 'west', number>>;
  readonly rankingOrder?: 'asc' | 'desc';
  readonly currentVisibility?: 'public' | 'seatVisible' | 'hidden';
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
  readonly seatAggAvailability?: SeatAggAvailability;
  readonly seatAggExpr?: AgentPolicyExpr;
  readonly seatAggOver?: AgentPolicySeatAggOver;
  readonly useSelfPreviewRef?: boolean;
  readonly currentVisibility?: 'public' | 'seatVisible' | 'hidden';
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
    current: options.currentVisibility ?? ('public' as const),
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
          value: options.useSelfPreviewRef === true
            ? previewSelfStandingRef()
            : previewStandingSum({
                ...(options.seatAggAvailability === undefined ? {} : { availability: options.seatAggAvailability }),
                ...(options.seatAggExpr === undefined ? {} : { expr: options.seatAggExpr }),
                ...(options.seatAggOver === undefined ? {} : { over: options.seatAggOver }),
              }),
          previewFallback: { onUnavailable: 'noContribution' },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
        [considerationId]: {
          scopes: ['move'],
          costClass: 'preview',
          weight: literal(1),
          value: options.useSelfPreviewRef === true
            ? previewSelfStandingRef()
            : previewStandingSum({
                ...(options.seatAggAvailability === undefined ? {} : { availability: options.seatAggAvailability }),
                ...(options.seatAggExpr === undefined ? {} : { expr: options.seatAggExpr }),
                ...(options.seatAggOver === undefined ? {} : { over: options.seatAggOver }),
              }),
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

export function partiallyUnavailableStandingExpr(): AgentPolicyExpr {
  return {
    kind: 'op',
    op: 'if',
    args: [
      {
        kind: 'op',
        op: 'eq',
        args: [currentStandingRef(), literal(0)],
      },
      previewStandingRef(),
      literal(5),
    ],
  };
}
