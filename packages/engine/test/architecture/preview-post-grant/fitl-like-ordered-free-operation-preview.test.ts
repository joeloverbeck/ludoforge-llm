// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPolicyAgentDecisionTrace } from '../../../src/agents/policy-diagnostics.js';
import { evaluatePolicyMove } from '../../../src/agents/policy-eval.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  createTrustedExecutableMove,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentPolicyRef,
  type CompiledAgentProfile,
  type GameDef,
  type GameState,
  type Move,
  type TurnFlowPendingFreeOperationGrant,
} from '../../../src/kernel/index.js';
import { asDecisionFrameId, asTurnId, type DecisionStackFrame } from '../../../src/kernel/microturn/types.js';
import { createRng } from '../../../src/kernel/prng.js';
import { EFFECT_KIND_TAG, VALUE_EXPR_TAG } from '../../../src/kernel/types-ast.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const SEAT_REF_ID = 'victoryCurrentMargin.currentMargin.$seat';
const grantFlowContinuation = {
  enabled: true,
  postGrantDepthCap: 4,
  postGrantCapClass: 'postGrant16',
  freeOperationDepthCap: 16,
  freeOperationCapClass: 'grantFlow16',
} as const;

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const seatMarginRef = (): AgentPolicyExpr => ({
  kind: 'ref',
  ref: {
    kind: 'previewSurface',
    family: 'victoryCurrentMargin',
    id: 'currentMargin',
    selector: { kind: 'role', seatToken: '$seat' },
  } satisfies Extract<CompiledAgentPolicyRef, { readonly kind: 'previewSurface' }>,
});

function createProfile(grantFlowEnabled = true): CompiledAgentProfile {
  return {
    fingerprint: 'fitl-like-ordered-free-operation-preview',
    params: {},
    preview: {
      mode: 'exactWorld',
      completion: 'greedy',
      ...(grantFlowEnabled ? { grantFlowContinuation } : {}),
    },
    selection: { mode: 'argmax' },
    use: {
      guardrails: [],
      considerations: ['opponentPreviewMargin'],
      tieBreakers: [],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      considerations: ['opponentPreviewMargin'],
    },
  };
}

function createCatalog(grantFlowEnabled?: boolean): AgentPolicyCatalog {
  const profile = createProfile(grantFlowEnabled);
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: profile.fingerprint,
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
        opponentPreviewMargin: {
          scopes: ['move'],
          costClass: 'preview',
          when: literal(true),
          weight: literal(1),
          value: {
            kind: 'seatAgg',
            over: 'opponents',
            expr: seatMarginRef(),
            aggOp: 'sum',
            availability: 'requireAllReady',
          },
          previewFallback: { onUnavailable: 'noContribution' },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: { baseline: profile },
    bindingsBySeat: { '0': 'baseline' },
  });
}

function createDef(grantFlowEnabled?: boolean): GameDef {
  return {
    metadata: { id: 'fitl-like-ordered-free-operation-preview', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [
      { name: 'nvaMargin', type: 'int', init: 0, min: 0, max: 20 },
      { name: 'vcMargin', type: 'int', init: 0, min: 0, max: 20 },
    ],
    perPlayerVars: [],
    zoneVars: [{ name: 'pressure', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [
      { id: asZoneId('alpha:none'), owner: 'none', visibility: 'public', ordering: 'set', attributes: { terrain: ['targetable'] } },
      { id: asZoneId('beta:none'), owner: 'none', visibility: 'public', ordering: 'set', attributes: { terrain: ['targetable'] } },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['0', '1'] },
          windows: [],
          optionMatrix: [],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          actionClassByActionId: {
            rootAlpha: 'operation',
            rootBeta: 'operation',
            alphaOperation: 'operation',
            betaOperation: 'operation',
          },
          freeOperationActionIds: ['alphaOperation', 'betaOperation'],
        },
      },
    },
    actions: [
      createAction('rootAlpha', []),
      createAction('rootBeta', []),
      createAction('alphaOperation', [
        { _k: EFFECT_KIND_TAG.addVar, addVar: { scope: 'global', var: 'nvaMargin', delta: 2 } },
        { _k: EFFECT_KIND_TAG.addVar, addVar: { scope: 'zoneVar', zone: 'alpha:none', var: 'pressure', delta: 1 } },
      ]),
      createAction('betaOperation', [
        { _k: EFFECT_KIND_TAG.addVar, addVar: { scope: 'global', var: 'vcMargin', delta: 5 } },
        { _k: EFFECT_KIND_TAG.addVar, addVar: { scope: 'zoneVar', zone: 'beta:none', var: 'pressure', delta: 1 } },
      ]),
    ],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        { seat: '0', value: 0 },
        { seat: '1', value: { _t: VALUE_EXPR_TAG.REF, ref: 'gvar', var: 'nvaMargin' } },
      ],
      ranking: { order: 'desc' },
    },
    agents: createCatalog(grantFlowEnabled),
  };
}

function createAction(id: string, effects: GameDef['actions'][number]['effects']): GameDef['actions'][number] {
  return {
    id: asActionId(id),
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('main')],
    params: [],
    pre: null,
    cost: [],
    effects,
    limits: [],
  };
}

function createBaseState(): GameState {
  return {
    globalVars: { nvaMargin: 0, vcMargin: 0 },
    perPlayerVars: {},
    zoneVars: {
      'alpha:none': { pressure: 0 },
      'beta:none': { pressure: 0 },
    },
    playerCount: 2,
    zones: {
      'alpha:none': [],
      'beta:none': [],
    },
    nextTokenOrdinal: 0,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(0),
    turnCount: 0,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
    stateHash: 0n,
    _runningHash: 0n,
    actionUsage: {},
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        seatOrder: ['0', '1'],
        eligibility: { '0': true, '1': true },
        lifecycleStatus: { stalled: false },
        currentCard: {
          firstEligible: '0',
          secondEligible: '1',
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
        pendingEligibilityOverrides: [],
      },
    },
    decisionStack: [],
    markers: {},
    reveals: undefined,
    globalMarkers: undefined,
    activeLastingEffects: undefined,
    interruptPhaseStack: undefined,
  };
}

function createOutcomeGrantState(
  baseState: GameState,
  actionId: 'alphaOperation' | 'betaOperation',
  grantId: string,
): GameState {
  const grant: TurnFlowPendingFreeOperationGrant = {
    grantId,
    phase: 'ready',
    seat: '0',
    operationClass: 'operation',
    actionIds: [actionId],
    zoneFilter: { op: 'zonePropIncludes', zone: actionId === 'alphaOperation' ? 'alpha:none' : 'beta:none', prop: 'terrain', value: 'targetable' },
    remainingUses: 1,
    sequenceBatchId: 'ordered-space-grants',
    sequenceIndex: 0,
  };
  const frame: DecisionStackFrame = {
    frameId: asDecisionFrameId(1),
    parentFrameId: null,
    turnId: asTurnId(0),
    context: {
      kind: 'outcomeGrantResolve',
      seatId: '__kernel',
      grant,
    },
    effectFrame: {
      programCounter: 0,
      boundedIterationCursors: {},
      localBindings: {},
      pendingTriggerQueue: [],
    },
  };
  const baseRuntime = baseState.turnOrderState.type === 'cardDriven'
    ? baseState.turnOrderState.runtime
    : undefined;
  return {
    ...baseState,
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...(baseRuntime ?? {}),
        seatOrder: ['0', '1'],
        eligibility: { '0': true, '1': true },
        lifecycleStatus: { stalled: false },
        currentCard: {
          firstEligible: '0',
          secondEligible: '1',
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
        pendingEligibilityOverrides: [],
        pendingFreeOperationGrants: [grant],
        freeOperationSequenceContexts: {
          'ordered-space-grants': {
            capturedMoveZonesByKey: { targetSpace: [actionId === 'alphaOperation' ? 'alpha:none' : 'beta:none'] },
            progressionPolicy: 'strictInOrder',
            skippedStepIndices: [],
          },
        },
      },
    },
    decisionStack: [frame],
  };
}

function evaluate(grantFlowEnabled = true) {
  const def = createDef(grantFlowEnabled);
  const state = createBaseState();
  const legalMoves: readonly Move[] = [
    { actionId: asActionId('rootAlpha'), params: {} },
    { actionId: asActionId('rootBeta'), params: {} },
  ];
  const trustedMoveIndex = new Map(legalMoves.map((move) => [
    `${String(move.actionId)}:{}`,
    createTrustedExecutableMove(move, state.stateHash, 'enumerateLegalMoves'),
  ]));
  const result = evaluatePolicyMove({
    def,
    state,
    playerId: asPlayerId(0),
    legalMoves,
    trustedMoveIndex,
    rng: createRng(185n),
    traceLevel: 'verbose',
    encodedStateMode: 'disabled',
    previewDependencies: {
      applyMove(_def, currentState, trustedMove) {
        const rootActionId = String(trustedMove.move.actionId);
        return {
          state: createOutcomeGrantState(
            currentState,
            rootActionId === 'rootAlpha' ? 'alphaOperation' : 'betaOperation',
            rootActionId === 'rootAlpha' ? 'grant-alpha' : 'grant-beta',
          ),
        };
      },
    },
  });
  return buildPolicyAgentDecisionTrace(result.metadata, 'verbose');
}

describe('FITL-like ordered free-operation preview witness', () => {
  it('keeps opponent margin unavailable before grant-flow continuation executes the operation', () => {
    const trace = evaluate(false);
    const candidates = trace.candidates ?? [];

    assert.equal(candidates.length, 2);
    assert.equal(candidates.every((candidate) => candidate.previewOutcome === 'grantFlowPartial'), true);
    assert.equal(trace.previewUsage.readyRefStats[SEAT_REF_ID]?.readyCount, 0);
    assert.equal(trace.previewUsage.outcomeBreakdown?.unknownGrantFlowPartial, 2);
  });

  it('executes ordered space grants deterministically and differentiates projected opponent margin', () => {
    const first = evaluate();
    const second = evaluate();
    const candidates = first.candidates ?? [];

    assert.equal(candidates.length, 2);
    assert.deepEqual(
      candidates.map((candidate) => candidate.previewDrive?.grantFlowSegments?.map((segment) => segment.kind)),
      [
        ['outcomeGrantResolve', 'grantOffered', 'freeOperationActionSelection', 'selectedFreeOperation', 'deferredEffectsReleased', 'grantConsumed'],
        ['outcomeGrantResolve', 'grantOffered', 'freeOperationActionSelection', 'selectedFreeOperation', 'deferredEffectsReleased', 'grantConsumed'],
      ],
    );
    assert.deepEqual(
      candidates.map((candidate) =>
        candidate.previewDrive?.grantFlowSegments?.find((segment) => segment.kind === 'selectedFreeOperation')?.actionId
      ),
      ['alphaOperation', 'betaOperation'],
    );
    assert.deepEqual(
      candidates.map((candidate) => candidate.scoreContributions.find((entry) => entry.termId === 'opponentPreviewMargin')?.contribution),
      [2, 0],
    );
    assert.equal(candidates.every((candidate) => candidate.previewOutcome === 'ready'), true);
    assert.deepEqual(
      second.candidates?.map((candidate) => candidate.previewDrive?.grantFlowSegments),
      candidates.map((candidate) => candidate.previewDrive?.grantFlowSegments),
    );
  });
});
