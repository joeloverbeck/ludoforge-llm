// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPhaseId, asPlayerId, asSeatId, asTurnId } from '../../../src/kernel/index.js';
import { computeDeltas, reconstructPerPlayerVarTrajectory } from '../../../src/sim/index.js';
import type { CompoundTurnSummary, GameState, DecisionLog, StateDelta, VariableValue } from '../../../src/kernel/index.js';

type PerPlayerVars = Readonly<Record<number, Readonly<Record<string, VariableValue>>>>;

const makeState = (perPlayerVars: PerPlayerVars, overrides: Partial<GameState> = {}): GameState => ({
  globalVars: { round: 1 },
  perPlayerVars,
  zoneVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [11n, 22n] },
  stateHash: 123n,
  _runningHash: 123n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
  ...overrides,
});

const makeMoveLog = (index: number, player: number, deltas: readonly StateDelta[]): DecisionLog => ({
  stateHash: BigInt(index + 1),
  seatId: asSeatId(String(player)),
  playerId: asPlayerId(player),
  decisionContextKind: 'actionSelection',
  decisionKey: null,
  decision: {
    kind: 'actionSelection',
    actionId: asActionId(`action-${index}`),
    move: {
      actionId: asActionId(`action-${index}`),
      params: {},
    },
  },
  turnId: asTurnId(index + 1),
  turnRetired: true,
  legalActionCount: 1,
  deltas,
  triggerFirings: [],
  warnings: [],
});

const makeCompoundTurns = (decisions: readonly DecisionLog[]): readonly CompoundTurnSummary[] =>
  decisions.map((decision, index) => ({
    turnId: decision.turnId,
    seatId: decision.seatId,
    decisionIndexRange: { start: index, end: index + 1 },
    microturnCount: 1,
    turnStopReason: index === decisions.length - 1 ? 'terminal' : 'retired',
  }));

describe('reconstructPerPlayerVarTrajectory', () => {
  it('reconstructs the initial snapshot and replays forward across multiple players and variables', () => {
    const snapshots: readonly PerPlayerVars[] = [
      {
        '0': { coins: 3, shield: true },
        '1': { coins: 1 },
      },
      {
        '0': { coins: 5, shield: true },
        '1': { coins: 1, bonus: 2 },
      },
      {
        '0': { coins: 5 },
        '1': { coins: 4, bonus: 2 },
      },
      {
        '0': { coins: 2, status: false },
        '1': { coins: 4 },
      },
    ];
    const finalSnapshot = snapshots[snapshots.length - 1];
    assert.ok(finalSnapshot !== undefined);

    const moves = snapshots.slice(0, -1).map((snapshot, index) =>
      makeMoveLog(
        index,
        index % 2,
        computeDeltas(makeState(snapshot), makeState(snapshots[index + 1] ?? finalSnapshot)),
      ),
    );

    const trajectory = reconstructPerPlayerVarTrajectory(finalSnapshot, moves, makeCompoundTurns(moves));

    assert.deepEqual(trajectory, snapshots);
  });

  it('ignores deltas that do not target per-player variables', () => {
    const initial: PerPlayerVars = {
      '0': { coins: 1 },
      '1': { coins: 2 },
    };
    const final: PerPlayerVars = {
      '0': { coins: 3 },
      '1': { coins: 2 },
    };

    const move = makeMoveLog(0, 0, [
      { path: 'globalVars.round', before: 1, after: 2 },
      { path: 'zones.market', before: [], after: ['t1'] },
      { path: 'perPlayerVars.0.coins', before: 1, after: 3 },
    ]);

    const trajectory = reconstructPerPlayerVarTrajectory(final, [move], makeCompoundTurns([move]));

    assert.deepEqual(trajectory, [initial, final]);
  });

  it('returns a single unchanged snapshot for empty moves', () => {
    const finalPerPlayerVars: PerPlayerVars = {
      '0': { coins: 7 },
      '1': { coins: 4, shield: false },
    };

    const trajectory = reconstructPerPlayerVarTrajectory(finalPerPlayerVars, [], []);

    assert.deepEqual(trajectory, [finalPerPlayerVars]);
  });

  it('creates fresh snapshot objects without aliasing the input final state', () => {
    const snapshots: readonly PerPlayerVars[] = [
      {
        '0': { coins: 2 },
        '1': { coins: 1 },
      },
      {
        '0': { coins: 5 },
        '1': { coins: 1 },
      },
    ];
    const initialSnapshot = snapshots[0];
    const finalPerPlayerVars = snapshots[1];
    assert.ok(initialSnapshot !== undefined);
    assert.ok(finalPerPlayerVars !== undefined);
    const moves = [
      makeMoveLog(0, 0, computeDeltas(makeState(initialSnapshot), makeState(finalPerPlayerVars))),
    ];

    const trajectory = reconstructPerPlayerVarTrajectory(finalPerPlayerVars, moves, makeCompoundTurns(moves)) as Array<
      Record<number, Record<string, VariableValue>>
    >;
    const firstSnapshot = trajectory[0];
    const secondSnapshot = trajectory[1];
    assert.ok(firstSnapshot !== undefined);
    assert.ok(secondSnapshot !== undefined);
    assert.ok(firstSnapshot[0] !== undefined);
    assert.ok(secondSnapshot[0] !== undefined);
    assert.ok(finalPerPlayerVars[0] !== undefined);

    assert.notStrictEqual(firstSnapshot, secondSnapshot);
    assert.notStrictEqual(secondSnapshot, finalPerPlayerVars);
    assert.notStrictEqual(firstSnapshot[0], secondSnapshot[0]);
    assert.notStrictEqual(secondSnapshot[0], finalPerPlayerVars[0]);

    firstSnapshot[0].coins = 999;
    assert.equal(secondSnapshot[0].coins, 5);
    assert.equal(finalPerPlayerVars[0].coins, 5);
  });
});
