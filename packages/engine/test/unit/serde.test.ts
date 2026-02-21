import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec } from '../../src/cnl/index.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  deserializeGameState,
  deserializeTrace,
  initialState,
  serializeGameState,
  serializeTrace,
} from '../../src/kernel/index.js';
import type { GameState, GameTrace, SerializedGameState, SerializedGameTrace } from '../../src/kernel/index.js';

const readJsonFixture = <T>(filePath: string): T => JSON.parse(readFileSync(join(process.cwd(), filePath), 'utf8')) as T;

const gameStateFixture: GameState = {
  globalVars: { round: 1 },
  perPlayerVars: { '0': { vp: 3 } },
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 12,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 4,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 0x2aabn] },
  stateHash: 0x00abcdn,
  actionUsage: { playCard: { turnCount: 1, phaseCount: 1, gameCount: 2 } },
  turnOrderState: { type: 'roundRobin' },
  markers: {},
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
      warnings: [],
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
      triggerFirings: [
        {
          kind: 'turnFlowLifecycle',
          step: 'promoteLookaheadToPlayed',
          slots: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          before: { playedCardId: 'card-1', lookaheadCardId: 'card-2', leaderCardId: null },
          after: { playedCardId: 'card-2', lookaheadCardId: 'card-3', leaderCardId: null },
        },
      ],
      warnings: [],
    },
  ],
  finalState: gameStateFixture,
  result: { type: 'draw' },
  turnsCount: 2,
  stopReason: 'terminal',
};

describe('kernel bigint serialization codecs', () => {
  it('serializeGameState converts stateHash and RNG words to lowercase hex', () => {
    const serialized = serializeGameState(gameStateFixture);

    assert.deepEqual(serialized.rng.state, ['0x0', '0x2aab']);
    assert.equal(serialized.rng.algorithm, 'pcg-dxsm-128');
    assert.equal(serialized.rng.version, 1);
    assert.equal(serialized.stateHash, '0xabcd');
    assert.equal(typeof serialized.stateHash, 'string');
    assert.equal(serialized.nextTokenOrdinal, gameStateFixture.nextTokenOrdinal);
  });

  it('deserializeGameState reconstructs exact bigint values', () => {
    const serializedState: SerializedGameState = {
      ...gameStateFixture,
      rng: { algorithm: 'pcg-dxsm-128', version: 1, state: ['0x0', '0x2aab'] },
      stateHash: '0xabcd',
    };

    const deserialized = deserializeGameState(serializedState);

    assert.deepEqual(deserialized.rng.state, [0n, 0x2aabn]);
    assert.equal(deserialized.rng.algorithm, 'pcg-dxsm-128');
    assert.equal(deserialized.rng.version, 1);
    assert.equal(deserialized.stateHash, 0xabcdn);
    assert.equal(deserialized.nextTokenOrdinal, gameStateFixture.nextTokenOrdinal);
  });

  it('round-trips FITL-shaped initial state compiled from embedded dataAssets', () => {
    const markdown = readFileSync(
      join(process.cwd(), 'test', 'fixtures', 'cnl', 'compiler', 'fitl-foundation-inline-assets.md'),
      'utf8',
    );
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assertNoErrors(parsed);
    assertNoDiagnostics(compiled);
    assert.notEqual(compiled.gameDef, null);

    const expectedState = initialState(compiled.gameDef!, 17, 2).state;
    const fitlInitialState = deserializeGameState(serializeGameState(expectedState));

    assert.deepEqual(fitlInitialState, expectedState);
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
    assert.equal(deserialized.finalState.nextTokenOrdinal, traceFixture.finalState.nextTokenOrdinal);
    assert.equal(deserialized.stopReason, traceFixture.stopReason);
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

  it('simulator golden fixture round-trips through deserializeTrace/serializeTrace exactly', () => {
    const fixture = readJsonFixture<SerializedGameTrace>('test/fixtures/trace/simulator-golden-trace.json');

    const roundTripped = serializeTrace(deserializeTrace(fixture));
    assert.deepEqual(roundTripped, fixture);
  });
});
