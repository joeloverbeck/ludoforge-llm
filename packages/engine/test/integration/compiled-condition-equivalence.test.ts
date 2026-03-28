import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  evalCondition,
  isEvalErrorCode,
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
      let compiledResult: boolean | undefined;
      let compiledError: unknown;
      try {
        compiledResult = sample.compiled(sample.state, sample.ctx.activePlayer, sample.bindings);
      } catch (error) {
        compiledError = error;
      }

      let interpretedResult: boolean | undefined;
      let interpretedError: unknown;
      try {
        interpretedResult = evalCondition(sample.entry.condition, sample.ctx);
      } catch (error) {
        interpretedError = error;
      }

      if (compiledError !== undefined || interpretedError !== undefined) {
        assert.notEqual(compiledError, undefined, `Compiled path should fail when interpreter fails for ${sample.entry.profileId}`);
        assert.notEqual(interpretedError, undefined, `Interpreter should fail when compiled path fails for ${sample.entry.profileId}`);
        if (isEvalErrorCode(compiledError, 'MISSING_BINDING')) {
          assert.ok(isEvalErrorCode(interpretedError, 'MISSING_BINDING'));
        } else if (isEvalErrorCode(compiledError, 'MISSING_VAR')) {
          assert.ok(isEvalErrorCode(interpretedError, 'MISSING_VAR'));
        } else if (isEvalErrorCode(compiledError, 'TYPE_MISMATCH')) {
          assert.ok(isEvalErrorCode(interpretedError, 'TYPE_MISMATCH'));
        } else {
          assert.fail(`Unexpected compiled predicate error for ${sample.entry.profileId}/${sample.entry.predicate}`);
        }
        continue;
      }

      assert.equal(
        compiledResult,
        interpretedResult,
        `Expected compiled parity for ${sample.entry.scope}:${sample.entry.profileId}:${sample.entry.stageIndex ?? 'pipeline'}:${sample.entry.predicate}`,
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
