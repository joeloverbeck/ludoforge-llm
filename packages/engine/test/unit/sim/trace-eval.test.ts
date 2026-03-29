import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DegeneracyFlag, asActionId, asPhaseId, asPlayerId } from '../../../src/kernel/index.js';
import { evaluateTrace } from '../../../src/sim/index.js';
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
  moves: readonly MoveLog[],
  finalPerPlayerVars: PerPlayerVars,
  overrides: Partial<GameTrace> = {},
): GameTrace => ({
  gameDefId: 'test-game',
  seed: 7,
  moves,
  finalState: makeState(finalPerPlayerVars, { turnCount: moves.length }),
  result: null,
  turnsCount: moves.length,
  stopReason: 'terminal',
  ...overrides,
});

describe('evaluateTrace', () => {
  it('computes per-trace metrics from move counts, deltas, and reconstructed trajectories', () => {
    const moves = [
      makeMoveLog(0, 0, 'gather', 2, [
        { path: 'perPlayerVars.0.score', before: 0, after: 1 },
        { path: 'perPlayerVars.0.gold', before: 0, after: 2 },
        { path: 'perPlayerVars.1.gold', before: 0, after: 1 },
      ]),
      makeMoveLog(1, 1, 'attack', 4, [
        { path: 'perPlayerVars.1.score', before: 0, after: 2 },
        { path: 'perPlayerVars.0.gold', before: 2, after: 1 },
      ]),
      makeMoveLog(2, 0, 'trade', 6, [
        { path: 'perPlayerVars.0.score', before: 1, after: 3 },
        { path: 'perPlayerVars.1.score', before: 2, after: 1 },
        { path: 'perPlayerVars.0.gold', before: 1, after: 4 },
        { path: 'perPlayerVars.1.gold', before: 1, after: 2 },
      ]),
    ] as const;
    const trace = makeTrace(moves, {
      '0': { score: 3, gold: 4 },
      '1': { score: 1, gold: 2 },
    });

    const evaluation = evaluateTrace(trace, { scoringVar: 'score' });

    assert.equal(evaluation.turnCount, 3);
    assert.equal(evaluation.metrics.gameLength, 3);
    assert.equal(evaluation.metrics.avgBranchingFactor, 4);
    assert.ok(Math.abs(evaluation.metrics.actionDiversity - 1) < 1e-12);
    assert.ok(Math.abs(evaluation.metrics.resourceTension - (11 / 24)) < 1e-12);
    assert.ok(Math.abs(evaluation.metrics.interactionProxy - (4 / 9)) < 1e-12);
    assert.ok(Math.abs(evaluation.metrics.dominantActionFreq - (1 / 3)) < 1e-12);
    assert.ok(Math.abs(evaluation.metrics.dramaMeasure - (2 / 3)) < 1e-12);
    assert.deepEqual(evaluation.degeneracyFlags, []);
  });

  it('returns zeroed metrics for empty traces', () => {
    const trace = makeTrace([], {
      '0': { score: 0 },
      '1': { score: 0 },
    }, {
      turnsCount: 0,
      finalState: makeState({
        '0': { score: 0 },
        '1': { score: 0 },
      }, { turnCount: 0 }),
    });

    const evaluation = evaluateTrace(trace, { scoringVar: 'score' });

    assert.deepEqual(evaluation.metrics, {
      gameLength: 0,
      avgBranchingFactor: 0,
      actionDiversity: 0,
      resourceTension: 0,
      interactionProxy: 0,
      dominantActionFreq: 0,
      dramaMeasure: 0,
    });
    assert.deepEqual(evaluation.degeneracyFlags, []);
  });

  it('returns zero action diversity when one action is used exclusively', () => {
    const trace = makeTrace(
      [
        makeMoveLog(0, 0, 'wait', 2),
        makeMoveLog(1, 1, 'wait', 2),
        makeMoveLog(2, 0, 'wait', 2),
      ],
      {
        '0': {},
        '1': {},
      },
    );

    const evaluation = evaluateTrace(trace, { dominantActionThreshold: 0.7, trivialWinThreshold: 5 });

    assert.equal(evaluation.metrics.actionDiversity, 0);
    assert.equal(evaluation.metrics.dominantActionFreq, 1);
  });

  it('skips moves without per-player deltas when computing interactionProxy', () => {
    const trace = makeTrace(
      [
        makeMoveLog(0, 0, 'solo', 1, [{ path: 'globalVars.round', before: 1, after: 2 }]),
        makeMoveLog(1, 0, 'poke', 1, [
          { path: 'perPlayerVars.1.hp', before: 3, after: 2 },
          { path: 'perPlayerVars.0.hp', before: 3, after: 2 },
        ]),
      ],
      {
        '0': { hp: 2 },
        '1': { hp: 2 },
      },
    );

    const evaluation = evaluateTrace(trace);

    assert.equal(evaluation.metrics.interactionProxy, 0.5);
  });

  it('ignores boolean per-player variables for resource tension and drama', () => {
    const trace = makeTrace(
      [
        makeMoveLog(0, 0, 'toggle', 1, [
          { path: 'perPlayerVars.0.ready', before: false, after: true },
          { path: 'perPlayerVars.1.ready', before: false, after: true },
        ]),
      ],
      {
        '0': { ready: true },
        '1': { ready: true },
      },
    );

    const evaluation = evaluateTrace(trace, { scoringVar: 'ready' });

    assert.equal(evaluation.metrics.resourceTension, 0);
    assert.equal(evaluation.metrics.dramaMeasure, 0);
  });

  it('does not treat tied leaders as separate drama churn', () => {
    const trace = makeTrace(
      [
        makeMoveLog(0, 0, 'score-a', 1, [{ path: 'perPlayerVars.0.score', before: 0, after: 2 }]),
        makeMoveLog(1, 1, 'tie', 1, [{ path: 'perPlayerVars.1.score', before: 0, after: 2 }]),
        makeMoveLog(2, 1, 'lead-b', 1, [{ path: 'perPlayerVars.1.score', before: 2, after: 3 }]),
      ],
      {
        '0': { score: 2 },
        '1': { score: 3 },
      },
    );

    const evaluation = evaluateTrace(trace, { scoringVar: 'score' });

    assert.equal(evaluation.metrics.dramaMeasure, 1 / 3);
  });

  it('does not mutate the input trace or config', () => {
    const moves = [
      makeMoveLog(0, 0, 'gain', 2, [{ path: 'perPlayerVars.0.score', before: 0, after: 1 }]),
    ] as const;
    const trace = makeTrace(moves, {
      '0': { score: 1 },
      '1': { score: 0 },
    });
    const config = { scoringVar: 'score' } as const;

    evaluateTrace(trace, config);

    assert.deepEqual(trace, makeTrace(moves, {
      '0': { score: 1 },
      '1': { score: 0 },
    }));
    assert.deepEqual(config, { scoringVar: 'score' });
  });

  it('keeps bounded metrics finite and within range', () => {
    const trace = makeTrace(
      [
        makeMoveLog(0, 0, 'a', 2, [{ path: 'perPlayerVars.0.score', before: 0, after: 1 }]),
        makeMoveLog(1, 1, 'b', 3, [{ path: 'perPlayerVars.0.score', before: 1, after: 2 }]),
        makeMoveLog(2, 0, 'a', 4, [{ path: 'perPlayerVars.1.score', before: 0, after: 1 }]),
      ],
      {
        '0': { score: 2 },
        '1': { score: 1 },
      },
    );

    const evaluation = evaluateTrace(trace, { scoringVar: 'score' });
    const boundedMetrics = [
      evaluation.metrics.actionDiversity,
      evaluation.metrics.interactionProxy,
      evaluation.metrics.dominantActionFreq,
    ];
    const allMetrics = Object.values(evaluation.metrics);

    for (const metric of boundedMetrics) {
      assert.equal(Number.isFinite(metric), true);
      assert.equal(metric >= 0, true);
      assert.equal(metric <= 1, true);
    }

    for (const metric of allMetrics) {
      assert.equal(Number.isFinite(metric), true);
    }
  });

  it('detects repeated post-move state hashes as LOOP_DETECTED', () => {
    const trace = makeTrace(
      [
        makeMoveLog(0, 0, 'a', 1, [], { stateHash: 101n }),
        makeMoveLog(1, 1, 'b', 1, [], { stateHash: 202n }),
        makeMoveLog(2, 0, 'c', 1, [], { stateHash: 101n }),
      ],
      {
        '0': {},
        '1': {},
      },
    );

    const evaluation = evaluateTrace(trace);

    assert.deepEqual(evaluation.degeneracyFlags, [DegeneracyFlag.LOOP_DETECTED]);
  });

  it('detects no-legal-moves, trivial wins, and dominant action independently', () => {
    const trace = makeTrace(
      [
        makeMoveLog(0, 0, 'rush', 2),
        makeMoveLog(1, 1, 'rush', 2),
        makeMoveLog(2, 0, 'rush', 1),
        makeMoveLog(3, 1, 'wait', 1),
      ],
      {
        '0': { score: 3 },
        '1': { score: 1 },
      },
      {
        result: { type: 'win', player: asPlayerId(0) },
        stopReason: 'noLegalMoves',
      },
    );

    const evaluation = evaluateTrace(trace, {
      dominantActionThreshold: 0.7,
      trivialWinThreshold: 5,
    });

    assert.deepEqual(evaluation.degeneracyFlags, [
      DegeneracyFlag.NO_LEGAL_MOVES,
      DegeneracyFlag.DOMINANT_ACTION,
      DegeneracyFlag.TRIVIAL_WIN,
    ]);
  });

  it('detects stalls only when the consecutive hash run reaches the configured threshold', () => {
    const trace = makeTrace(
      [
        makeMoveLog(0, 0, 'a', 1, [], { stateHash: 9n }),
        makeMoveLog(1, 1, 'b', 1, [], { stateHash: 9n }),
        makeMoveLog(2, 0, 'c', 1, [], { stateHash: 9n }),
        makeMoveLog(3, 1, 'd', 1, [], { stateHash: 8n }),
      ],
      {
        '0': {},
        '1': {},
      },
    );

    assert.deepEqual(evaluateTrace(trace, { stallTurnThreshold: 3 }).degeneracyFlags, [
      DegeneracyFlag.LOOP_DETECTED,
      DegeneracyFlag.STALL,
    ]);
    assert.deepEqual(evaluateTrace(trace, { stallTurnThreshold: 4 }).degeneracyFlags, [
      DegeneracyFlag.LOOP_DETECTED,
    ]);
  });

  it('detects truncated trigger logs as TRIGGER_DEPTH_EXCEEDED', () => {
    const trace = makeTrace(
      [
        makeMoveLog(0, 0, 'safe', 1),
        makeMoveLog(1, 1, 'chain', 1, [], {
          triggerFirings: [
            {
              kind: 'truncated',
              event: { type: 'turnStart' },
              depth: 5,
            },
          ],
        }),
      ],
      {
        '0': {},
        '1': {},
      },
    );

    const evaluation = evaluateTrace(trace);

    assert.deepEqual(evaluation.degeneracyFlags, [DegeneracyFlag.TRIGGER_DEPTH_EXCEEDED]);
  });

  it('treats threshold equality as healthy for dominant action and trivial win', () => {
    const trace = makeTrace(
      [
        makeMoveLog(0, 0, 'wait', 1),
        makeMoveLog(1, 1, 'wait', 1),
        makeMoveLog(2, 0, 'other', 1),
        makeMoveLog(3, 1, 'other', 1),
      ],
      {
        '0': {},
        '1': {},
      },
      {
        result: { type: 'win', player: asPlayerId(1) },
      },
    );

    const evaluation = evaluateTrace(trace, {
      dominantActionThreshold: 0.5,
      trivialWinThreshold: 4,
    });

    assert.deepEqual(evaluation.degeneracyFlags, []);
  });
});
