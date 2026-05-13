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
  createZobristTable,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type ChoicePendingRequest,
  type CompiledAgentPolicyRef,
  type GameDef,
  type GameState,
  type MoveParamValue,
  type PlayerId,
  type Token,
} from '../../../src/kernel/index.js';
import type { DecisionKey } from '../../../src/kernel/decision-scope.js';
import type { GameDefRuntime } from '../../../src/kernel/gamedef-runtime.js';
import { advanceScheduleIndexForDraw, createGameDefRuntime, forkGameDefRuntimeForRun } from '../../../src/kernel/gamedef-runtime.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});

export const scheduleDistanceRef = (
  boundaryId = 'coupEntry',
  unit: Extract<CompiledAgentPolicyRef, { readonly kind: 'scheduleDistance' }>['unit'] = 'cards',
): Extract<CompiledAgentPolicyRef, { readonly kind: 'scheduleDistance' }> => ({
  kind: 'scheduleDistance',
  target: { kind: 'boundary', boundaryId: asBoundaryId(boundaryId) },
  unit,
});

export const scheduleRefExpr = (boundaryId?: string): AgentPolicyExpr => refExpr(scheduleDistanceRef(boundaryId));

export const chooseOneRequest: ChoicePendingRequest = {
  kind: 'pending',
  complete: false,
  decisionPlayer: 0 as PlayerId,
  decisionKey: '$schedule-ref' as DecisionKey,
  name: '$schedule-ref',
  type: 'chooseOne',
  options: [{ value: 'continue', legality: 'legal', illegalReason: null }],
  targetKinds: ['zone'],
};

const cardToken = (id: string): Token => ({
  id: asTokenId(id),
  type: 'card',
  props: {},
});

export function makeScheduleRefDef(hiddenDrawZone = false): GameDef {
  return assertValidatedGameDef({
    metadata: { id: hiddenDrawZone ? 'schedule-ref-hidden' : 'schedule-ref-public', players: { min: 1, max: 1 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      {
        id: asZoneId('draw:none'),
        owner: 'none',
        visibility: hiddenDrawZone ? 'hidden' : 'public',
        ordering: 'stack',
        behavior: { type: 'deck', drawFrom: 'top' },
      },
      { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
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
        schedule: { kind: 'cardDraw', deckId: 'eventDeck', cardSelector: { tags: ['coup'] } },
      },
      {
        id: asBoundaryId('lateCoupEntry'),
        kind: 'phaseEntry',
        phaseId: asPhaseId('scoring'),
        schedule: { kind: 'cardDraw', deckId: 'eventDeck', cardSelector: { cardIds: ['coup-2'] } },
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
        { id: 'op-3', title: 'Operation 3', sideMode: 'single', tags: ['operation'] },
      ],
    }],
    agents: makeScheduleCatalog(),
    actions: [{
      id: asActionId('drawCard'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [{ _k: 7, draw: { from: 'draw:none', to: 'discard:none', count: 1 } }],
      limits: [],
    }],
    triggers: [],
    terminal: { conditions: [] },
  });
}

export function makeScheduleCatalog(): AgentPolicyCatalog {
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: 'schedule-ref-test',
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
        cards: {
          scopes: ['microturn'],
          costClass: 'state',
          weight: literal(1),
          value: scheduleRefExpr(),
          scheduleFallback: { onUnavailable: 'noContribution' },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
        explicitZero: {
          scopes: ['microturn'],
          costClass: 'state',
          weight: literal(1),
          value: scheduleRefExpr(),
          scheduleFallback: { onUnavailable: { kind: 'constant', value: 0 } },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
        drop: {
          scopes: ['microturn'],
          costClass: 'state',
          weight: literal(1),
          value: scheduleRefExpr(),
          scheduleFallback: { onUnavailable: 'dropConsideration' },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
        whenUnavailableIsFalse: {
          scopes: ['microturn'],
          costClass: 'state',
          when: opExpr('gt', scheduleRefExpr(), literal(0)),
          weight: literal(3),
          value: literal(1),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: {},
    bindingsBySeat: {},
  });
}

export function stateWithDrawnCount(def: GameDef, drawnCount: number): GameState {
  const base = initialState(def, 1, 1).state;
  const deck = def.eventDecks![0]!.cards.map((card) => cardToken(card.id));
  const next = {
    ...base,
    zones: {
      'draw:none': deck.slice(drawnCount),
      'discard:none': deck.slice(0, drawnCount).reverse(),
    },
  };
  const hash = computeFullHash(createZobristTable(def), next);
  return { ...next, stateHash: hash, _runningHash: hash };
}

export function runtimeWithDrawnCount(def: GameDef, drawnCount: number): GameDefRuntime {
  const runtime = forkGameDefRuntimeForRun(createGameDefRuntime(def));
  advanceScheduleIndexForDraw(runtime, 'eventDeck', drawnCount);
  return runtime;
}

export function scoreScheduleConsiderations(
  def: GameDef,
  state: GameState,
  considerationIds: readonly string[],
  runtime?: GameDefRuntime,
) {
  return scoreMicroturnOptionWithContributions(
    state,
    def,
    def.agents!,
    asPlayerId(0),
    'solo',
    {},
    chooseOneRequest,
    'continue' as MoveParamValue,
    0,
    considerationIds,
    runtime,
  );
}
