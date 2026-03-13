import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_MCTS_CONFIG,
  validateMctsConfig,
  type MctsConfig,
} from '../../../../src/agents/mcts/config.js';

describe('MctsConfig defaults', () => {
  it('DEFAULT_MCTS_CONFIG has all required fields with spec-defined values', () => {
    const expected: MctsConfig = {
      iterations: 1500,
      minIterations: 128,
      explorationConstant: 1.4,
      maxSimulationDepth: 48,
      progressiveWideningK: 2.0,
      progressiveWideningAlpha: 0.5,
      templateCompletionsPerVisit: 2,
      rolloutPolicy: 'epsilonGreedy',
      rolloutEpsilon: 0.15,
      rolloutCandidateSample: 6,
      heuristicTemperature: 10_000,
      solverMode: 'off',
    };
    assert.deepEqual(DEFAULT_MCTS_CONFIG, expected);
  });

  it('DEFAULT_MCTS_CONFIG does not include diagnostics by default', () => {
    assert.equal(DEFAULT_MCTS_CONFIG.diagnostics, undefined);
  });
});

describe('validateMctsConfig', () => {
  it('returns DEFAULT_MCTS_CONFIG unchanged when called with empty object', () => {
    const result = validateMctsConfig({});
    assert.deepEqual(result, DEFAULT_MCTS_CONFIG);
  });

  it('overrides only the provided field when given { iterations: 500 }', () => {
    const result = validateMctsConfig({ iterations: 500 });
    assert.equal(result.iterations, 500);
    assert.equal(result.explorationConstant, DEFAULT_MCTS_CONFIG.explorationConstant);
    assert.equal(result.rolloutPolicy, DEFAULT_MCTS_CONFIG.rolloutPolicy);
  });

  it('throws RangeError when iterations is 0', () => {
    assert.throws(
      () => validateMctsConfig({ iterations: 0 }),
      (err: unknown) => err instanceof RangeError && /iterations/.test((err as RangeError).message),
    );
  });

  it('throws RangeError when iterations is negative', () => {
    assert.throws(
      () => validateMctsConfig({ iterations: -1 }),
      (err: unknown) => err instanceof RangeError && /iterations/.test((err as RangeError).message),
    );
  });

  it('throws RangeError when explorationConstant is 0', () => {
    assert.throws(
      () => validateMctsConfig({ explorationConstant: 0 }),
      (err: unknown) =>
        err instanceof RangeError && /explorationConstant/.test((err as RangeError).message),
    );
  });

  it('throws TypeError when rolloutPolicy is invalid', () => {
    assert.throws(
      () => validateMctsConfig({ rolloutPolicy: 'invalid' as 'random' }),
      (err: unknown) =>
        err instanceof TypeError && /rolloutPolicy/.test((err as TypeError).message),
    );
  });

  it('throws TypeError when solverMode is invalid', () => {
    assert.throws(
      () => validateMctsConfig({ solverMode: 'invalid' as 'off' }),
      (err: unknown) => err instanceof TypeError && /solverMode/.test((err as TypeError).message),
    );
  });

  it('preserves diagnostics when explicitly set', () => {
    const result = validateMctsConfig({ diagnostics: true });
    assert.equal(result.diagnostics, true);
  });

  it('throws RangeError for non-positive maxSimulationDepth', () => {
    assert.throws(
      () => validateMctsConfig({ maxSimulationDepth: 0 }),
      (err: unknown) =>
        err instanceof RangeError && /maxSimulationDepth/.test((err as RangeError).message),
    );
  });

  it('throws RangeError for non-positive templateCompletionsPerVisit', () => {
    assert.throws(
      () => validateMctsConfig({ templateCompletionsPerVisit: 0 }),
      (err: unknown) =>
        err instanceof RangeError
        && /templateCompletionsPerVisit/.test((err as RangeError).message),
    );
  });

  it('throws RangeError for negative rolloutEpsilon', () => {
    assert.throws(
      () => validateMctsConfig({ rolloutEpsilon: -0.1 }),
      (err: unknown) =>
        err instanceof RangeError && /rolloutEpsilon/.test((err as RangeError).message),
    );
  });

  it('throws RangeError for rolloutEpsilon greater than 1', () => {
    assert.throws(
      () => validateMctsConfig({ rolloutEpsilon: 1.5 }),
      (err: unknown) =>
        err instanceof RangeError && /rolloutEpsilon/.test((err as RangeError).message),
    );
  });

  it('throws RangeError for non-positive rolloutCandidateSample', () => {
    assert.throws(
      () => validateMctsConfig({ rolloutCandidateSample: 0 }),
      (err: unknown) =>
        err instanceof RangeError && /rolloutCandidateSample/.test((err as RangeError).message),
    );
  });

  it('throws RangeError for non-positive heuristicTemperature', () => {
    assert.throws(
      () => validateMctsConfig({ heuristicTemperature: 0 }),
      (err: unknown) =>
        err instanceof RangeError && /heuristicTemperature/.test((err as RangeError).message),
    );
  });

  it('accepts valid boundary values', () => {
    const result = validateMctsConfig({
      iterations: 1,
      minIterations: 0,
      explorationConstant: 0.001,
      rolloutEpsilon: 0,
      rolloutCandidateSample: 1,
    });
    assert.equal(result.iterations, 1);
    assert.equal(result.minIterations, 0);
    assert.equal(result.explorationConstant, 0.001);
    assert.equal(result.rolloutEpsilon, 0);
    assert.equal(result.rolloutCandidateSample, 1);
  });
});
