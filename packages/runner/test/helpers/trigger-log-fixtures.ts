import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTriggerId,
  type TriggerLogEntry,
} from '@ludoforge/engine/runtime';

export const TRIGGER_LOG_ENTRIES_EXHAUSTIVE: readonly TriggerLogEntry[] = [
  {
    kind: 'fired',
    triggerId: asTriggerId('trigger-1'),
    event: { type: 'phaseEnter', phase: asPhaseId('main') },
    depth: 0,
  },
  {
    kind: 'truncated',
    event: { type: 'turnEnd' },
    depth: 3,
  },
  {
    kind: 'turnFlowLifecycle',
    step: 'initialRevealPlayed',
    slots: { played: 'played', lookahead: 'lookahead', leader: 'leader' },
    before: { playedCardId: null, lookaheadCardId: 'c-1', leaderCardId: 'c-2' },
    after: { playedCardId: 'c-1', lookaheadCardId: null, leaderCardId: 'c-2' },
  },
  {
    kind: 'turnFlowEligibility',
    step: 'candidateScan',
    seat: 'us',
    before: {
      firstEligible: null,
      secondEligible: null,
      actedSeats: [],
      passedSeats: [],
      nonPassCount: 0,
      firstActionClass: null,
    },
    after: {
      firstEligible: 'us',
      secondEligible: 'arvn',
      actedSeats: ['us'],
      passedSeats: [],
      nonPassCount: 1,
      firstActionClass: 'operation',
    },
  },
  {
    kind: 'turnFlowDeferredEventLifecycle',
    stage: 'queued',
    deferredId: 'deferred-1',
    actionId: 'event-action',
    requiredGrantBatchIds: ['grant-batch-1'],
  },
  {
    kind: 'simultaneousSubmission',
    player: asPlayerId(0),
    move: { actionId: 'tick', params: {} },
    submittedBefore: { 0: false, 1: false },
    submittedAfter: { 0: true, 1: false },
  },
  {
    kind: 'simultaneousCommit',
    playersInOrder: ['us', 'arvn'],
    pendingCount: 2,
  },
  {
    kind: 'operationPartial',
    actionId: asActionId('tick'),
    profileId: 'profile-1',
    step: 'costSpendSkipped',
    reason: 'costValidationFailed',
  },
  {
    kind: 'operationFree',
    actionId: asActionId('tick'),
    step: 'costSpendSkipped',
  },
  {
    kind: 'operationCompoundStagesReplaced',
    actionId: asActionId('tick'),
    profileId: 'profile-1',
    insertAfterStage: 1,
    totalStages: 3,
    skippedStageCount: 1,
  },
];
