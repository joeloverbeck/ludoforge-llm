// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classifyMoveDecisionSequenceSatisfiability,
  materializeCompletionCertificate,
  resolveMoveDecisionSequence,
  resolveMoveEnumerationBudgets,
} from '../../src/kernel/index.js';
import { createPerfProfiler } from '../../src/kernel/perf-profiler.js';
import { createSpec139CertificateSearchFixture } from '../helpers/spec-139-certificate-search-fixture.js';

describe('Spec 139 I2 fixture certificate search', () => {
  it('produces a bounded certificate with deterministic diagnostics and nogoods on the synthetic 27-option witness', () => {
    const fixture = createSpec139CertificateSearchFixture();
    const budgets = resolveMoveEnumerationBudgets();
    const profiler = createPerfProfiler();

    const result = classifyMoveDecisionSequenceSatisfiability(
      fixture.def,
      fixture.state,
      fixture.move,
      {
        budgets,
        emitCompletionCertificate: true,
        validateSatisfiedMove: fixture.isSupportedMove,
        profiler,
      },
    );

    assert.equal(result.classification, 'satisfiable');
    assert.ok(result.certificate, 'expected certificate on satisfiable synthetic witness');
    assert.ok(result.certificate?.diagnostics, 'expected certificate diagnostics');
    assert.ok((result.certificate?.diagnostics?.probeStepsConsumed ?? 0) <= budgets.maxDecisionProbeSteps);
    assert.ok((result.certificate?.diagnostics?.paramExpansionsConsumed ?? 0) <= budgets.maxParamExpansions);
    assert.ok((result.certificate?.diagnostics?.nogoodsRecorded ?? 0) > 0);

    const materialized = materializeCompletionCertificate(
      fixture.def,
      fixture.state,
      fixture.move,
      result.certificate!,
    );
    const resolved = resolveMoveDecisionSequence(
      fixture.def,
      fixture.state,
      materialized,
      { choose: () => undefined },
    );

    assert.equal(fixture.isSupportedMove(materialized), true);
    assert.equal(resolved.complete, true);
  });
});
