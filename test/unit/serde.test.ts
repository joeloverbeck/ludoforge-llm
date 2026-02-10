import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPhaseId, asPlayerId, deserializeGameState, deserializeTrace, serializeGameState, serializeTrace } from '../../src/kernel/index.js';
import type { GameState, GameTrace, SerializedGameState, SerializedGameTrace } from '../../src/kernel/index.js';

const gameStateFixture: GameState = {
  globalVars: { round: 1 },
  perPlayerVars: { '0': { vp: 3 } },
  playerCount: 2,
  zones: {},
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 4,
  rng: { state: [0n, 0x2aabn] },
  stateHash: 0x00abcdn,
  actionUsage: { playCard: { turnCount: 1, phaseCount: 1, gameCount: 2 } },
};

const traceFixture: GameTrace = {
  gameDefId: 'demo',
  seed: 7,
  moves: [
    {
      stateHash: 0x0001n,
      player: asPlayerId(0),
      move: {
        actionId: asActionId('playCard'),
        params: { amount: 1 },
      },
      legalMoveCount: 3,
      deltas: [{ path: 'globalVars.round', before: 0, after: 1 }],
      triggerFirings: [],
    },
    {
      stateHash: 0x00ff00n,
      player: asPlayerId(1),
      move: {
        actionId: asActionId('pass'),
        params: {},
      },
      legalMoveCount: 2,
      deltas: [],
      triggerFirings: [],
    },
  ],
  finalState: gameStateFixture,
  result: { type: 'draw' },
  turnsCount: 2,
};

describe('kernel bigint serialization codecs', () => {
  it('serializeGameState converts stateHash and RNG words to lowercase hex', () => {
    const serialized = serializeGameState(gameStateFixture);

    assert.deepEqual(serialized.rng.state, ['0x0', '0x2aab']);
    assert.equal(serialized.stateHash, '0xabcd');
    assert.equal(typeof serialized.stateHash, 'string');
  });

  it('deserializeGameState reconstructs exact bigint values', () => {
    const serializedState: SerializedGameState = {
      ...gameStateFixture,
      rng: { state: ['0x0', '0x2aab'] },
      stateHash: '0xabcd',
    };

    const deserialized = deserializeGameState(serializedState);

    assert.deepEqual(deserialized.rng.state, [0n, 0x2aabn]);
    assert.equal(deserialized.stateHash, 0xabcdn);
  });

  it('deserializeTrace(serializeTrace(trace)) preserves all hashes exactly', () => {
    const serialized = serializeTrace(traceFixture);
    const deserialized = deserializeTrace(serialized);

    assert.deepEqual(
      deserialized.moves.map((move) => move.stateHash),
      traceFixture.moves.map((move) => move.stateHash),
    );
    assert.equal(deserialized.finalState.stateHash, traceFixture.finalState.stateHash);
    assert.deepEqual(deserialized.finalState.rng.state, traceFixture.finalState.rng.state);
  });

  it('rejects invalid hex values with deterministic error text', () => {
    const serializedTrace = serializeTrace(traceFixture);
    const firstMove = serializedTrace.moves.at(0);
    assert.ok(firstMove);

    const invalidSerializedTrace: SerializedGameTrace = {
      ...serializedTrace,
      moves: [
        {
          ...firstMove,
          stateHash: '0xFF',
        },
      ],
    };

    assert.throws(
      () => deserializeTrace(invalidSerializedTrace),
      /Invalid hex bigint at moves\[0\]\.stateHash: 0xFF/,
    );
  });
});
