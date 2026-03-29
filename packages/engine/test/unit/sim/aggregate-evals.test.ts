import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DegeneracyFlag } from '../../../src/kernel/index.js';
import { aggregateEvals } from '../../../src/sim/index.js';
import type { TraceEval } from '../../../src/kernel/index.js';

const makeTraceEval = (
  seed: number,
  overrides: Partial<TraceEval> = {},
): TraceEval => ({
  seed,
  turnCount: 4,
  stopReason: 'terminal',
  metrics: {
    gameLength: 4,
    avgBranchingFactor: 2,
    actionDiversity: 0.4,
    resourceTension: 0.2,
    interactionProxy: 0.3,
    dominantActionFreq: 0.6,
    dramaMeasure: 0.1,
  },
  degeneracyFlags: [],
  ...overrides,
});

describe('aggregateEvals', () => {
  it('aggregates per-trace metrics into report means', () => {
    const evals = [
      makeTraceEval(11, {
        metrics: {
          gameLength: 4,
          avgBranchingFactor: 2,
          actionDiversity: 0.3,
          resourceTension: 0.1,
          interactionProxy: 0.2,
          dominantActionFreq: 0.6,
          dramaMeasure: 0.5,
        },
      }),
      makeTraceEval(12, {
        metrics: {
          gameLength: 8,
          avgBranchingFactor: 6,
          actionDiversity: 0.7,
          resourceTension: 0.5,
          interactionProxy: 0.4,
          dominantActionFreq: 0.2,
          dramaMeasure: 0.25,
        },
      }),
    ] as const;

    const report = aggregateEvals('agg-game', evals);

    assert.equal(report.gameDefId, 'agg-game');
    assert.equal(report.runCount, 2);
    assert.equal(report.metrics.avgGameLength, 6);
    assert.equal(report.metrics.avgBranchingFactor, 4);
    assert.equal(report.metrics.actionDiversity, 0.5);
    assert.equal(report.metrics.resourceTension, 0.3);
    assert.ok(Math.abs(report.metrics.interactionProxy - 0.3) < 1e-12);
    assert.equal(report.metrics.dominantActionFreq, 0.4);
    assert.equal(report.metrics.dramaMeasure, 0.375);
    assert.equal(report.perSeed, evals);
  });

  it('deduplicates degeneracy flags in stable first-seen order', () => {
    const evals = [
      makeTraceEval(1, {
        degeneracyFlags: [DegeneracyFlag.STALL, DegeneracyFlag.NO_LEGAL_MOVES],
      }),
      makeTraceEval(2, {
        degeneracyFlags: [DegeneracyFlag.NO_LEGAL_MOVES, DegeneracyFlag.DOMINANT_ACTION],
      }),
      makeTraceEval(3, {
        degeneracyFlags: [DegeneracyFlag.STALL, DegeneracyFlag.TRIVIAL_WIN],
      }),
    ] as const;

    const report = aggregateEvals('agg-game', evals);

    assert.deepEqual(report.degeneracyFlags, [
      DegeneracyFlag.STALL,
      DegeneracyFlag.NO_LEGAL_MOVES,
      DegeneracyFlag.DOMINANT_ACTION,
      DegeneracyFlag.TRIVIAL_WIN,
    ]);
  });

  it('returns zeroed metrics and empty collections for empty input', () => {
    const report = aggregateEvals('empty-game', []);

    assert.deepEqual(report, {
      gameDefId: 'empty-game',
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

  it('passes through a single evaluation without mutating inputs', () => {
    const evaluation = makeTraceEval(9, {
      metrics: {
        gameLength: 3,
        avgBranchingFactor: 5,
        actionDiversity: 0.75,
        resourceTension: 0.125,
        interactionProxy: 0.625,
        dominantActionFreq: 0.5,
        dramaMeasure: 1 / 3,
      },
      degeneracyFlags: [DegeneracyFlag.LOOP_DETECTED],
    });
    const input = [evaluation] as const;

    const report = aggregateEvals('single-game', input);

    assert.deepEqual(report.metrics, {
      avgGameLength: 3,
      avgBranchingFactor: 5,
      actionDiversity: 0.75,
      resourceTension: 0.125,
      interactionProxy: 0.625,
      dominantActionFreq: 0.5,
      dramaMeasure: 1 / 3,
    });
    assert.equal(report.perSeed, input);
    assert.deepEqual(input, [evaluation]);
  });
});
