// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
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
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0x1n, 0x2n] },
  stateHash: 0x10n,
  _runningHash: 0x10n,
  actionUsage: {},
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

const makeSuspendedFrame = (
  overrides: Partial<DecisionStackFrame['effectFrame']['suspendedFrame']> = {},
): DecisionStackFrame => ({
  frameId: asDecisionFrameId(0),
  parentFrameId: null,
  turnId: asTurnId(1),
  context: {
    kind: 'chooseOne',
    seatId: asSeatId('0'),
    decisionKey: '$choice' as DecisionKey,
    options: [],
  },
  effectFrame: {
    programCounter: 1,
    boundedIterationCursors: {},
    localBindings: {},
    pendingTriggerQueue: [],
    suspendedFrame: {
      state: makeBaseState({ stateHash: 0x20n, _runningHash: 0x20n }),
      rng: { state: { algorithm: 'pcg-dxsm-128', version: 1, state: [0xabcn, 0xdefn] } },
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
      ...overrides,
    },
  },
});

const roundTripViaJson = (state: GameState): GameState => {
  const parsed = SerializedGameStateSchema.parse(JSON.parse(JSON.stringify(serializeGameState(state)))) as SerializedGameState;
  return deserializeGameState(parsed);
};

describe('suspended-frame serialization', () => {
  it('round-trips a synthetic suspended frame through structured JSON', () => {
    const state = makeBaseState({
      decisionStack: [makeSuspendedFrame()],
      nextFrameId: asDecisionFrameId(1),
      nextTurnId: asTurnId(2),
    });

    assert.deepEqual(roundTripViaJson(state), state);
  });

  it('serializes the wrapped suspended-frame RNG words as hex and restores them', () => {
    const state = makeBaseState({
      decisionStack: [makeSuspendedFrame()],
      nextFrameId: asDecisionFrameId(1),
      nextTurnId: asTurnId(2),
    });
    const serialized = serializeGameState(state);
    const suspendedFrame = serialized.decisionStack?.[0]?.effectFrame.suspendedFrame;

    assert.ok(suspendedFrame);
    assert.deepEqual(suspendedFrame.rng.state.state, ['0xabc', '0xdef']);
    assert.deepEqual(roundTripViaJson(state), state);
  });

  it('locks in that BigInt-valued suspended-frame bindings are not silently converted', () => {
    const state = makeBaseState({
      decisionStack: [makeSuspendedFrame({ bindings: { foo: 0xabcn } })],
      nextFrameId: asDecisionFrameId(1),
      nextTurnId: asTurnId(2),
    });

    assert.throws(
      () => JSON.stringify(serializeGameState(state)),
      /Do not know how to serialize a BigInt/,
    );
  });
});
