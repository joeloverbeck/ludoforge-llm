// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COMPILED_POLICY_CARRIERS,
  COMPILED_POLICY_EXPR_KINDS,
  collectCompiledConsiderationSamples,
  collectSyntheticCompiledPolicyExpressionSamples,
  evaluateAstConsiderationSample,
  evaluateAstExpressionSample,
  evaluateCompiledConsiderationSample,
  evaluateCompiledExpressionSample,
  loadCompiledPolicyFixtures,
  summarizeCompiledPolicyCoverage,
} from '../../helpers/compiled-policy-production-helpers.js';

describe('compiled policy evaluator scaffold', () => {
  it('emits descriptor coverage for every production policy expression carrier', () => {
    const fixtures = loadCompiledPolicyFixtures();
    const coverage = summarizeCompiledPolicyCoverage(fixtures);
    const syntheticKinds = new Set(
      collectSyntheticCompiledPolicyExpressionSamples(fixtures).map((sample) => sample.compiled.kind),
    );

    assert.ok(coverage.totalConsiderations > 0, 'expected production policy considerations');
    assert.equal(
      coverage.compiledConsiderations,
      coverage.totalConsiderations,
      'expected every production consideration to have a compiled descriptor',
    );
    for (const carrier of COMPILED_POLICY_CARRIERS) {
      assert.equal(
        coverage.compiledCarrierTotals[carrier],
        coverage.carrierTotals[carrier],
        `expected every ${carrier} entry to have a compiled descriptor`,
      );
    }
    for (const kind of COMPILED_POLICY_EXPR_KINDS) {
      assert.ok(
        (coverage.expressionKinds[kind] ?? 0) > 0 || syntheticKinds.has(kind),
        `expected ${kind} descriptors in production coverage or generic synthetic parity coverage`,
      );
    }
  });

  it('matches interpreted consideration scores for the compiled descriptor corpus', () => {
    const fixtures = loadCompiledPolicyFixtures();
    const samples = collectCompiledConsiderationSamples(fixtures);

    assert.ok(samples.length > 0, 'expected compiled consideration samples');

    for (const fixture of fixtures) {
      const catalog = fixture.def.agents;
      assert.ok(catalog, `${fixture.label} should compile an agent catalog`);
      for (const sample of samples.filter((entry) => entry.fixtureLabel === fixture.label)) {
        const astScore = evaluateAstConsiderationSample(fixture.def, catalog, sample);
        const compiledScore = evaluateCompiledConsiderationSample(fixture.def, catalog, sample);
        assert.equal(
          compiledScore,
          astScore,
          `${fixture.label}/${sample.profileId}/${sample.considerationId} compiled score should match AST score`,
        );
      }
    }
  });

  it('matches interpreted expression values for production-absent descriptor kinds', () => {
    const fixtures = loadCompiledPolicyFixtures();
    const samples = collectSyntheticCompiledPolicyExpressionSamples(fixtures);

    assert.ok(samples.length > 0, 'expected synthetic compiled expression samples');

    for (const sample of samples) {
      const fixture = fixtures.find((entry) => sample.fixtureLabel.startsWith(entry.label));
      assert.ok(fixture, `${sample.fixtureLabel} should reference a production fixture`);
      const catalog = fixture.def.agents;
      assert.ok(catalog, `${fixture.label} should compile an agent catalog`);
      assert.equal(
        evaluateCompiledExpressionSample(fixture.def, catalog, sample),
        evaluateAstExpressionSample(fixture.def, catalog, sample),
        `${sample.fixtureLabel} compiled expression should match AST expression`,
      );
    }
  });
});
