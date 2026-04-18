// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evalCondition, isEvalErrorCode } from '../../src/kernel/index.js';
import {
  buildCompiledPredicateSamples,
  buildDeterministicFitlStateCorpus,
  compileFitlValidatedGameDef,
  summarizePredicateCoverage,
} from '../helpers/compiled-condition-production-helpers.js';

const DEF = compileFitlValidatedGameDef();
const COVERAGE = summarizePredicateCoverage(DEF);
const STATE_CORPUS = buildDeterministicFitlStateCorpus(DEF);
const SAMPLES = buildCompiledPredicateSamples(DEF, STATE_CORPUS);
const BENCHMARK_ITERATIONS = 20;

const assertParityDuringBenchmarkSetup = (): void => {
  for (const sample of SAMPLES) {
    try {
      const compiled = sample.compiled(sample.ctx);
      const interpreted = evalCondition(sample.entry.condition, sample.ctx);
      assert.equal(compiled, interpreted);
    } catch (error) {
      if (
        isEvalErrorCode(error, 'MISSING_BINDING') ||
        isEvalErrorCode(error, 'MISSING_VAR') ||
        isEvalErrorCode(error, 'TYPE_MISMATCH')
      ) {
        continue;
      }
      throw error;
    }
  }
};

const measure = (label: string, run: () => void): number => {
  const started = performance.now();
  run();
  const elapsed = performance.now() - started;
  console.warn(`${label}: ${elapsed.toFixed(2)}ms`);
  return elapsed;
};

describe('compiled condition benchmark', () => {
  it('emits compiled-vs-interpreted timings for the FITL production predicate corpus', () => {
    assert.ok(COVERAGE.compiled > 0, 'Expected compiled FITL predicates for benchmark coverage');
    assert.ok(SAMPLES.length > 0, 'Expected compiled predicate samples for benchmarking');

    assertParityDuringBenchmarkSetup();

    const compiledMs = measure('compiled predicate corpus', () => {
      for (let iteration = 0; iteration < BENCHMARK_ITERATIONS; iteration += 1) {
        for (const sample of SAMPLES) {
          try {
            sample.compiled(sample.ctx);
          } catch {
            // Benchmark parity was already validated during setup.
          }
        }
      }
    });

    const interpretedMs = measure('interpreted predicate corpus', () => {
      for (let iteration = 0; iteration < BENCHMARK_ITERATIONS; iteration += 1) {
        for (const sample of SAMPLES) {
          try {
            evalCondition(sample.entry.condition, sample.ctx);
          } catch {
            // Benchmark parity was already validated during setup.
          }
        }
      }
    });

    const deltaPercent = ((compiledMs - interpretedMs) / interpretedMs) * 100;
    const sign = deltaPercent > 0 ? '+' : '';
    console.warn(
      [
        'FITL compiled predicate benchmark:',
        `compiled=${compiledMs.toFixed(2)}ms`,
        `interpreted=${interpretedMs.toFixed(2)}ms`,
        `delta=${sign}${deltaPercent.toFixed(2)}%`,
        `compiledPredicates=${COVERAGE.compiled}`,
        `states=${STATE_CORPUS.length}`,
        `samples=${SAMPLES.length}`,
        `iterations=${BENCHMARK_ITERATIONS}`,
      ].join(' '),
    );

    assert.ok(Number.isFinite(compiledMs) && compiledMs >= 0);
    assert.ok(Number.isFinite(interpretedMs) && interpretedMs >= 0);
  });
});
