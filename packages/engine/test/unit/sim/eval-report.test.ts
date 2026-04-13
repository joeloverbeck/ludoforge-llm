import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPhaseId, asPlayerId } from '../../../src/kernel/index.js';
import { aggregateEvals, evaluateTrace, generateEvalReport } from '../../../src/sim/index.js';
import type { GameState, GameTrace, MoveLog, StateDelta, VariableValue } from '../../../src/kernel/index.js';

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
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 10n,
  _runningHash: 10n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
  ...overrides,
});

const makeMoveLog = (
  index: number,
  player: number,
  actionId: string,
  legalMoveCount: number,
  deltas: readonly StateDelta[] = [],
  overrides: Partial<MoveLog> = {},
): MoveLog => ({
  stateHash: BigInt(index + 1),
  player: asPlayerId(player),
  move: {
    actionId: asActionId(actionId),
    params: {},
  },
  legalMoveCount,
  deltas,
  triggerFirings: [],
  warnings: [],
  ...overrides,
});

const makeTrace = (
  seed: number,
  moves: readonly MoveLog[],
  finalPerPlayerVars: PerPlayerVars,
  overrides: Partial<GameTrace> = {},
): GameTrace => ({
  gameDefId: 'trace-game-id',
  seed,
  moves,
  finalState: makeState(finalPerPlayerVars, { turnCount: moves.length }),
  result: null,
  turnsCount: moves.length,
  stopReason: 'terminal',
  ...overrides,
});

describe('generateEvalReport', () => {
  it('matches manual evaluate-plus-aggregate output', () => {
    const traces = [
      makeTrace(3, [
        makeMoveLog(0, 0, 'gather', 2, [{ path: 'perPlayerVars.0.score', before: 0, after: 1 }]),
        makeMoveLog(1, 1, 'counter', 3, [{ path: 'perPlayerVars.1.score', before: 0, after: 2 }]),
      ], {
        '0': { score: 1 },
        '1': { score: 2 },
      }),
      makeTrace(4, [
        makeMoveLog(0, 0, 'wait', 1),
        makeMoveLog(1, 0, 'wait', 1),
      ], {
        '0': { score: 0 },
        '1': { score: 0 },
      }, {
        stopReason: 'noLegalMoves',
      }),
    ] as const;
    const config = { scoringVar: 'score', dominantActionThreshold: 0.9 } as const;

    const report = generateEvalReport('definition-id', traces, config);
    const expected = aggregateEvals(
      'definition-id',
      traces.map((trace) => evaluateTrace(trace, config)),
    );

    assert.deepEqual(report, expected);
  });

  it('uses the explicit gameDefId rather than trace.gameDefId for the report id', () => {
    const traces = [
      makeTrace(9, [
        makeMoveLog(0, 0, 'solo', 1, [{ path: 'perPlayerVars.0.score', before: 0, after: 1 }]),
      ], {
        '0': { score: 1 },
        '1': { score: 0 },
      }, {
        gameDefId: 'trace-owned-id',
      }),
    ] as const;

    const report = generateEvalReport('explicit-report-id', traces, { scoringVar: 'score' });

    assert.equal(report.gameDefId, 'explicit-report-id');
  });

  it('handles empty traces as an empty aggregate report', () => {
    const report = generateEvalReport('empty-def', [], { scoringVar: 'score' });

    assert.deepEqual(report, {
      gameDefId: 'empty-def',
      runCount: 0,
      metrics: {
        avgGameLength: 0,
        avgBranchingFactor: 0,
        actionDiversity: 0,
        resourceTension: 0,
        interactionProxy: 0,
        dominantActionFreq: 0,
        dramaMeasure: 0,
      },
      degeneracyFlags: [],
      perSeed: [],
    });
  });
});
