import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DegeneracyFlag,
  assertValidatedGameDef,
  asActionId,
  asPhaseId,
  nextInt,
  type Agent,
  type ValidatedGameDef,
} from '../../../src/kernel/index.js';
import { aggregateEvals, evaluateTrace, generateEvalReport, runGame, runGames } from '../../../src/sim/index.js';
import { trustedMove } from '../../helpers/classified-move-fixtures.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const rngDrivenAgent: Agent = {
  chooseMove(input) {
    const [index, nextRng] = nextInt(input.rng, 0, input.legalMoves.length - 1);
    const move = input.legalMoves[index]?.move;
    if (move === undefined) {
      throw new Error('rngDrivenAgent requires at least one legal move');
    }
    return { move: trustedMove(move, input.state.stateHash), rng: nextRng };
  },
};

const createEvaluatedDef = (): ValidatedGameDef =>
  assertValidatedGameDef({
    metadata: { id: 'eval-full-integration', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 99 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }, { id: asPhaseId('cleanup') }] },
    actions: [
      {
        id: asActionId('smallStep'),
        actor: 'active',
        executor: 'actor' as const,
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
        limits: [],
      },
      {
        id: asActionId('bigStep'),
        actor: 'active',
        executor: 'actor' as const,
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [eff({ addVar: { scope: 'global', var: 'score', delta: 2 } })],
        limits: [],
      },
      {
        id: asActionId('endTurn'),
        actor: 'active',
        executor: 'actor' as const,
        phase: [asPhaseId('cleanup')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [
        {
          when: { op: '>=', left: { _t: 2 as const, ref: 'gvar', var: 'score' }, right: 10 },
          result: { type: 'draw' },
        },
      ],
    },
  } as const);

const createNoLegalMovesDef = (): ValidatedGameDef =>
  assertValidatedGameDef({
    metadata: { id: 'eval-degenerate-no-legal-moves', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  } as const);

describe('evaluator integration', () => {
  it('runs simulator traces through evaluateTrace and aggregateEvals end-to-end', () => {
    const def = createEvaluatedDef();
    const seeds = [31, 7, 19, 23, 29];

    const traces = runGames(def, seeds, [rngDrivenAgent, rngDrivenAgent], 12);
    const evals = traces.map((trace) => evaluateTrace(trace));
    const report = aggregateEvals(def.metadata.id, evals);
    const generated = generateEvalReport(def.metadata.id, traces);

    assert.deepEqual(
      traces.map((trace) => trace.seed),
      seeds,
    );
    assert.equal(report.runCount, seeds.length);
    assert.deepEqual(generated, report);

    for (const trace of traces) {
      assert.equal(trace.gameDefId, def.metadata.id);
      assert.equal(trace.stopReason, 'terminal');
      assert.deepEqual(evaluateTrace(trace), evaluateTrace(trace));
    }

    const boundedMetricNames = ['actionDiversity', 'interactionProxy', 'dominantActionFreq'] as const;
    for (const evaluation of evals) {
      for (const metric of Object.values(evaluation.metrics)) {
        assert.equal(Number.isFinite(metric), true);
      }
      for (const metricName of boundedMetricNames) {
        const value = evaluation.metrics[metricName];
        assert.equal(value >= 0, true, `${metricName} should be >= 0`);
        assert.equal(value <= 1, true, `${metricName} should be <= 1`);
      }
    }

    for (const metric of Object.values(report.metrics)) {
      assert.equal(Number.isFinite(metric), true);
    }
    assert.equal(report.metrics.avgGameLength >= 0, true);
    assert.equal(report.metrics.avgBranchingFactor > 0, true);
  });

  it('detects noLegalMoves degeneracy on simulator-produced traces', () => {
    const def = createNoLegalMovesDef();
    const trace = runGame(def, 13, [rngDrivenAgent, rngDrivenAgent], 5);
    const evaluation = evaluateTrace(trace);

    assert.equal(trace.moves.length, 0);
    assert.equal(trace.stopReason, 'noLegalMoves');
    assert.deepEqual(evaluation.degeneracyFlags, [DegeneracyFlag.NO_LEGAL_MOVES]);

    const report = generateEvalReport(def.metadata.id, [trace]);
    assert.deepEqual(report.degeneracyFlags, [DegeneracyFlag.NO_LEGAL_MOVES]);
    assert.deepEqual(report.perSeed, [evaluation]);
  });

  it('keeps evaluator APIs on the explicit ./sim package surface', () => {
    const packageJsonPath = resolve(import.meta.dirname, '../../../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      exports?: Record<string, { import?: string; types?: string }>;
    };

    assert.deepEqual(packageJson.exports?.['./sim'], {
      import: './dist/src/sim/index.js',
      types: './dist/src/sim/index.d.ts',
    });
    assert.equal(packageJson.exports?.['.']?.import, './dist/src/kernel/index.js');
  });
});
