// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../../src/agents/policy-runtime.js';
import { scoreMicroturnOptionWithContributions } from '../../../src/agents/microturn-option-eval.js';
import {
  asBoundaryId,
  asPhaseId,
  asPlayerId,
  asSeatId,
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
} from '../../../src/kernel/index.js';
import type { DecisionKey } from '../../../src/kernel/decision-scope.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});
const eqRef = (ref: CompiledAgentPolicyRef, value: AgentPolicyLiteral): AgentPolicyExpr =>
  opExpr('boolToNumber', opExpr('eq', refExpr(ref), literal(value)));

const considerationIds = [
  'currentMain',
  'nextOperations',
  'nextScoring',
  'nextBoundaryScoring',
] as const;

const catalog: AgentPolicyCatalog = withCompiledPolicyCatalog({
  schemaVersion: 3,
  catalogFingerprint: 'phase-identity-refs-test',
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
      currentMain: {
        scopes: ['microturn'],
        costClass: 'state',
        weight: literal(2),
        value: eqRef({ kind: 'phaseIntrinsic', name: 'current.id' }, 'main'),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
      nextOperations: {
        scopes: ['microturn'],
        costClass: 'state',
        weight: literal(3),
        value: eqRef({ kind: 'phaseIntrinsic', name: 'next.id' }, 'operations'),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
      nextScoring: {
        scopes: ['microturn'],
        costClass: 'state',
        weight: literal(5),
        value: eqRef({ kind: 'phaseIntrinsic', name: 'next.id' }, 'scoring'),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
      nextBoundaryScoring: {
        scopes: ['microturn'],
        costClass: 'state',
        weight: literal(7),
        value: eqRef({ kind: 'scheduleDistance', target: { kind: 'nextBoundary' } }, 'scoringEntry'),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
    },
    tieBreakers: {},
    strategicConditions: {},
  },
  profiles: {},
  bindingsBySeat: {},
});

const def: GameDef = assertValidatedGameDef({
  metadata: { id: 'phase-identity-refs-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  seats: [{ id: asSeatId('us') }, { id: asSeatId('them') }],
  tokenTypes: [],
  setup: [],
  turnStructure: {
    phases: [
      { id: asPhaseId('main') },
      { id: asPhaseId('operations') },
      { id: asPhaseId('scoring') },
      { id: asPhaseId('reset') },
    ],
    interrupts: [{ id: asPhaseId('reaction') }],
  },
  phaseBoundaries: [
    { id: asBoundaryId('scoringEntry'), kind: 'phaseEntry', phaseId: asPhaseId('scoring') },
    { id: asBoundaryId('resetEntry'), kind: 'phaseEntry', phaseId: asPhaseId('reset') },
  ],
  agents: catalog,
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const chooseOneRequest: ChoicePendingRequest = {
  kind: 'pending',
  complete: false,
  decisionPlayer: 0 as PlayerId,
  decisionKey: '$phase-ref' as DecisionKey,
  name: '$phase-ref',
  type: 'chooseOne',
  options: [{ value: 'continue', legality: 'legal', illegalReason: null }],
  targetKinds: ['zone'],
};

function withPhase(phaseId: string): GameState {
  const base = initialState(def, 1, 2).state;
  const next = {
    ...base,
    currentPhase: asPhaseId(phaseId),
  };
  const hash = computeFullHash(createZobristTable(def), next);
  return { ...next, stateHash: hash, _runningHash: hash };
}

function withPhaseForDef(gameDef: GameDef, phaseId: string): GameState {
  const base = initialState(gameDef, 1, 2).state;
  const next = {
    ...base,
    currentPhase: asPhaseId(phaseId),
  };
  const hash = computeFullHash(createZobristTable(gameDef), next);
  return { ...next, stateHash: hash, _runningHash: hash };
}

function scorePhaseRefs(phaseId: string) {
  const state = withPhase(phaseId);
  return scoreMicroturnOptionWithContributions(
    state,
    def,
    catalog,
    asPlayerId(0),
    'us',
    {},
    chooseOneRequest,
    'continue' as MoveParamValue,
    0,
    considerationIds,
  );
}

function providersForPhase(phaseId: string) {
  return providersForDefPhase(def, phaseId);
}

function providersForDefPhase(gameDef: GameDef, phaseId: string) {
  return createPolicyRuntimeProviders({
    def: gameDef,
    state: withPhaseForDef(gameDef, phaseId),
    playerId: asPlayerId(0),
    seatId: 'us',
    trustedMoveIndex: new Map(),
    catalog,
    runtimeError: (code, message) => new Error(`${code}: ${message}`),
  });
}

describe('phase identity refs', () => {
  it('resolves current phase, next phase, and next boundary at multiple main-sequence positions', () => {
    assert.deepEqual(scorePhaseRefs('main').scoreContributions, [
      { termId: 'currentMain', contribution: 2 },
      { termId: 'nextOperations', contribution: 3 },
      { termId: 'nextScoring', contribution: 0 },
      { termId: 'nextBoundaryScoring', contribution: 7 },
    ]);

    assert.deepEqual(scorePhaseRefs('operations').scoreContributions, [
      { termId: 'currentMain', contribution: 0 },
      { termId: 'nextOperations', contribution: 0 },
      { termId: 'nextScoring', contribution: 5 },
      { termId: 'nextBoundaryScoring', contribution: 7 },
    ]);
  });

  it('returns a stable unavailable reason for interrupt phase next.id and still resolves nextBoundary.id', () => {
    const providers = providersForPhase('reaction');

    assert.deepEqual(
      providers.phaseSchedule.resolvePhaseIntrinsic({ kind: 'phaseIntrinsic', name: 'next.id' }),
      { kind: 'unavailable', reason: 'interruptStateNoSuccessor' },
    );
    assert.deepEqual(
      providers.phaseSchedule.resolveScheduleDistance({ kind: 'scheduleDistance', target: { kind: 'nextBoundary' } }),
      { kind: 'ready', value: 'scoringEntry' },
    );

    assert.deepEqual(scorePhaseRefs('reaction').scoreContributions, [
      { termId: 'currentMain', contribution: 0 },
      { termId: 'nextOperations', contribution: 0 },
      { termId: 'nextScoring', contribution: 0 },
      { termId: 'nextBoundaryScoring', contribution: 7 },
    ]);
  });

  it('uses a distinct unavailable reason when the main phase sequence is exhausted', () => {
    const providers = providersForPhase('reset');

    assert.deepEqual(
      providers.phaseSchedule.resolvePhaseIntrinsic({ kind: 'phaseIntrinsic', name: 'next.id' }),
      { kind: 'unavailable', reason: 'phaseSequenceExhausted' },
    );
  });

  it('classifies no reachable boundary and unsupported schedule distance requests distinctly', () => {
    const noBoundaryDef = assertValidatedGameDef({ ...def, phaseBoundaries: [] });
    const noBoundaryProviders = providersForDefPhase(noBoundaryDef, 'main');
    const providers = providersForPhase('main');

    assert.deepEqual(
      noBoundaryProviders.phaseSchedule.resolveScheduleDistance({
        kind: 'scheduleDistance',
        target: { kind: 'nextBoundary' },
      }),
      { kind: 'unavailable', reason: 'noBoundaryReachable' },
    );
    assert.deepEqual(
      providers.phaseSchedule.resolveScheduleDistance({
        kind: 'scheduleDistance',
        target: { kind: 'boundary', boundaryId: asBoundaryId('scoringEntry') },
        unit: 'cards',
      }),
      { kind: 'unavailable', reason: 'notCardScheduled' },
    );
  });
});
