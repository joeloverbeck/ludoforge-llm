import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advanceToReady,
  asActionId,
  asPhaseId,
  asPlayerId,
  consumeUse,
  createSeatResolutionContext,
  expireGrant,
  markOffered,
  skipGrant,
  transitionReadyGrantForCandidateMove,
  type GameDef,
  type GameState,
  type TurnFlowPendingFreeOperationGrant,
} from '../../../src/kernel/index.js';

const makeGrant = (
  overrides?: Partial<TurnFlowPendingFreeOperationGrant>,
): TurnFlowPendingFreeOperationGrant => ({
  grantId: 'grant-0',
  phase: 'ready',
  seat: '0',
  operationClass: 'operation',
  actionIds: ['operation'],
  remainingUses: 2,
  ...overrides,
});

const createLifecycleState = (
  grant: TurnFlowPendingFreeOperationGrant,
): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {},
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
    },
  },
  markers: {},
});

const createLifecycleDef = (operationLegal: boolean): GameDef =>
  ({
    metadata: { id: 'grant-lifecycle-test', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }, { id: asPhaseId('other') }] },
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
          actionClassByActionId: { operation: 'operation' },
          freeOperationActionIds: ['operation'],
        },
      },
    },
    actions: [
      {
        id: asActionId('operation'),
        actor: 'active',
        executor: 'actor',
        phase: [operationLegal ? asPhaseId('main') : asPhaseId('other')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

describe('grant lifecycle transitions', () => {
  it('advanceToReady moves sequenceWaiting grants to ready and emits a trace entry', () => {
    const grant = makeGrant({ phase: 'sequenceWaiting' });

    const result = advanceToReady(grant);

    assert.equal(result.grant.phase, 'ready');
    assert.equal(grant.phase, 'sequenceWaiting');
    assert.deepEqual(result.traceEntry, {
      kind: 'turnFlowGrantLifecycle',
      step: 'advanceToReady',
      grantId: 'grant-0',
      fromPhase: 'sequenceWaiting',
      toPhase: 'ready',
      seat: '0',
      operationClass: 'operation',
      remainingUsesBefore: 2,
      remainingUsesAfter: 2,
    });
  });

  it('markOffered moves ready grants to offered and is deterministic', () => {
    const grant = makeGrant({ phase: 'ready' });

    const left = markOffered(grant);
    const right = markOffered(grant);

    assert.deepEqual(left, right);
    assert.equal(left.grant.phase, 'offered');
    assert.equal(grant.phase, 'ready');
  });

  it('consumeUse decrements remainingUses and returns ready when uses remain', () => {
    const grant = makeGrant({ phase: 'offered', remainingUses: 2 });

    const result = consumeUse(grant);

    assert.equal(result.grant.phase, 'ready');
    assert.equal(result.grant.remainingUses, 1);
    assert.equal(grant.phase, 'offered');
    assert.equal(grant.remainingUses, 2);
    assert.equal(result.traceEntry.fromPhase, 'offered');
    assert.equal(result.traceEntry.toPhase, 'ready');
    assert.equal(result.traceEntry.remainingUsesBefore, 2);
    assert.equal(result.traceEntry.remainingUsesAfter, 1);
  });

  it('consumeUse exhausts grants when remainingUses reaches zero', () => {
    const grant = makeGrant({ phase: 'ready', remainingUses: 1 });

    const result = consumeUse(grant);

    assert.equal(result.grant.phase, 'exhausted');
    assert.equal(result.grant.remainingUses, 0);
    assert.equal(result.traceEntry.toPhase, 'exhausted');
  });

  it('skipGrant only accepts skipIfNoLegalCompletion grants', () => {
    const grant = makeGrant({
      phase: 'offered',
      completionPolicy: 'skipIfNoLegalCompletion',
    });

    const result = skipGrant(grant);

    assert.equal(result.grant.phase, 'skipped');
    assert.equal(result.traceEntry.fromPhase, 'offered');
    assert.equal(result.traceEntry.toPhase, 'skipped');
  });

  it('expireGrant accepts required grants and emits a trace entry', () => {
    const grant = makeGrant({
      phase: 'ready',
      completionPolicy: 'required',
      postResolutionTurnFlow: 'resumeCardFlow',
    });

    const result = expireGrant(grant);

    assert.equal(result.grant.phase, 'expired');
    assert.equal(result.traceEntry.step, 'expireGrant');
    assert.equal(result.traceEntry.fromPhase, 'ready');
    assert.equal(result.traceEntry.toPhase, 'expired');
  });

  it('transitions ready skipIfNoLegalCompletion grants to skipped when no legal completion exists', () => {
    const grant = makeGrant({
      completionPolicy: 'skipIfNoLegalCompletion',
      postResolutionTurnFlow: 'resumeCardFlow',
    });
    const def = createLifecycleDef(false);
    const state = createLifecycleState(grant);

    const result = transitionReadyGrantForCandidateMove(
      def,
      state,
      grant,
      { actionId: asActionId('operation'), params: {}, freeOperation: true },
      createSeatResolutionContext(def, state.playerCount),
      {
        resolveDecisionSequence: (move) => ({
          complete: false,
          move,
          warnings: [],
        }),
      },
    );

    assert.equal(result.traceEntry.step, 'skipGrant');
    assert.equal(result.grant.phase, 'skipped');
  });

  it('transitions ready skipIfNoLegalCompletion grants to offered when a legal completion exists', () => {
    const grant = makeGrant({
      completionPolicy: 'skipIfNoLegalCompletion',
      postResolutionTurnFlow: 'resumeCardFlow',
    });
    const def = createLifecycleDef(true);
    const state = createLifecycleState(grant);

    const result = transitionReadyGrantForCandidateMove(
      def,
      state,
      grant,
      { actionId: asActionId('operation'), params: {}, freeOperation: true },
      createSeatResolutionContext(def, state.playerCount),
    );

    assert.equal(result.traceEntry.step, 'markOffered');
    assert.equal(result.grant.phase, 'offered');
  });

  it('throws runtime contract errors for invalid source phases', () => {
    assert.throws(
      () => advanceToReady(makeGrant({ phase: 'ready' })),
      (error: unknown) =>
        error instanceof Error
        && 'code' in error
        && (error as Error & { readonly code?: string }).code === 'RUNTIME_CONTRACT_INVALID',
    );
    assert.throws(
      () => markOffered(makeGrant({ phase: 'sequenceWaiting' })),
      (error: unknown) =>
        error instanceof Error
        && 'code' in error
        && (error as Error & { readonly code?: string }).code === 'RUNTIME_CONTRACT_INVALID',
    );
  });

  it('throws runtime contract errors for invalid policy transitions', () => {
    assert.throws(
      () => skipGrant(makeGrant({ completionPolicy: 'required' })),
      (error: unknown) =>
        error instanceof Error
        && 'code' in error
        && (error as Error & { readonly code?: string }).code === 'RUNTIME_CONTRACT_INVALID',
    );
    assert.throws(
      () => expireGrant(makeGrant()),
      (error: unknown) =>
        error instanceof Error
        && 'code' in error
        && (error as Error & { readonly code?: string }).code === 'RUNTIME_CONTRACT_INVALID',
    );
  });
});
