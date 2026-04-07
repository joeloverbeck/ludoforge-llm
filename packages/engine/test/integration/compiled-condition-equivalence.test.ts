import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createEnumerationSnapshot,
  evalCondition,
  isEvalErrorCode,
  unwrapEvalCondition,
  MISSING_BINDING_POLICY_CONTEXTS,
  shouldDeferMissingBinding,
} from '../../src/kernel/index.js';
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

const assertCompatiblePredicateError = (actual: unknown, expected: unknown, label: string): void => {
  assert.notEqual(actual, undefined, `${label} should fail when the comparison path fails`);
  assert.notEqual(expected, undefined, `${label} comparison error should be present`);
  if (isEvalErrorCode(actual, 'MISSING_BINDING')) {
    assert.ok(isEvalErrorCode(expected, 'MISSING_BINDING'));
    return;
  }
  if (isEvalErrorCode(actual, 'MISSING_VAR')) {
    assert.ok(isEvalErrorCode(expected, 'MISSING_VAR'));
    return;
  }
  if (isEvalErrorCode(actual, 'TYPE_MISMATCH')) {
    assert.ok(isEvalErrorCode(expected, 'TYPE_MISMATCH'));
    return;
  }
  assert.fail(`Unexpected predicate error for ${label}`);
};

describe('compiled FITL production predicate equivalence', () => {
  it('reports descriptive coverage for production pipeline and stage predicates', () => {
    console.warn(
      [
        'FITL compiled predicate coverage:',
        `total=${COVERAGE.total}`,
        `boolean=${COVERAGE.booleanLiteral}`,
        `compiled=${COVERAGE.compiled}`,
        `fallback=${COVERAGE.fallback}`,
        `states=${STATE_CORPUS.length}`,
        `samples=${SAMPLES.length}`,
      ].join(' '),
    );

    assert.ok(COVERAGE.total > 0, 'Expected FITL to expose production pipeline/stage predicates');
    assert.ok(COVERAGE.compiled > 0, 'Expected FITL to include compilable production predicates');
    assert.ok(STATE_CORPUS.length >= 8, 'Expected deterministic FITL state corpus to include progressed states');
    assert.ok(SAMPLES.length > 0, 'Expected compiled predicate samples for equivalence validation');
  });

  it('matches interpreter results across the compiled production predicate corpus', () => {
    for (const sample of SAMPLES) {
      const snapshot = createEnumerationSnapshot(sample.ctx.def, sample.state);
      let compiledResult: boolean | undefined;
      let compiledError: unknown;
      try {
        compiledResult = sample.compiled(sample.state, sample.ctx.activePlayer, sample.bindings);
      } catch (error) {
        compiledError = error;
      }

      let snapshotCompiledResult: boolean | undefined;
      let snapshotCompiledError: unknown;
      try {
        snapshotCompiledResult = sample.compiled(sample.state, sample.ctx.activePlayer, sample.bindings, snapshot);
      } catch (error) {
        snapshotCompiledError = error;
      }

      let interpretedResult: boolean | undefined;
      let interpretedError: unknown;
      try {
        interpretedResult = unwrapEvalCondition(evalCondition(sample.entry.condition, sample.ctx));
      } catch (error) {
        interpretedError = error;
      }

      const label = `${sample.entry.scope}:${sample.entry.profileId}:${sample.entry.stageIndex ?? 'pipeline'}:${sample.entry.predicate}`;
      if (compiledError !== undefined || snapshotCompiledError !== undefined || interpretedError !== undefined) {
        assertCompatiblePredicateError(compiledError, interpretedError, `${label}:compiled-vs-interpreter`);
        assertCompatiblePredicateError(snapshotCompiledError, interpretedError, `${label}:snapshot-vs-interpreter`);
        assertCompatiblePredicateError(snapshotCompiledError, compiledError, `${label}:snapshot-vs-raw-compiled`);
        continue;
      }

      assert.equal(
        compiledResult,
        interpretedResult,
        `Expected compiled parity for ${label}`,
      );
      assert.equal(
        snapshotCompiledResult,
        interpretedResult,
        `Expected snapshot parity for ${label}`,
      );
      assert.equal(
        snapshotCompiledResult,
        compiledResult,
        `Expected snapshot-vs-raw compiled parity for ${label}`,
      );
    }
  });

  it('preserves missing-binding deferral compatibility for production predicates', () => {
    let observedMissingBinding = 0;

    for (const sample of SAMPLES) {
      try {
        sample.compiled(sample.state, sample.ctx.activePlayer, sample.bindings);
      } catch (compiledError) {
        if (!isEvalErrorCode(compiledError, 'MISSING_BINDING')) {
          continue;
        }

        observedMissingBinding += 1;
        assert.equal(
          shouldDeferMissingBinding(
            compiledError,
            MISSING_BINDING_POLICY_CONTEXTS.PIPELINE_DISCOVERY_PREDICATE,
          ),
          true,
        );

        assert.throws(
          () => evalCondition(sample.entry.condition, sample.ctx),
          (interpretedError: unknown) => isEvalErrorCode(interpretedError, 'MISSING_BINDING'),
        );
      }
    }

    assert.ok(observedMissingBinding > 0, 'Expected at least one production predicate sample to exercise missing-binding behavior');
  });
});
