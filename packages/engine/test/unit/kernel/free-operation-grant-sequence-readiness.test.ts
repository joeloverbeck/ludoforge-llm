// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyTurnFlowEligibilityAfterMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  type GameDef,
  type GameState,
  type Move,
  type TurnFlowPendingFreeOperationGrant,
  type TurnFlowRuntimeState,
} from '../../../src/kernel/index.js';
import { resolvePendingFreeOperationGrantSequenceStatus } from '../../../src/kernel/free-operation-sequence-progression.js';
import { requireCardDrivenRuntime } from '../../helpers/turn-order-helpers.js';

const makeGrant = (
  grantId: string,
  sequenceIndex: number,
): TurnFlowPendingFreeOperationGrant => ({
  grantId,
  phase: sequenceIndex === 0 ? 'ready' : 'sequenceWaiting',
  seat: sequenceIndex === 0 ? 'us' : 'arvn',
  operationClass: 'specialActivity',
  actionIds: sequenceIndex === 0 ? ['airLift'] : ['transport'],
  viabilityPolicy: 'requireUsableAtIssue',
  completionPolicy: 'required',
  postResolutionTurnFlow: 'resumeCardFlow',
  remainingUses: 1,
  sequenceBatchId: 'macv-us-then-arvn',
  sequenceIndex,
});

const implementWhatCanContext: TurnFlowRuntimeState['freeOperationSequenceContexts'] = {
  'macv-us-then-arvn': {
    capturedMoveZonesByKey: {},
    progressionPolicy: 'implementWhatCanInOrder',
    skippedStepIndices: [],
  },
};

const createSequenceDef = (): GameDef => ({
  metadata: { id: 'grant-sequence-readiness-test', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
  seats: [{ id: 'us' }, { id: 'arvn' }],
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('played:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
    { id: asZoneId('lookahead:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
    { id: asZoneId('leader:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
  ],
  tokenTypes: [{ id: 'card', props: { isCoup: 'boolean' } }],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  turnOrder: {
    type: 'cardDriven',
    config: {
      turnFlow: {
        cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
        eligibility: { seats: ['us', 'arvn'] },
        windows: [],
        optionMatrix: [],
        passRewards: [],
        durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        actionClassByActionId: {
          pass: 'pass',
          airLift: 'specialActivity',
          transport: 'specialActivity',
        },
        freeOperationActionIds: ['airLift', 'transport'],
      },
    },
  },
  actions: [
    {
      id: asActionId('pass'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    },
    {
      id: asActionId('airLift'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    },
    {
      id: asActionId('transport'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
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

const createSequenceState = (
  pendingFreeOperationGrants: readonly TurnFlowPendingFreeOperationGrant[],
): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'deck:none': [],
    'played:none': [{ id: asTokenId('tok_card_0'), type: 'card', props: { isCoup: false } }],
    'lookahead:none': [{ id: asTokenId('tok_card_1'), type: 'card', props: { isCoup: false } }],
    'leader:none': [],
  },
  nextTokenOrdinal: 2,
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
      seatOrder: ['us', 'arvn'],
      eligibility: { us: true, arvn: true },
      currentCard: {
        firstEligible: 'us',
        secondEligible: 'arvn',
        actedSeats: [],
        passedSeats: [],
        nonPassCount: 0,
        firstActionClass: null,
      },
      pendingEligibilityOverrides: [],
      pendingFreeOperationGrants: [...pendingFreeOperationGrants],
      freeOperationSequenceContexts: implementWhatCanContext,
    },
  },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

describe('free-operation grant sequence readiness', () => {
  it('promotes newly unblocked sequenced grants to ready after move processing', () => {
    const def = createSequenceDef();
    const laterGrant = makeGrant('grant-1', 1);
    const move: Move = {
      actionId: asActionId('airLift'),
      params: {},
      freeOperation: true,
    };

    const result = applyTurnFlowEligibilityAfterMove(def, createSequenceState([laterGrant]), move);

    const runtime = requireCardDrivenRuntime(result.state);
    const pending = runtime.pendingFreeOperationGrants ?? [];
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.grantId, 'grant-1');
    assert.equal(pending[0]?.phase, 'ready');
    assert.equal(runtime.currentCard.firstEligible, 'arvn');
    assert.ok(
      result.traceEntries.some(
        (entry) =>
          entry.kind === 'turnFlowGrantLifecycle'
          && entry.step === 'advanceToReady'
          && entry.grantId === 'grant-1'
          && entry.fromPhase === 'sequenceWaiting'
          && entry.toPhase === 'ready',
      ),
    );
  });

  it('reports blocking grant ids through the canonical sequence status helper', () => {
    const firstGrant = makeGrant('grant-0', 0);
    const laterGrant = makeGrant('grant-1', 1);

    assert.deepEqual(
      resolvePendingFreeOperationGrantSequenceStatus(
        [firstGrant, laterGrant],
        laterGrant,
        implementWhatCanContext,
      ),
      {
        progressionPolicy: 'implementWhatCanInOrder',
        ready: false,
        blockingGrantIds: ['grant-0'],
        satisfiedEarlierStepIndices: [],
        skippedEarlierStepIndices: [],
      },
    );
  });

  it('treats consumed earlier implementWhatCanInOrder steps as non-blocking in sequence status', () => {
    const laterGrant = makeGrant('grant-1', 1);

    assert.deepEqual(
      resolvePendingFreeOperationGrantSequenceStatus(
        [laterGrant],
        laterGrant,
        implementWhatCanContext,
      ),
      {
        progressionPolicy: 'implementWhatCanInOrder',
        ready: true,
        blockingGrantIds: [],
        satisfiedEarlierStepIndices: [0],
        skippedEarlierStepIndices: [],
      },
    );
  });

  it('records skipped earlier steps as satisfied for implementWhatCanInOrder batches', () => {
    const laterGrant = makeGrant('grant-1', 1);
    const skippedFirstStepContext: TurnFlowRuntimeState['freeOperationSequenceContexts'] = {
      'macv-us-then-arvn': {
        capturedMoveZonesByKey: {},
        progressionPolicy: 'implementWhatCanInOrder',
        skippedStepIndices: [0],
      },
    };

    assert.deepEqual(
      resolvePendingFreeOperationGrantSequenceStatus(
        [laterGrant],
        laterGrant,
        skippedFirstStepContext,
      ),
      {
        progressionPolicy: 'implementWhatCanInOrder',
        ready: true,
        blockingGrantIds: [],
        satisfiedEarlierStepIndices: [0],
        skippedEarlierStepIndices: [0],
      },
    );
  });
});
