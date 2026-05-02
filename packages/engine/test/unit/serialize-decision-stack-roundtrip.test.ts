// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asDecisionFrameId,
  asPhaseId,
  asPlayerId,
  asSeatId,
  asTurnId,
  deserializeGameState,
  serializeGameState,
  SerializedGameStateSchema,
} from '../../src/kernel/index.js';
import type { DecisionKey, DecisionStackFrame, GameState, SerializedGameState } from '../../src/kernel/index.js';

const makeBaseState = (overrides: Partial<GameState> = {}): GameState => ({
  globalVars: { round: 1 },
  perPlayerVars: { 0: { vp: 3 } },
  zoneVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 12,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 4,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 0x2aabn] },
  stateHash: 0x00abcdn,
  _runningHash: 0x00abcdn,
  actionUsage: { playCard: { turnCount: 1, phaseCount: 1, gameCount: 2 } },
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
  decisionStack: [],
  nextFrameId: asDecisionFrameId(0),
  nextTurnId: asTurnId(0),
  activeDeciderSeatId: asSeatId('0'),
  ...overrides,
});

const makeActionFrame = (frameId: number): DecisionStackFrame => ({
  frameId: asDecisionFrameId(frameId),
  parentFrameId: null,
  turnId: asTurnId(1),
  context: {
    kind: 'actionSelection',
    seatId: asSeatId('0'),
    eligibleActions: [asActionId('playCard')],
  },
  effectFrame: {
    programCounter: 2,
    boundedIterationCursors: { root: 1 },
    localBindings: { amount: 1 },
    pendingTriggerQueue: [],
  },
});

const makeFrameWithSuspendedState = (suspendedState: GameState): DecisionStackFrame => ({
  frameId: asDecisionFrameId(1),
  parentFrameId: null,
  turnId: asTurnId(1),
  context: {
    kind: 'chooseOne',
    seatId: asSeatId('0'),
    decisionKey: '$choice' as DecisionKey,
    options: [],
  },
  effectFrame: {
    programCounter: 3,
    boundedIterationCursors: { root: 1 },
    localBindings: { amount: 1 },
    pendingTriggerQueue: [],
    suspendedFrame: {
      state: suspendedState,
      rng: { state: { algorithm: 'pcg-dxsm-128', version: 1, state: [0x4n, 0x5n] } },
      actorPlayer: asPlayerId(0),
      bindings: { selected: 'alpha' },
      leaf: {
        kind: 'chooseOne',
        decisionKey: '$choice' as DecisionKey,
        bind: '$choice',
        decisionScope: { iterationPath: 'root', counters: {} },
        bindingOptions: [{ comparable: 'alpha', binding: 'alpha' }],
      },
      resumeStack: [{ kind: 'sequence', effects: [] }],
    },
  },
});

const roundTripViaJson = (state: GameState): GameState => {
  const serialized = serializeGameState(state);
  const parsed = SerializedGameStateSchema.parse(JSON.parse(JSON.stringify(serialized))) as SerializedGameState;
  return deserializeGameState(parsed);
};

describe('decision-stack serialization round-trip', () => {
  it('round-trips an empty decision stack', () => {
    const state = makeBaseState();

    assert.deepEqual(roundTripViaJson(state), state);
  });

  it('round-trips a single decision-stack frame without a suspended frame', () => {
    const state = makeBaseState({
      decisionStack: [makeActionFrame(0)],
      nextFrameId: asDecisionFrameId(1),
      nextTurnId: asTurnId(2),
    });

    assert.deepEqual(roundTripViaJson(state), state);
  });

  it('round-trips a suspended frame whose nested state has its own decision stack', () => {
    const nestedState = makeBaseState({
      stateHash: 0x111n,
      _runningHash: 0x111n,
      rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0x9n, 0xan] },
      decisionStack: [makeActionFrame(0)],
      nextFrameId: asDecisionFrameId(1),
      nextTurnId: asTurnId(2),
    });
    const state = makeBaseState({
      stateHash: 0x222n,
      _runningHash: 0x222n,
      rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0x7n, 0x8n] },
      decisionStack: [makeFrameWithSuspendedState(nestedState)],
      nextFrameId: asDecisionFrameId(2),
      nextTurnId: asTurnId(2),
    });

    assert.deepEqual(roundTripViaJson(state), state);
  });
});
