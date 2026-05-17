import { createPolicyPreviewRuntime, type PolicyPreviewRuntime } from '../../../src/agents/policy-preview.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  createTrustedExecutableMove,
  type GameDef,
  type GameState,
  type TrustedExecutableMove,
  type TurnFlowPendingFreeOperationGrant,
} from '../../../src/kernel/index.js';
import { asDecisionFrameId, asTurnId, type DecisionStackFrame } from '../../../src/kernel/microturn/types.js';

export const grantPhase = (
  state: GameState | undefined,
  grantId: string,
): TurnFlowPendingFreeOperationGrant['phase'] | undefined =>
  state?.turnOrderState.type === 'cardDriven'
    ? state.turnOrderState.runtime.pendingFreeOperationGrants?.find((grant) => grant.grantId === grantId)?.phase
    : undefined;

export const createPostGrantDef = (): GameDef => ({
  metadata: { id: 'post-grant-preview-driver', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
  seats: [{ id: '0' }, { id: '1' }],
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
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
        actionClassByActionId: { operation: 'operation' },
        freeOperationActionIds: ['operation'],
      },
    },
  },
  actions: [{
    id: asActionId('operation'),
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('main')],
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  }],
  triggers: [],
  terminal: { conditions: [] },
});

const makeGrant = (grantId: string): TurnFlowPendingFreeOperationGrant => ({
  grantId,
  phase: 'ready',
  seat: '0',
  operationClass: 'operation',
  actionIds: ['operation'],
  remainingUses: 1,
});

const emptyEffectFrame = (): DecisionStackFrame['effectFrame'] => ({
  programCounter: 0,
  boundedIterationCursors: {},
  localBindings: {},
  pendingTriggerQueue: [],
});

const grantFrame = (
  grant: TurnFlowPendingFreeOperationGrant,
  frameId: number,
  parentFrameId: number | null,
): DecisionStackFrame => ({
  frameId: asDecisionFrameId(frameId),
  parentFrameId: parentFrameId === null ? null : asDecisionFrameId(parentFrameId),
  turnId: asTurnId(0),
  context: {
    kind: 'outcomeGrantResolve',
    seatId: '__kernel',
    grant,
  },
  effectFrame: emptyEffectFrame(),
});

export const createBaseState = (): GameState => ({
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
});

export const createTrustedOperation = (state: GameState): TrustedExecutableMove =>
  createTrustedExecutableMove({ actionId: asActionId('operation'), params: {} }, state.stateHash, 'enumerateLegalMoves');

export const createOutcomeGrantState = (
  baseState: GameState,
  grantIds: readonly string[],
): GameState => {
  const grants = grantIds.map(makeGrant);
  const frames = grants.map((grant, index) => grantFrame(grant, index + 1, index === 0 ? null : index));
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
        pendingFreeOperationGrants: grants,
      },
    },
    decisionStack: frames,
  };
};

export const createRuntime = (
  def: GameDef,
  state: GameState,
  trustedMove: TrustedExecutableMove,
  grantIds: readonly string[],
  outcomeGrantContinuation?: {
    readonly enabled: boolean;
    readonly extraDepthCap: number;
    readonly capClass: 'postGrant16';
  },
): PolicyPreviewRuntime =>
  createPolicyPreviewRuntime({
    def,
    state,
    playerId: asPlayerId(0),
    seatId: '0',
    trustedMoveIndex: new Map([['candidate', trustedMove]]),
    previewMode: 'exactWorld',
    completionPolicy: 'greedy',
    completionDepthCap: 8,
    ...(outcomeGrantContinuation === undefined ? {} : { outcomeGrantContinuation }),
    dependencies: {
      applyMove() {
        return { state: createOutcomeGrantState(state, grantIds) };
      },
    },
  });
