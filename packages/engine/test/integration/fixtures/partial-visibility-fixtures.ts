import { evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import { scoreMicroturnOptionWithContributions } from '../../../src/agents/microturn-option-eval.js';
import {
  asActionId,
  asBoundaryId,
  asPhaseId,
  asPlayerId,
  asSeatId,
  asTokenId,
  asZoneId,
  assertValidatedGameDef,
  computeFullHash,
  createGameDefRuntime,
  createZobristTable,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentPolicyRef,
  type GameDef,
  type GameState,
  type Move,
  type MoveParamValue,
  type Token,
} from '../../../src/kernel/index.js';
import type { DecisionKey } from '../../../src/kernel/decision-scope.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

export const SCHEDULE_REF_ID = 'schedule.distance.toBoundary.coupEntry.cards';

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });

export const scheduleDistanceRef = (): Extract<CompiledAgentPolicyRef, { readonly kind: 'scheduleDistance' }> => ({
  kind: 'scheduleDistance',
  target: { kind: 'boundary', boundaryId: asBoundaryId('coupEntry') },
  unit: 'cards',
});

const scheduleRefExpr = (): AgentPolicyExpr => refExpr(scheduleDistanceRef());

const cardToken = (id: string): Token => ({
  id: asTokenId(id),
  type: 'card',
  props: {},
});

export function makePartialVisibilityDef(): GameDef {
  return assertValidatedGameDef({
    metadata: { id: 'partial-visibility-runtime', players: { min: 1, max: 1 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      {
        id: asZoneId('draw:none'),
        owner: 'none',
        visibility: 'hidden',
        ordering: 'stack',
        behavior: { type: 'deck', drawFrom: 'top' },
      },
      { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: asZoneId('lookahead:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: asZoneId('leader:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    seats: [{ id: asSeatId('solo') }],
    tokenTypes: [{ id: 'card', props: {} }],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }, { id: asPhaseId('scoring') }] },
    phaseBoundaries: [
      {
        id: asBoundaryId('coupEntry'),
        kind: 'phaseEntry',
        phaseId: asPhaseId('scoring'),
        schedule: {
          kind: 'cardDraw',
          deckId: 'eventDeck',
          cardSelector: { tags: ['coup'] },
          observerPolicy: {
            kind: 'topNVisible',
            visiblePrefix: {
              zones: [{ id: 'lookahead:none' }, { id: 'leader:none' }],
              maxItems: 2,
            },
          },
        },
      },
    ],
    eventDecks: [{
      id: 'eventDeck',
      drawZone: 'draw:none',
      discardZone: 'discard:none',
      cards: [
        { id: 'op-1', title: 'Operation 1', sideMode: 'single', tags: ['operation'] },
        { id: 'coup-1', title: 'Coup 1', sideMode: 'single', tags: ['coup'] },
        { id: 'op-2', title: 'Operation 2', sideMode: 'single', tags: ['operation'] },
        { id: 'coup-2', title: 'Coup 2', sideMode: 'single', tags: ['coup'] },
      ],
    }],
    agents: makePartialVisibilityCatalog(),
    actions: [
      {
        id: asActionId('govern'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        tags: ['govern'],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('pass'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        tags: ['pass'],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  });
}

function makePartialVisibilityCatalog(): AgentPolicyCatalog {
  const consideration = (
    visiblePrefixExhausted:
      | 'useLowerBound'
      | 'noContribution'
      | 'dropConsideration'
      | { readonly kind: 'constant'; readonly value: number },
  ) => ({
    scopes: ['move' as const],
    costClass: 'state' as const,
    weight: literal(10),
    value: scheduleRefExpr(),
    scheduleFallback: {
      onUnavailable: { kind: 'constant' as const, value: 99 },
      onPartial: { visiblePrefixExhausted },
    },
    dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
  });

  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: 'partial-visibility-runtime',
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
      considerations: {
        useLowerBound: consideration('useLowerBound'),
        noContribution: consideration('noContribution'),
        dropConsideration: consideration('dropConsideration'),
        constant: consideration({ kind: 'constant', value: 7 }),
      },
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: {
      baseline: {
        fingerprint: 'baseline',
        params: {},
        observerName: 'public',
        preview: { mode: 'disabled' },
        selection: { mode: 'argmax' },
        use: {
          pruningRules: [],
          considerations: ['useLowerBound'],
          tieBreakers: [],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: [],
          candidateAggregates: [],
          considerations: ['useLowerBound'],
        },
      },
    },
    bindingsBySeat: { solo: 'baseline' },
  });
}

export function stateWithVisiblePrefix(
  def: GameDef,
  lookaheadCardIds: readonly string[],
  leaderCardIds: readonly string[],
  hiddenDrawCardIds: readonly string[] = ['coup-2'],
  turnCount = 0,
): GameState {
  const base = initialState(def, 1, 1).state;
  const next: GameState = {
    ...base,
    turnCount,
    zones: {
      'draw:none': hiddenDrawCardIds.map(cardToken),
      'discard:none': [],
      'lookahead:none': lookaheadCardIds.map(cardToken),
      'leader:none': leaderCardIds.map(cardToken),
    },
  };
  const hash = computeFullHash(createZobristTable(def), next);
  return { ...next, stateHash: hash, _runningHash: hash };
}

export function scorePartialVisibilityConsideration(
  def: GameDef,
  state: GameState,
  considerationId: 'useLowerBound' | 'noContribution' | 'dropConsideration' | 'constant',
) {
  return scoreMicroturnOptionWithContributions(
    state,
    def,
    def.agents!,
    asPlayerId(0),
    'solo',
    {},
    {
      kind: 'pending',
      complete: false,
      decisionPlayer: asPlayerId(0),
      decisionKey: '$partial-visibility' as DecisionKey,
      name: '$partial-visibility',
      type: 'chooseOne',
      options: [{ value: 'continue', legality: 'legal', illegalReason: null }],
      targetKinds: ['zone'],
    },
    'continue' as MoveParamValue,
    0,
    [considerationId],
    createGameDefRuntime(def),
  );
}

export function evaluatePartialVisibilityPolicy(def: GameDef, state: GameState) {
  const moves: readonly Move[] = [
    { actionId: asActionId('govern'), params: {} },
    { actionId: asActionId('pass'), params: {} },
  ];
  return evaluatePolicyMoveCore({
    def,
    state,
    playerId: asPlayerId(0),
    legalMoves: moves,
    trustedMoveIndex: new Map(),
    rng: { state: state.rng },
    profileIdOverride: 'baseline',
    runtime: createGameDefRuntime(def),
    encodedStateMode: 'disabled',
    traceLevel: 'verbose',
  });
}
