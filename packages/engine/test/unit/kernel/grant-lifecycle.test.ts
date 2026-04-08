import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advanceToReady,
  asActionId,
  asPhaseId,
  asPlayerId,
  advanceSequenceGrants,
  consumeUse,
  consumeGrantUse,
  createSeatResolutionContext,
  createProbeOverlay,
  expireGrant,
  expireReadyBlockingGrantsForSeat,
  expireGrantsForSeat,
  insertGrant,
  insertGrantBatch,
  markOffered,
  skipGrant,
  stripZoneFilterFromProbeGrant,
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

describe('grant lifecycle array operations', () => {
  it('insertGrant appends a grant, emits no trace, and does not mutate the input array', () => {
    const existing = [makeGrant()];
    const inserted = makeGrant({ grantId: 'grant-1', seat: '1' });

    const result = insertGrant(existing, inserted);

    assert.deepEqual(result.grants, [existing[0], inserted]);
    assert.deepEqual(result.trace, []);
    assert.deepEqual(existing, [makeGrant()]);
  });

  it('insertGrant rejects duplicate grant ids', () => {
    assert.throws(
      () => insertGrant([makeGrant()], makeGrant()),
      (error: unknown) =>
        error instanceof Error
        && 'code' in error
        && (error as Error & { readonly code?: string }).code === 'RUNTIME_CONTRACT_INVALID',
    );
  });

  it('insertGrantBatch preserves ordered batches, emits no trace, and does not mutate inputs', () => {
    const existing = [makeGrant()];
    const batch = [
      makeGrant({
        grantId: 'grant-1',
        phase: 'sequenceWaiting',
        sequenceBatchId: 'batch-0',
        sequenceIndex: 0,
      }),
      makeGrant({
        grantId: 'grant-2',
        phase: 'sequenceWaiting',
        sequenceBatchId: 'batch-0',
        sequenceIndex: 1,
      }),
    ];

    const result = insertGrantBatch(existing, batch);

    assert.deepEqual(result.grants, [existing[0], ...batch]);
    assert.deepEqual(result.trace, []);
    assert.deepEqual(existing, [makeGrant()]);
    assert.deepEqual(batch, [
      makeGrant({
        grantId: 'grant-1',
        phase: 'sequenceWaiting',
        sequenceBatchId: 'batch-0',
        sequenceIndex: 0,
      }),
      makeGrant({
        grantId: 'grant-2',
        phase: 'sequenceWaiting',
        sequenceBatchId: 'batch-0',
        sequenceIndex: 1,
      }),
    ]);
  });

  it('insertGrantBatch rejects duplicate grant ids across existing grants and the batch', () => {
    assert.throws(
      () => insertGrantBatch([makeGrant()], [makeGrant({ grantId: 'grant-0' })]),
      (error: unknown) =>
        error instanceof Error
        && 'code' in error
        && (error as Error & { readonly code?: string }).code === 'RUNTIME_CONTRACT_INVALID',
    );
  });

  it('insertGrantBatch rejects out-of-order sequence batches', () => {
    assert.throws(
      () => insertGrantBatch([], [
        makeGrant({
          grantId: 'grant-1',
          phase: 'sequenceWaiting',
          sequenceBatchId: 'batch-0',
          sequenceIndex: 1,
        }),
        makeGrant({
          grantId: 'grant-2',
          phase: 'sequenceWaiting',
          sequenceBatchId: 'batch-0',
          sequenceIndex: 0,
        }),
      ]),
      (error: unknown) =>
        error instanceof Error
        && 'code' in error
        && (error as Error & { readonly code?: string }).code === 'RUNTIME_CONTRACT_INVALID',
    );
  });

  it('insertGrantBatch treats an empty batch as a content-preserving no-op', () => {
    const existing = [makeGrant()];

    const result = insertGrantBatch(existing, []);

    assert.deepEqual(result.grants, existing);
    assert.deepEqual(result.trace, []);
    assert.deepEqual(existing, [makeGrant()]);
  });

  it('consumeGrantUse decrements remaining uses, emits a trace entry, and does not mutate the input array', () => {
    const existing = [makeGrant({ phase: 'offered', remainingUses: 2 })];

    const result = consumeGrantUse(existing, 'grant-0');

    assert.deepEqual(result.grants, [
      makeGrant({ phase: 'ready', remainingUses: 1 }),
    ]);
    assert.equal(result.consumed.phase, 'ready');
    assert.equal(result.consumed.remainingUses, 1);
    assert.equal(result.wasExhausted, false);
    assert.deepEqual(result.trace, [{
      kind: 'turnFlowGrantLifecycle',
      step: 'consumeUse',
      grantId: 'grant-0',
      fromPhase: 'offered',
      toPhase: 'ready',
      seat: '0',
      operationClass: 'operation',
      remainingUsesBefore: 2,
      remainingUsesAfter: 1,
    }]);
    assert.deepEqual(existing, [makeGrant({ phase: 'offered', remainingUses: 2 })]);
  });

  it('consumeGrantUse removes exhausted grants', () => {
    const result = consumeGrantUse([makeGrant({ remainingUses: 1 })], 'grant-0');

    assert.deepEqual(result.grants, []);
    assert.equal(result.consumed.phase, 'exhausted');
    assert.equal(result.consumed.remainingUses, 0);
    assert.equal(result.wasExhausted, true);
    assert.equal(result.trace[0]?.toPhase, 'exhausted');
  });

  it('consumeGrantUse rejects unknown grant ids', () => {
    assert.throws(
      () => consumeGrantUse([makeGrant()], 'missing-grant'),
      (error: unknown) =>
        error instanceof Error
        && 'code' in error
        && (error as Error & { readonly code?: string }).code === 'RUNTIME_CONTRACT_INVALID',
    );
  });

  it('expireGrantsForSeat expires only ready or offered grants for the requested seat', () => {
    const existing = [
      makeGrant({ grantId: 'grant-0', seat: '0', phase: 'ready', completionPolicy: 'required' }),
      makeGrant({ grantId: 'grant-1', seat: '0', phase: 'offered', completionPolicy: 'skipIfNoLegalCompletion' }),
      makeGrant({ grantId: 'grant-2', seat: '0', phase: 'sequenceWaiting' }),
      makeGrant({ grantId: 'grant-3', seat: '1', phase: 'ready', completionPolicy: 'required' }),
    ];

    const result = expireGrantsForSeat(existing, '0');

    assert.deepEqual(result.grants, [
      existing[2],
      existing[3],
    ]);
    assert.equal(result.trace.length, 2);
    assert.deepEqual(result.trace.map((entry) => entry.grantId), ['grant-0', 'grant-1']);
    assert.deepEqual(existing, [
      makeGrant({ grantId: 'grant-0', seat: '0', phase: 'ready', completionPolicy: 'required' }),
      makeGrant({ grantId: 'grant-1', seat: '0', phase: 'offered', completionPolicy: 'skipIfNoLegalCompletion' }),
      makeGrant({ grantId: 'grant-2', seat: '0', phase: 'sequenceWaiting' }),
      makeGrant({ grantId: 'grant-3', seat: '1', phase: 'ready', completionPolicy: 'required' }),
    ]);
  });

  it('expireReadyBlockingGrantsForSeat expires only ready blocking grants for the requested seat', () => {
    const existing = [
      makeGrant({ grantId: 'grant-0', seat: '0', phase: 'ready', completionPolicy: 'required' }),
      makeGrant({ grantId: 'grant-1', seat: '0', phase: 'offered', completionPolicy: 'skipIfNoLegalCompletion' }),
      makeGrant({ grantId: 'grant-2', seat: '0', phase: 'ready' }),
      makeGrant({ grantId: 'grant-3', seat: '1', phase: 'ready', completionPolicy: 'required' }),
    ];

    const result = expireReadyBlockingGrantsForSeat(existing, '0');

    assert.deepEqual(result.grants, [
      existing[1],
      existing[2],
      existing[3],
    ]);
    assert.equal(result.trace.length, 1);
    assert.deepEqual(result.trace.map((entry) => entry.grantId), ['grant-0']);
    assert.deepEqual(existing, [
      makeGrant({ grantId: 'grant-0', seat: '0', phase: 'ready', completionPolicy: 'required' }),
      makeGrant({ grantId: 'grant-1', seat: '0', phase: 'offered', completionPolicy: 'skipIfNoLegalCompletion' }),
      makeGrant({ grantId: 'grant-2', seat: '0', phase: 'ready' }),
      makeGrant({ grantId: 'grant-3', seat: '1', phase: 'ready', completionPolicy: 'required' }),
    ]);
  });

  it('advanceSequenceGrants advances only ready batch ids and does not mutate the input array', () => {
    const existing = [
      makeGrant({
        grantId: 'grant-0',
        phase: 'sequenceWaiting',
        sequenceBatchId: 'batch-0',
        sequenceIndex: 0,
      }),
      makeGrant({
        grantId: 'grant-1',
        phase: 'sequenceWaiting',
        sequenceBatchId: 'batch-1',
        sequenceIndex: 0,
      }),
      makeGrant({
        grantId: 'grant-2',
        phase: 'ready',
        sequenceBatchId: 'batch-0',
        sequenceIndex: 1,
      }),
    ];

    const result = advanceSequenceGrants(existing, new Set(['batch-0']));

    assert.deepEqual(result.grants, [
      makeGrant({
        grantId: 'grant-0',
        phase: 'ready',
        sequenceBatchId: 'batch-0',
        sequenceIndex: 0,
      }),
      existing[1],
      existing[2],
    ]);
    assert.deepEqual(result.trace.map((entry) => entry.grantId), ['grant-0']);
    assert.deepEqual(existing, [
      makeGrant({
        grantId: 'grant-0',
        phase: 'sequenceWaiting',
        sequenceBatchId: 'batch-0',
        sequenceIndex: 0,
      }),
      makeGrant({
        grantId: 'grant-1',
        phase: 'sequenceWaiting',
        sequenceBatchId: 'batch-1',
        sequenceIndex: 0,
      }),
      makeGrant({
        grantId: 'grant-2',
        phase: 'ready',
        sequenceBatchId: 'batch-0',
        sequenceIndex: 1,
      }),
    ]);
  });

  it('createProbeOverlay concatenates the overlay without mutating either input array', () => {
    const existing = [makeGrant()];
    const probes = [makeGrant({ grantId: 'probe-0', seat: '1' })];

    const result = createProbeOverlay(existing, probes);

    assert.deepEqual(result, [existing[0], probes[0]]);
    assert.deepEqual(existing, [makeGrant()]);
    assert.deepEqual(probes, [makeGrant({ grantId: 'probe-0', seat: '1' })]);
  });

  it('stripZoneFilterFromProbeGrant removes zoneFilter from only the targeted probe grant', () => {
    const existing = [
      makeGrant({ grantId: 'grant-0', zoneFilter: { op: '==', left: 1, right: 1 } }),
      makeGrant({ grantId: 'probe-0', seat: '1', zoneFilter: { op: '==', left: 2, right: 2 } }),
    ];

    const result = stripZoneFilterFromProbeGrant(existing, 'probe-0');

    assert.deepEqual(result, [
      existing[0],
      makeGrant({ grantId: 'probe-0', seat: '1' }),
    ]);
    assert.deepEqual(existing, [
      makeGrant({ grantId: 'grant-0', zoneFilter: { op: '==', left: 1, right: 1 } }),
      makeGrant({ grantId: 'probe-0', seat: '1', zoneFilter: { op: '==', left: 2, right: 2 } }),
    ]);
  });
});
