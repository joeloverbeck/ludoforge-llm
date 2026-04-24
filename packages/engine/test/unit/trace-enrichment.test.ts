// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { enrichTrace } from '../../src/sim/trace-enrichment.js';
import { asActionId, asPlayerId, asSeatId } from '../../src/kernel/branded.js';
import { asDecisionFrameId, asTurnId } from '../../src/kernel/index.js';
import type { GameTrace, GameDef } from '../../src/kernel/types.js';
import type { MicroturnSnapshot } from '../../src/sim/snapshot-types.js';

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
  decisions: playerIndices.map((player) => ({
    stateHash: 0n,
    seatId: asSeatId(String(player)),
    playerId: asPlayerId(player),
    decisionContextKind: 'actionSelection',
    decisionKey: null,
    decision: { kind: 'actionSelection', actionId: asActionId('pass'), move: { actionId: asActionId('pass'), params: {} } },
    turnId: asTurnId(player + 1),
    turnRetired: true,
    legalActionCount: 1,
    deltas: [],
    triggerFirings: [],
    warnings: [],
  })),
  probeHoleRecoveries: [],
  recoveredFromProbeHole: 0,
  compoundTurns: playerIndices.map((player, index) => ({
    turnId: asTurnId(player + 1),
    seatId: asSeatId(String(player)),
    decisionIndexRange: { start: index, end: index + 1 },
    microturnCount: 1,
    turnStopReason: index === playerIndices.length - 1 ? 'maxTurns' : 'retired',
  })),
  finalState: {} as GameTrace['finalState'],
  result: null,
  turnsCount: playerIndices.length,
  stopReason: 'maxTurns',
  traceProtocolVersion: 'spec-140',
});

const makeSnapshot = (): MicroturnSnapshot => ({
  turnCount: 3,
  phaseId: 'main' as MicroturnSnapshot['phaseId'],
  activePlayer: asPlayerId(0),
  seatStandings: [{ seat: 'VC', margin: 2 }],
  decisionContextKind: 'actionSelection',
  frameId: asDecisionFrameId(1),
  turnId: asTurnId(1),
  compoundTurnTrace: [],
});

describe('enrichTrace', () => {
  it('preserves explicit seat ids on the trace while surfacing def seat names', () => {
    const def = makeMockDef(['VC', 'NVA', 'US', 'ARVN']);
    const trace = makeMockTrace([0, 1, 2, 3]);
    const enriched = enrichTrace(trace, def);

    assert.deepEqual(enriched.seatNames, ['VC', 'NVA', 'US', 'ARVN']);
    assert.equal(enriched.decisions[0]!.seatId, '0');
    assert.equal(enriched.decisions[1]!.seatId, '1');
    assert.equal(enriched.decisions[2]!.seatId, '2');
    assert.equal(enriched.decisions[3]!.seatId, '3');
  });

  it('does not rewrite unknown seat ids during enrichment', () => {
    const def = makeMockDef(['A', 'B']);
    const trace = makeMockTrace([0, 1, 5]);
    const enriched = enrichTrace(trace, def);

    assert.equal(enriched.decisions[2]!.seatId, '5');
  });

  it('handles games with no seats defined', () => {
    const def = makeMockDef([]);
    (def as { seats?: unknown }).seats = undefined;
    const trace = makeMockTrace([0]);
    const enriched = enrichTrace(trace, def);

    assert.deepEqual(enriched.seatNames, []);
    assert.equal(enriched.decisions[0]!.seatId, '0');
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

  it('preserves snapshot payloads when enriching trace decisions', () => {
    const def = makeMockDef(['VC']);
    const snapshot = makeSnapshot();
    const trace = makeMockTrace([0]);
    const traceWithSnapshot: GameTrace = {
      ...trace,
      decisions: trace.decisions.map((move) => ({
        ...move,
        snapshot,
      })),
    };

    const enriched = enrichTrace(traceWithSnapshot, def);

    assert.equal(enriched.decisions[0]?.snapshot, snapshot);
    assert.deepEqual(enriched.decisions[0]?.snapshot?.seatStandings, [{ seat: 'VC', margin: 2 }]);
  });
});
