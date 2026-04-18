// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { enrichTrace } from '../../src/sim/trace-enrichment.js';
import { asPlayerId } from '../../src/kernel/branded.js';
import type { GameTrace, GameDef } from '../../src/kernel/types.js';
import type { DecisionPointSnapshot } from '../../src/sim/snapshot-types.js';

const makeMockDef = (seatIds: readonly string[]): GameDef => ({
  metadata: { id: 'test-game', name: 'Test', version: '1.0' },
  seats: seatIds.map((id) => ({ id })),
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  actions: [],
  triggers: [],
  phases: [],
  setup: [],
  playerCount: seatIds.length,
}) as unknown as GameDef;

const makeMockTrace = (playerIndices: readonly number[]): GameTrace => ({
  gameDefId: 'test-game',
  seed: 42,
  moves: playerIndices.map((player) => ({
    stateHash: 0n,
    _runningHash: 0n,
    player: asPlayerId(player),
    move: { actionId: 'pass' as unknown as GameTrace['moves'][0]['move']['actionId'], params: {} },
    legalMoveCount: 1,
    deltas: [],
    triggerFirings: [],
    warnings: [],
  })),
  finalState: {} as GameTrace['finalState'],
  result: null,
  turnsCount: playerIndices.length,
  stopReason: 'maxTurns',
});

const makeSnapshot = (): DecisionPointSnapshot => ({
  turnCount: 3,
  phaseId: 'main' as DecisionPointSnapshot['phaseId'],
  activePlayer: asPlayerId(0),
  seatStandings: [{ seat: 'VC', margin: 2 }],
});

describe('enrichTrace', () => {
  it('maps player indices to seat IDs', () => {
    const def = makeMockDef(['VC', 'NVA', 'US', 'ARVN']);
    const trace = makeMockTrace([0, 1, 2, 3]);
    const enriched = enrichTrace(trace, def);

    assert.deepEqual(enriched.seatNames, ['VC', 'NVA', 'US', 'ARVN']);
    assert.equal(enriched.moves[0]!.seatId, 'VC');
    assert.equal(enriched.moves[1]!.seatId, 'NVA');
    assert.equal(enriched.moves[2]!.seatId, 'US');
    assert.equal(enriched.moves[3]!.seatId, 'ARVN');
  });

  it('falls back to "Player N" when seat index is out of range', () => {
    const def = makeMockDef(['A', 'B']);
    const trace = makeMockTrace([0, 1, 5]);
    const enriched = enrichTrace(trace, def);

    assert.equal(enriched.moves[2]!.seatId, 'Player 5');
  });

  it('handles games with no seats defined', () => {
    const def = makeMockDef([]);
    (def as { seats?: unknown }).seats = undefined;
    const trace = makeMockTrace([0]);
    const enriched = enrichTrace(trace, def);

    assert.deepEqual(enriched.seatNames, []);
    assert.equal(enriched.moves[0]!.seatId, 'Player 0');
  });

  it('preserves all original trace fields', () => {
    const def = makeMockDef(['X']);
    const trace = makeMockTrace([0]);
    const enriched = enrichTrace(trace, def);

    assert.equal(enriched.gameDefId, 'test-game');
    assert.equal(enriched.seed, 42);
    assert.equal(enriched.stopReason, 'maxTurns');
    assert.equal(enriched.result, null);
  });

  it('preserves snapshot payloads when enriching trace moves', () => {
    const def = makeMockDef(['VC']);
    const snapshot = makeSnapshot();
    const trace = makeMockTrace([0]);
    const traceWithSnapshot: GameTrace = {
      ...trace,
      moves: trace.moves.map((move) => ({
        ...move,
        snapshot,
      })),
    };

    const enriched = enrichTrace(traceWithSnapshot, def);

    assert.equal(enriched.moves[0]?.snapshot, snapshot);
    assert.deepEqual(enriched.moves[0]?.snapshot?.seatStandings, [{ seat: 'VC', margin: 2 }]);
  });
});
