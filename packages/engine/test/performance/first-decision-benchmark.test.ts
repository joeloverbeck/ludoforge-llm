import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { legalMoves, type GameDefRuntime, type LegalMoveEnumerationOptions } from '../../src/kernel/index.js';
import { buildFitlFirstDecisionParityFixture } from '../helpers/first-decision-production-helpers.js';

interface BenchmarkMeasurement {
  readonly totalMs: number;
  readonly totalMoves: number;
}

const FIXTURE = buildFitlFirstDecisionParityFixture();
const BENCHMARK_ITERATIONS = 12;

const measureLegalMovesCorpus = (
  runtime: GameDefRuntime,
  options?: LegalMoveEnumerationOptions,
): BenchmarkMeasurement => {
  let totalMoves = 0;
  const started = performance.now();

  for (let iteration = 0; iteration < BENCHMARK_ITERATIONS; iteration += 1) {
    for (const state of FIXTURE.stateCorpus) {
      totalMoves += legalMoves(FIXTURE.def, state, options, runtime).length;
    }
  }

  return {
    totalMs: performance.now() - started,
    totalMoves,
  };
};

const formatDeltaPercent = (compiledMs: number, baselineMs: number): string => {
  const deltaPercent = ((compiledMs - baselineMs) / baselineMs) * 100;
  const sign = deltaPercent > 0 ? '+' : '';
  return `${sign}${deltaPercent.toFixed(2)}%`;
};

const logBenchmarkResult = (
  label: string,
  compiled: BenchmarkMeasurement,
  disabled: BenchmarkMeasurement,
  options?: LegalMoveEnumerationOptions,
): void => {
  console.warn(
    [
      'FITL first-decision benchmark:',
      `mode=${label}`,
      `compiled=${compiled.totalMs.toFixed(2)}ms`,
      `disabled=${disabled.totalMs.toFixed(2)}ms`,
      `delta=${formatDeltaPercent(compiled.totalMs, disabled.totalMs)}`,
      `compiledMoves=${compiled.totalMoves}`,
      `disabledMoves=${disabled.totalMoves}`,
      `states=${FIXTURE.stateCorpus.length}`,
      `iterations=${BENCHMARK_ITERATIONS}`,
      `probePlainActionFeasibility=${options?.probePlainActionFeasibility === true}`,
      `actionCompiled=${FIXTURE.coverage.compiledActions}/${FIXTURE.coverage.totalActionsWithDecisions}`,
      `pipelineCompiled=${FIXTURE.coverage.compiledPipelines}/${FIXTURE.coverage.totalPipelineProfilesWithDecisions}`,
    ].join(' '),
  );
};

describe('first-decision benchmark', () => {
  it('emits FITL legalMoves timings with runtime first-decision guards enabled vs disabled', () => {
    assert.ok(FIXTURE.coverage.compiledActions > 0, 'Expected compiled FITL plain-action first-decision coverage');
    assert.ok(FIXTURE.coverage.compiledPipelines > 0, 'Expected compiled FITL pipeline first-decision coverage');
    assert.ok(FIXTURE.stateCorpus.length >= 8, 'Expected deterministic FITL corpus to include multiple progressed states');

    const compiledDefault = measureLegalMovesCorpus(FIXTURE.runtime);
    const disabledDefault = measureLegalMovesCorpus(FIXTURE.runtimeWithDisabledGuards);
    const compiledProbe = measureLegalMovesCorpus(FIXTURE.runtime, { probePlainActionFeasibility: true });
    const disabledProbe = measureLegalMovesCorpus(FIXTURE.runtimeWithDisabledGuards, { probePlainActionFeasibility: true });

    logBenchmarkResult('default', compiledDefault, disabledDefault);
    logBenchmarkResult(
      'probePlainActionFeasibility',
      compiledProbe,
      disabledProbe,
      { probePlainActionFeasibility: true },
    );

    assert.equal(compiledDefault.totalMoves, disabledDefault.totalMoves, 'Expected benchmark setup to preserve default legalMoves totals');
    assert.equal(compiledProbe.totalMoves, disabledProbe.totalMoves, 'Expected benchmark setup to preserve probe legalMoves totals');
    assert.ok(Number.isFinite(compiledDefault.totalMs) && compiledDefault.totalMs >= 0);
    assert.ok(Number.isFinite(disabledDefault.totalMs) && disabledDefault.totalMs >= 0);
    assert.ok(Number.isFinite(compiledProbe.totalMs) && compiledProbe.totalMs >= 0);
    assert.ok(Number.isFinite(disabledProbe.totalMs) && disabledProbe.totalMs >= 0);
  });
});
